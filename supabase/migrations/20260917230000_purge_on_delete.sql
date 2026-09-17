-- Admin delete now removes students, QR credentials, Auth accounts, and entry/exit logs.
-- Day-to-day log rows remain immutable except during these confirmed admin purge operations.

CREATE OR REPLACE FUNCTION private.prevent_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (
    current_setting('app.allow_log_purge', true) = 'true'
    OR auth.role() = 'service_role'
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Entry/exit records are immutable.';
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

  DELETE FROM public.entry_exit_logs WHERE student_id = ANY (v_ids);
  DELETE FROM public.student_qr_codes WHERE student_id = ANY (v_ids);
  DELETE FROM public.registration_forms WHERE batch_id = p_batch_id;
  DELETE FROM public.profiles WHERE id = ANY (v_ids);
  DELETE FROM auth.users WHERE id = ANY (v_ids);
  DELETE FROM public.batches WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_students', v_students,
    'deleted_logs', v_logs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_student(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_student(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.delete_batch_permanently(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_batch_permanently(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_student(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_batch_permanently(uuid, text) TO authenticated;
