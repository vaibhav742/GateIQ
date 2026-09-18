-- Hostel, room number, and 10-digit mobile on student registration.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hostel text,
  ADD COLUMN IF NOT EXISTS room_number text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_hostel_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_hostel_check
  CHECK (hostel IS NULL OR hostel IN ('Annexe', 'Tagore', 'LVH', 'OH', 'NH'));

CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_name text;
  v_first text;
  v_last text;
  v_slug text;
  v_serial text;
  v_form public.registration_forms%ROWTYPE;
  v_batch public.batches%ROWTYPE;
  v_roll text;
  v_domain text;
  v_email text;
  v_status text;
  v_reg_status text;
  v_hostel text;
  v_room text;
  v_phone text;
BEGIN
  v_role := NULLIF(btrim(COALESCE(NEW.raw_app_meta_data->>'role', '')), '');
  v_first := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'first_name', '')), '');
  v_last := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'last_name', '')), '');
  v_name := COALESCE(
    NULLIF(btrim(COALESCE(v_first, '') || ' ' || COALESCE(v_last, '')), ''),
    NEW.raw_user_meta_data->>'full_name',
    split_part(COALESCE(NEW.email, 'user'), '@', 1)
  );
  v_slug := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'registration_slug', '')), '');
  v_serial := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'registration_serial', '')), '');
  v_email := lower(btrim(COALESCE(NEW.email, '')));
  v_hostel := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'hostel', '')), '');
  v_room := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'room_number', '')), '');
  v_phone := NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'phone', ''), '\s+', '', 'g'), '');

  IF v_slug IS NULL THEN
    IF v_role IS NULL OR v_role NOT IN ('student', 'security', 'admin') THEN
      RAISE EXCEPTION 'REGISTRATION_CLOSED';
    END IF;

    INSERT INTO public.profiles (id, email, full_name, first_name, last_name, role)
    VALUES (NEW.id, NEW.email, v_name, v_first, v_last, v_role)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END IF;

  SELECT * INTO v_form
  FROM public.registration_forms
  WHERE slug = lower(v_slug);

  IF v_form.id IS NULL OR v_form.status <> 'active' THEN
    RAISE EXCEPTION 'REGISTRATION_CLOSED';
  END IF;

  SELECT * INTO v_batch FROM public.batches WHERE id = v_form.batch_id;
  IF v_batch.id IS NULL OR v_batch.status <> 'active' THEN
    RAISE EXCEPTION 'REGISTRATION_CLOSED';
  END IF;

  v_domain := private.normalize_email_domain(v_form.email_domain);
  IF v_email IS NULL OR v_email = '' OR v_email NOT LIKE '%@' || v_domain THEN
    RAISE EXCEPTION 'INVALID_EMAIL_DOMAIN';
  END IF;

  v_roll := private.build_registration_number(v_serial, v_batch.batch_number);
  IF v_roll IS NULL THEN
    RAISE EXCEPTION 'INVALID_ROLL';
  END IF;

  IF v_hostel IS NULL OR v_hostel NOT IN ('Annexe', 'Tagore', 'LVH', 'OH', 'NH') THEN
    RAISE EXCEPTION 'INVALID_HOSTEL';
  END IF;

  IF v_room IS NULL OR length(v_room) > 16 THEN
    RAISE EXCEPTION 'INVALID_ROOM';
  END IF;

  IF v_phone IS NULL OR v_phone !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'INVALID_PHONE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE lower(COALESCE(p.email, '')) = v_email
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_EMAIL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.roll_number = v_roll
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_ROLL';
  END IF;

  IF COALESCE(v_form.auto_approve, true) THEN
    v_status := 'active';
    v_reg_status := 'active';
  ELSE
    v_status := 'inactive';
    v_reg_status := 'pending';
  END IF;

  INSERT INTO public.profiles (
    id, email, full_name, first_name, last_name, role, status,
    roll_number, batch, batch_id, registration_form_id, registration_status, registered_at,
    hostel, room_number, phone
  )
  VALUES (
    NEW.id, NEW.email, v_name, v_first, v_last, 'student', v_status,
    v_roll, v_batch.batch_number, v_batch.id, v_form.id, v_reg_status, now(),
    v_hostel, v_room, v_phone
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.get_campus_status_board(date, text, text, text);

CREATE OR REPLACE FUNCTION public.get_campus_status_board(
  p_day date DEFAULT NULL,
  p_status text DEFAULT 'ALL',
  p_search text DEFAULT NULL,
  p_batch text DEFAULT NULL
)
RETURNS TABLE (
  student_id uuid,
  full_name text,
  roll_number text,
  batch text,
  section text,
  hostel text,
  room_number text,
  campus_status text,
  last_action text,
  last_gate_id uuid,
  last_gate_name text,
  last_activity timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_day date;
  v_start timestamptz;
  v_end timestamptz;
  v_search text;
  v_batch text;
BEGIN
  IF NOT private.is_staff() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_day := COALESCE(p_day, private.campus_today());
  v_start := private.campus_day_start(v_day);
  v_end := private.campus_day_end(v_day);
  v_search := nullif(trim(both FROM COALESCE(p_search, '')), '');
  v_batch := nullif(trim(both FROM COALESCE(p_batch, '')), '');

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (e.student_id)
      e.student_id,
      e.action,
      e.gate_id,
      e.timestamp
    FROM public.entry_exit_logs e
    WHERE e.timestamp >= v_start
      AND e.timestamp < v_end
    ORDER BY e.student_id, e.timestamp DESC, e.created_at DESC
  )
  SELECT
    p.id,
    p.full_name,
    p.roll_number,
    p.batch,
    p.section,
    p.hostel,
    p.room_number,
    COALESCE(
      CASE l.action
        WHEN 'ENTRY' THEN 'INSIDE'
        WHEN 'EXIT' THEN 'OUTSIDE'
      END,
      'UNKNOWN'
    ) AS campus_status,
    l.action,
    l.gate_id,
    g.name,
    l.timestamp
  FROM public.profiles p
  LEFT JOIN latest l ON l.student_id = p.id
  LEFT JOIN public.gates g ON g.id = l.gate_id
  WHERE p.role = 'student'
    AND p.status = 'active'
    AND (v_batch IS NULL OR p.batch = v_batch)
    AND (
      COALESCE(p_status, 'ALL') = 'ALL'
      OR COALESCE(
        CASE l.action
          WHEN 'ENTRY' THEN 'INSIDE'
          WHEN 'EXIT' THEN 'OUTSIDE'
        END,
        'UNKNOWN'
      ) = p_status
    )
    AND (
      v_search IS NULL
      OR p.full_name ILIKE '%' || v_search || '%'
      OR COALESCE(p.roll_number, '') ILIKE '%' || v_search || '%'
    )
  ORDER BY p.roll_number NULLS LAST, p.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campus_status_board(date, text, text, text) TO authenticated;

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

  IF v_qr.status <> 'active' OR (v_qr.expires_at IS NOT NULL AND v_qr.expires_at < now()) THEN
    RETURN jsonb_build_object('success', false, 'code', 'QR_REVOKED', 'message', 'This QR is invalid or has been revoked.');
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
    'student', jsonb_build_object(
      'id', v_student.id,
      'name', v_student.full_name,
      'roll_number', v_student.roll_number,
      'batch', v_student.batch,
      'hostel', v_student.hostel,
      'room_number', v_student.room_number,
      'phone', v_student.phone,
      'account_status', v_student.status
    ),
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
    'student', jsonb_build_object(
      'id', v_student.id,
      'name', v_student.full_name,
      'roll_number', v_student.roll_number,
      'batch', v_student.batch,
      'hostel', v_student.hostel,
      'room_number', v_student.room_number,
      'phone', v_student.phone,
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

CREATE OR REPLACE FUNCTION private.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF private.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'You cannot change account roles.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'You cannot change account status.';
  END IF;

  IF NEW.roll_number IS DISTINCT FROM OLD.roll_number THEN
    RAISE EXCEPTION 'You cannot change roll numbers.';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'You cannot change email addresses.';
  END IF;

  IF NEW.batch IS DISTINCT FROM OLD.batch
    OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
    OR NEW.registration_status IS DISTINCT FROM OLD.registration_status
    OR NEW.registration_form_id IS DISTINCT FROM OLD.registration_form_id
    OR NEW.hostel IS DISTINCT FROM OLD.hostel
    OR NEW.room_number IS DISTINCT FROM OLD.room_number
  THEN
    RAISE EXCEPTION 'You cannot change registration details.';
  END IF;

  IF (SELECT auth.uid()) IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'You can only update your own profile.';
  END IF;

  RETURN NEW;
END;
$$;

