-- Admin-only student deletion. Historical entry/exit logs are never removed.
-- If a student has movement history, deletion is refused so records stay intact.

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

  IF v_logs > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'HAS_HISTORY',
      'message', 'This student has historical entry/exit records. Deactivate the account instead of deleting it.'
    );
  END IF;

  DELETE FROM public.student_qr_codes WHERE student_id = p_student_id;
  DELETE FROM public.profiles WHERE id = p_student_id;
  DELETE FROM auth.users WHERE id = p_student_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_student(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_student(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_student(uuid, text) TO authenticated;
