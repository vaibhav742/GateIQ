-- Store a compressed front photo of each student's ID card for gate verification.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS id_card_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'id-cards',
  'id-cards',
  false,
  2097152,
  ARRAY['image/jpeg']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg'];

DROP POLICY IF EXISTS id_cards_insert_own ON storage.objects;
DROP POLICY IF EXISTS id_cards_select_staff_or_own ON storage.objects;
DROP POLICY IF EXISTS id_cards_update_own ON storage.objects;
DROP POLICY IF EXISTS id_cards_delete_admin ON storage.objects;

CREATE POLICY id_cards_insert_own
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'id-cards'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

CREATE POLICY id_cards_select_staff_or_own
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'id-cards'
    AND (
      (SELECT private.is_staff())
      OR (storage.foldername(name))[1] = (SELECT auth.uid()::text)
    )
  );

CREATE POLICY id_cards_update_own
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'id-cards'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  )
  WITH CHECK (
    bucket_id = 'id-cards'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

CREATE POLICY id_cards_delete_admin
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'id-cards'
    AND (SELECT private.is_admin())
  );

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

  IF NEW.id_card_path IS DISTINCT FROM OLD.id_card_path
    AND (OLD.id_card_path IS NOT NULL OR NEW.id_card_path IS NULL)
  THEN
    RAISE EXCEPTION 'You cannot change registration details.';
  END IF;

  IF (SELECT auth.uid()) IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'You can only update your own profile.';
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
      'account_status', v_student.status,
      'id_card_path', v_student.id_card_path
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
      'account_status', v_student.status,
      'id_card_path', v_student.id_card_path
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

CREATE OR REPLACE FUNCTION public.delete_student(p_student_id uuid, p_confirmation text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student public.profiles%ROWTYPE;
  v_expected text;
  v_logs integer;
BEGIN
  IF NOT private.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Forbidden.');
  END IF;

  IF p_student_id IS NOT DISTINCT FROM (SELECT auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'code', 'SELF', 'message', 'You cannot delete your own account.');
  END IF;

  SELECT * INTO v_student
  FROM public.profiles
  WHERE id = p_student_id
    AND role = 'student';

  IF v_student.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Student not found.');
  END IF;

  v_expected := COALESCE(NULLIF(btrim(COALESCE(v_student.roll_number, '')), ''), v_student.email);
  IF v_expected IS NULL OR btrim(COALESCE(p_confirmation, '')) <> v_expected THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'CONFIRMATION',
      'message', 'Confirmation text did not match.'
    );
  END IF;

  SELECT count(*) INTO v_logs
  FROM public.entry_exit_logs
  WHERE student_id = p_student_id;

  PERFORM set_config('app.allow_log_purge', 'true', true);

  DELETE FROM storage.objects
  WHERE bucket_id = 'id-cards'
    AND name LIKE p_student_id::text || '/%';

  DELETE FROM public.entry_exit_logs WHERE student_id = p_student_id;
  DELETE FROM public.student_qr_codes WHERE student_id = p_student_id;
  DELETE FROM public.profiles WHERE id = p_student_id;
  DELETE FROM auth.users WHERE id = p_student_id;

  RETURN jsonb_build_object('success', true, 'deleted_logs', v_logs);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_batch_permanently(p_batch_id uuid, p_confirmation text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch public.batches%ROWTYPE;
  v_expected text;
  v_students integer;
  v_logs integer;
  v_ids uuid[];
BEGIN
  IF NOT private.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Forbidden.');
  END IF;

  SELECT * INTO v_batch FROM public.batches WHERE id = p_batch_id;
  IF v_batch.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Batch not found.');
  END IF;

  v_expected := 'DELETE BATCH ' || v_batch.batch_number;
  IF btrim(COALESCE(p_confirmation, '')) <> v_expected THEN
    RETURN jsonb_build_object('success', false, 'code', 'CONFIRMATION', 'message', 'Confirmation text did not match.');
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_ids
  FROM public.profiles
  WHERE role = 'student'
    AND (batch_id = p_batch_id OR batch = v_batch.batch_number);

  SELECT count(*) INTO v_students
  FROM public.profiles
  WHERE id = ANY (v_ids);

  SELECT count(*) INTO v_logs
  FROM public.entry_exit_logs
  WHERE student_id = ANY (v_ids);

  PERFORM set_config('app.allow_log_purge', 'true', true);

  DELETE FROM storage.objects
  WHERE bucket_id = 'id-cards'
    AND split_part(name, '/', 1) IN (SELECT sid::text FROM unnest(v_ids) AS sid);

  DELETE FROM public.entry_exit_logs WHERE student_id = ANY (v_ids);
  DELETE FROM public.student_qr_codes WHERE student_id = ANY (v_ids);
  DELETE FROM public.registration_forms WHERE batch_id = p_batch_id;
  DELETE FROM public.profiles WHERE id = ANY (v_ids);
  DELETE FROM auth.users WHERE id = ANY (v_ids);
  DELETE FROM public.batches WHERE id = p_batch_id;

  RETURN jsonb_build_object('success', true, 'deleted_students', v_students, 'deleted_logs', v_logs);
END;
$$;
