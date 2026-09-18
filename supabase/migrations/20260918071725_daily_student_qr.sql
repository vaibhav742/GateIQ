-- Daily generate-on-demand QR: valid until campus midnight (Asia/Kolkata).
-- Scanner never mints a QR. Legacy tokens with NULL expires_at are expired.

CREATE OR REPLACE FUNCTION private.student_scan_card(p_student public.profiles)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', p_student.id,
    'name', p_student.full_name,
    'roll_number', p_student.roll_number,
    'batch', p_student.batch,
    'hostel', p_student.hostel,
    'room_number', p_student.room_number,
    'phone', p_student.phone,
    'account_status', p_student.status,
    'id_card_path', p_student.id_card_path
  );
$$;

CREATE OR REPLACE FUNCTION private.qr_is_live(p_qr public.student_qr_codes)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p_qr.status = 'active'
    AND p_qr.expires_at IS NOT NULL
    AND p_qr.expires_at > now();
$$;

CREATE OR REPLACE FUNCTION private.qr_not_live_response(
  p_qr public.student_qr_codes,
  p_student public.profiles
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_qr.expires_at IS NULL OR p_qr.expires_at <= now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'QR_EXPIRED',
      'message', 'This QR expired at midnight. Ask the student to generate today''s QR in GateIQ.',
      'student', private.student_scan_card(p_student)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'code', 'QR_REVOKED',
    'message', 'This QR was replaced. Ask the student to show today''s campus ID.',
    'student', private.student_scan_card(p_student)
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.issue_student_qr(p_student_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text;
BEGIN
  UPDATE public.student_qr_codes
  SET status = 'revoked'
  WHERE student_id = p_student_id
    AND status = 'active';

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  INSERT INTO public.student_qr_codes (student_id, token, status, expires_at)
  VALUES (
    p_student_id,
    v_token,
    'active',
    private.campus_day_end(private.campus_today())
  );

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION private.ensure_student_qr()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role <> 'student' OR NEW.status <> 'active' THEN
    UPDATE public.student_qr_codes
    SET status = 'revoked'
    WHERE student_id = NEW.id
      AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_student_by_qr(p_qr_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text;
  v_qr public.student_qr_codes%ROWTYPE;
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

  IF NOT private.is_staff() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'You are not allowed to scan campus IDs.');
  END IF;

  v_token := private.parse_qr_token(p_qr_token);
  IF v_token IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'QR_INVALID', 'message', 'This QR is invalid or has been revoked.');
  END IF;

  SELECT * INTO v_qr FROM public.student_qr_codes WHERE token = v_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'QR_INVALID', 'message', 'This QR is invalid or has been revoked.');
  END IF;

  SELECT * INTO v_student FROM public.profiles WHERE id = v_qr.student_id;
  IF NOT FOUND OR v_student.role <> 'student' THEN
    RETURN jsonb_build_object('success', false, 'code', 'QR_INVALID', 'message', 'This QR is invalid or has been revoked.');
  END IF;

  IF v_student.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'STUDENT_INACTIVE',
      'message', 'This student''s campus account is inactive. Please contact administration.'
    );
  END IF;

  IF NOT private.qr_is_live(v_qr) THEN
    RETURN private.qr_not_live_response(v_qr, v_student);
  END IF;

  IF private.is_security() THEN
    SELECT g.* INTO v_gate FROM public.gates g WHERE g.id = private.assigned_gate_id();
    IF v_gate.id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'NO_GATE', 'message', 'You are not assigned to an active gate.');
    END IF;
  END IF;

  v_status := private.student_status_for_day(v_student.id, private.campus_today());
  v_next := CASE v_status WHEN 'INSIDE' THEN 'EXIT' ELSE 'ENTRY' END;

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
    'student', private.student_scan_card(v_student),
    'campus_status', v_status,
    'next_action', v_next,
    'gate', CASE WHEN v_gate.id IS NULL THEN NULL ELSE jsonb_build_object('id', v_gate.id, 'name', v_gate.name) END,
    'last_event', CASE WHEN v_last.id IS NULL THEN NULL ELSE jsonb_build_object(
      'action', v_last.action,
      'timestamp', v_last.timestamp,
      'gate', v_last_gate
    ) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_campus_movement(
  p_qr_token text,
  p_device_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text;
  v_qr public.student_qr_codes%ROWTYPE;
  v_student public.profiles%ROWTYPE;
  v_gate public.gates%ROWTYPE;
  v_status text;
  v_action text;
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

  v_token := private.parse_qr_token(p_qr_token);
  IF v_token IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'QR_INVALID', 'message', 'This QR is invalid or has been revoked.');
  END IF;

  SELECT * INTO v_qr FROM public.student_qr_codes WHERE token = v_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'QR_INVALID', 'message', 'This QR is invalid or has been revoked.');
  END IF;

  SELECT * INTO v_student FROM public.profiles WHERE id = v_qr.student_id;
  IF NOT FOUND OR v_student.role <> 'student' THEN
    RETURN jsonb_build_object('success', false, 'code', 'QR_INVALID', 'message', 'This QR is invalid or has been revoked.');
  END IF;

  IF v_student.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'STUDENT_INACTIVE',
      'message', 'This student''s campus account is inactive. Please contact administration.'
    );
  END IF;

  IF NOT private.qr_is_live(v_qr) THEN
    RETURN private.qr_not_live_response(v_qr, v_student);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_student.id::text));

  v_status := private.student_status_for_day(v_student.id, private.campus_today());

  IF v_status = 'INSIDE' THEN
    v_action := 'EXIT';
  ELSIF v_status IN ('OUTSIDE', 'UNKNOWN') THEN
    v_action := 'ENTRY';
  ELSE
    v_action := 'ENTRY';
  END IF;

  IF v_status = 'INSIDE' AND v_action = 'ENTRY' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_INSIDE',
      'message', 'This student was already marked as inside campus.',
      'campus_status', 'INSIDE',
      'student', jsonb_build_object('name', v_student.full_name, 'roll_number', v_student.roll_number)
    );
  END IF;

  IF v_status = 'OUTSIDE' AND v_action = 'EXIT' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_OUTSIDE',
      'message', 'This student was already marked as outside campus.',
      'campus_status', 'OUTSIDE',
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
    'QR',
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
    'timestamp', v_log.timestamp
  );
END;
$$;
