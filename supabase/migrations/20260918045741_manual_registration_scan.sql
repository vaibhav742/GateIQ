-- Manual registration-number fallback for security scans.
-- Existing QR lookup/record RPCs are unchanged. Logs already store verification_method.

ALTER TABLE public.entry_exit_logs
  DROP CONSTRAINT IF EXISTS entry_exit_logs_verification_method_check;

ALTER TABLE public.entry_exit_logs
  ADD CONSTRAINT entry_exit_logs_verification_method_check
  CHECK (verification_method IN ('QR', 'MANUAL', 'ADMIN_OVERRIDE'));

CREATE OR REPLACE FUNCTION private.normalize_roll_number(p_roll text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT nullif(
    upper(replace(regexp_replace(btrim(COALESCE(p_roll, '')), '\s+', '', 'g'), '-', '/')),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION private.find_student_by_roll(p_roll text)
RETURNS public.profiles
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_roll text;
  v_student public.profiles%ROWTYPE;
BEGIN
  v_roll := private.normalize_roll_number(p_roll);
  IF v_roll IS NULL OR v_roll !~ '^[0-9]{3,8}/[0-9]{2,4}$' THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_student
  FROM public.profiles
  WHERE role = 'student'
    AND upper(regexp_replace(COALESCE(roll_number, ''), '\s+', '', 'g')) = v_roll
  LIMIT 1;

  RETURN v_student;
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_student_by_roll(p_roll_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_roll text;
  v_student public.profiles%ROWTYPE;
  v_gate public.gates%ROWTYPE;
  v_status text;
  v_next text;
  v_last public.entry_exit_logs%ROWTYPE;
  v_last_gate text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED', 'message', 'Please sign in.');
  END IF;

  IF NOT private.is_security() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Only security personnel can look up students by registration number.');
  END IF;

  SELECT g.* INTO v_gate
  FROM public.gates g
  WHERE g.id = private.assigned_gate_id();

  IF v_gate.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_GATE', 'message', 'You are not assigned to an active gate.');
  END IF;

  v_roll := private.normalize_roll_number(p_roll_number);
  IF v_roll IS NULL OR v_roll !~ '^[0-9]{3,8}/[0-9]{2,4}$' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_ROLL',
      'message', 'Enter a registration number like 0308/63.'
    );
  END IF;

  v_student := private.find_student_by_roll(v_roll);
  IF v_student.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'STUDENT_NOT_FOUND',
      'message', 'No student found with that registration number.'
    );
  END IF;

  IF v_student.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'STUDENT_INACTIVE',
      'message', 'This student''s campus account is inactive. Please contact administration.'
    );
  END IF;

  v_status := private.student_status_for_day(v_student.id, private.campus_today());
  v_next := CASE v_status
    WHEN 'INSIDE' THEN 'EXIT'
    ELSE 'ENTRY'
  END;

  SELECT * INTO v_last
  FROM public.entry_exit_logs
  WHERE student_id = v_student.id
    AND timestamp >= private.campus_day_start(private.campus_today())
    AND timestamp < private.campus_day_end(private.campus_today())
  ORDER BY timestamp DESC, created_at DESC
  LIMIT 1;

  IF v_last.gate_id IS NOT NULL THEN
    SELECT name INTO v_last_gate FROM public.gates WHERE id = v_last.gate_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'student', jsonb_build_object(
      'id', v_student.id,
      'name', v_student.full_name,
      'roll_number', v_student.roll_number,
      'batch', v_student.batch,
      'section', v_student.section,
      'account_status', v_student.status
    ),
    'campus_status', v_status,
    'next_action', v_next,
    'gate', jsonb_build_object('id', v_gate.id, 'name', v_gate.name),
    'last_event', CASE WHEN v_last.id IS NULL THEN NULL ELSE jsonb_build_object(
      'action', v_last.action,
      'timestamp', v_last.timestamp,
      'gate', v_last_gate
    ) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_campus_movement_manual(
  p_roll_number text,
  p_action text,
  p_device_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_roll text;
  v_action text;
  v_student public.profiles%ROWTYPE;
  v_gate public.gates%ROWTYPE;
  v_status text;
  v_last public.entry_exit_logs%ROWTYPE;
  v_log public.entry_exit_logs%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED', 'message', 'Please sign in.');
  END IF;

  IF NOT private.is_security() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Only security personnel can record entry and exit.');
  END IF;

  SELECT g.* INTO v_gate
  FROM public.gates g
  WHERE g.id = private.assigned_gate_id();

  IF v_gate.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_GATE', 'message', 'You are not assigned to an active gate.');
  END IF;

  v_roll := private.normalize_roll_number(p_roll_number);
  IF v_roll IS NULL OR v_roll !~ '^[0-9]{3,8}/[0-9]{2,4}$' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_ROLL',
      'message', 'Enter a registration number like 0308/63.'
    );
  END IF;

  v_action := upper(btrim(COALESCE(p_action, '')));
  IF v_action = 'ENTER' THEN
    v_action := 'ENTRY';
  END IF;

  IF v_action NOT IN ('ENTRY', 'EXIT') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_ACTION', 'message', 'Action must be ENTRY or EXIT.');
  END IF;

  v_student := private.find_student_by_roll(v_roll);
  IF v_student.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'STUDENT_NOT_FOUND',
      'message', 'No student found with that registration number.'
    );
  END IF;

  IF v_student.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'STUDENT_INACTIVE',
      'message', 'This student''s campus account is inactive. Please contact administration.'
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_student.id::text));

  SELECT * INTO v_last
  FROM public.entry_exit_logs
  WHERE student_id = v_student.id
    AND timestamp >= private.campus_day_start(private.campus_today())
    AND timestamp < private.campus_day_end(private.campus_today())
  ORDER BY timestamp DESC, created_at DESC
  LIMIT 1;

  v_status := private.student_status_for_day(v_student.id, private.campus_today());

  IF v_last.id IS NOT NULL AND v_last.action = v_action THEN
    IF v_action = 'ENTRY' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'ALREADY_INSIDE',
        'message', 'This student was already marked as inside campus.',
        'campus_status', 'INSIDE',
        'student', jsonb_build_object('name', v_student.full_name, 'roll_number', v_student.roll_number)
      );
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_OUTSIDE',
      'message', 'This student was already marked as outside campus.',
      'campus_status', 'OUTSIDE',
      'student', jsonb_build_object('name', v_student.full_name, 'roll_number', v_student.roll_number)
    );
  END IF;

  IF v_action = 'ENTRY' AND v_status = 'INSIDE' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_INSIDE',
      'message', 'This student was already marked as inside campus.',
      'campus_status', 'INSIDE',
      'student', jsonb_build_object('name', v_student.full_name, 'roll_number', v_student.roll_number)
    );
  END IF;

  IF v_action = 'EXIT' AND v_status = 'OUTSIDE' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_OUTSIDE',
      'message', 'This student was already marked as outside campus.',
      'campus_status', 'OUTSIDE',
      'student', jsonb_build_object('name', v_student.full_name, 'roll_number', v_student.roll_number)
    );
  END IF;

  IF v_action = 'EXIT' AND v_status = 'UNKNOWN' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NO_ENTRY_TODAY',
      'message', 'This student has no entry recorded today. Record ENTRY first.',
      'campus_status', 'UNKNOWN',
      'student', jsonb_build_object('name', v_student.full_name, 'roll_number', v_student.roll_number)
    );
  END IF;

  INSERT INTO public.entry_exit_logs (
    student_id,
    gate_id,
    action,
    recorded_by,
    verification_method,
    device_id,
    is_admin_override
  )
  VALUES (
    v_student.id,
    v_gate.id,
    v_action,
    (SELECT auth.uid()),
    'MANUAL',
    p_device_id,
    false
  )
  RETURNING * INTO v_log;

  RETURN jsonb_build_object(
    'success', true,
    'student', jsonb_build_object(
      'id', v_student.id,
      'name', v_student.full_name,
      'roll_number', v_student.roll_number,
      'batch', v_student.batch,
      'section', v_student.section
    ),
    'action', v_log.action,
    'status', CASE v_log.action WHEN 'ENTRY' THEN 'INSIDE' ELSE 'OUTSIDE' END,
    'gate', v_gate.name,
    'timestamp', v_log.timestamp,
    'verification_method', v_log.verification_method
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_student_by_roll(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_campus_movement_manual(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_student_by_roll(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_campus_movement_manual(text, text, text) TO authenticated;
