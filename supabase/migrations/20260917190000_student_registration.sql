-- Student registration forms, batches, and public onboarding RPCs.
-- Reuses public.profiles (roll_number + batch). Does not create per-batch student tables.

CREATE TABLE public.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE public.registration_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL UNIQUE REFERENCES public.batches (id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  email_domain text NOT NULL,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive')),
  auto_approve boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registration_forms_slug_format CHECK (slug ~ '^[a-z0-9-]{3,40}$')
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.batches (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS registration_form_id uuid REFERENCES public.registration_forms (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS registration_status text NOT NULL DEFAULT 'active'
    CHECK (registration_status IN ('pending', 'approved', 'rejected', 'active')),
  ADD COLUMN IF NOT EXISTS registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'inactive', 'archived'));

CREATE INDEX IF NOT EXISTS idx_profiles_batch_id ON public.profiles (batch_id);
CREATE INDEX IF NOT EXISTS idx_profiles_registration_status ON public.profiles (registration_status);
CREATE INDEX IF NOT EXISTS idx_registration_forms_slug ON public.registration_forms (slug);
CREATE INDEX IF NOT EXISTS idx_registration_forms_status ON public.registration_forms (status);

CREATE TRIGGER registration_forms_set_updated_at
  BEFORE UPDATE ON public.registration_forms
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

UPDATE public.profiles
SET
  first_name = COALESCE(first_name, split_part(full_name, ' ', 1)),
  last_name = COALESCE(
    last_name,
    NULLIF(btrim(substring(full_name FROM position(' ' IN full_name))), '')
  )
WHERE full_name IS NOT NULL;

INSERT INTO public.batches (batch_number, name, status)
SELECT DISTINCT p.batch, 'PGP ' || p.batch, 'active'
FROM public.profiles p
WHERE p.role = 'student'
  AND p.batch IS NOT NULL
  AND btrim(p.batch) <> ''
ON CONFLICT (batch_number) DO NOTHING;

UPDATE public.profiles p
SET batch_id = b.id
FROM public.batches b
WHERE p.batch_id IS NULL
  AND p.batch = b.batch_number;

INSERT INTO public.registration_forms (batch_id, name, slug, email_domain, status, auto_approve)
SELECT
  b.id,
  'IIM Calcutta PGP ' || b.batch_number || ' Registration',
  'pgp' || lower(b.batch_number),
  'iimcal.ac.in',
  'inactive',
  true
FROM public.batches b
ON CONFLICT (batch_id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.normalize_email_domain(p_domain text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(btrim(regexp_replace(COALESCE(p_domain, ''), '^@+', '')));
$$;

CREATE OR REPLACE FUNCTION private.build_registration_number(p_serial text, p_batch_number text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_serial text;
BEGIN
  v_serial := btrim(COALESCE(p_serial, ''));
  IF v_serial !~ '^[0-9]{3,8}$' THEN
    RETURN NULL;
  END IF;
  IF btrim(COALESCE(p_batch_number, '')) = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_serial || '/' || btrim(p_batch_number);
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_profile_batch_text()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    SELECT b.batch_number INTO NEW.batch
    FROM public.batches b
    WHERE b.id = NEW.batch_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_sync_batch_text
  BEFORE INSERT OR UPDATE OF batch_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_profile_batch_text();

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
BEGIN
  v_role := COALESCE(NEW.raw_app_meta_data->>'role', 'student');
  IF v_role NOT IN ('student', 'security', 'admin') THEN
    v_role := 'student';
  END IF;

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

  IF v_slug IS NULL THEN
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
    roll_number, batch, batch_id, registration_form_id, registration_status, registered_at
  )
  VALUES (
    NEW.id, NEW.email, v_name, v_first, v_last, 'student', v_status,
    v_roll, v_batch.batch_number, v_batch.id, v_form.id, v_reg_status, now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
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
  THEN
    RAISE EXCEPTION 'You cannot change registration details.';
  END IF;

  IF (SELECT auth.uid()) IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'You can only update your own profile.';
  END IF;

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.get_campus_status_board(date, text, text);

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

CREATE OR REPLACE FUNCTION public.get_public_registration_form(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_form public.registration_forms%ROWTYPE;
  v_batch public.batches%ROWTYPE;
BEGIN
  SELECT * INTO v_form
  FROM public.registration_forms
  WHERE slug = lower(btrim(COALESCE(p_slug, '')));

  IF v_form.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;

  SELECT * INTO v_batch FROM public.batches WHERE id = v_form.batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'form', jsonb_build_object(
      'name', v_form.name,
      'slug', v_form.slug,
      'status', v_form.status,
      'email_domain', v_form.email_domain,
      'batch_number', v_batch.batch_number,
      'batch_name', v_batch.name,
      'registration_suffix', '/' || v_batch.batch_number
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_student_registration(
  p_slug text,
  p_email text,
  p_serial text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_form public.registration_forms%ROWTYPE;
  v_batch public.batches%ROWTYPE;
  v_email text;
  v_domain text;
  v_roll text;
BEGIN
  SELECT * INTO v_form
  FROM public.registration_forms
  WHERE slug = lower(btrim(COALESCE(p_slug, '')));

  IF v_form.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Registration is currently closed.');
  END IF;

  SELECT * INTO v_batch FROM public.batches WHERE id = v_form.batch_id;

  IF v_form.status <> 'active' OR v_batch.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'code', 'CLOSED', 'message', 'Registration is currently closed. Please contact the administration.');
  END IF;

  v_email := lower(btrim(COALESCE(p_email, '')));
  v_domain := private.normalize_email_domain(v_form.email_domain);

  IF v_email = '' OR v_email NOT LIKE '%@' || v_domain THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_EMAIL', 'message', 'Please use your IIM Calcutta email address.');
  END IF;

  v_roll := private.build_registration_number(p_serial, v_batch.batch_number);
  IF v_roll IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_ROLL', 'message', 'Enter a valid registration number.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles p WHERE lower(COALESCE(p.email, '')) = v_email) THEN
    RETURN jsonb_build_object('success', false, 'code', 'DUPLICATE_EMAIL', 'message', 'This email is already registered.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.roll_number = v_roll) THEN
    RETURN jsonb_build_object('success', false, 'code', 'DUPLICATE_ROLL', 'message', 'This registration number is already registered.');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'roll_number', v_roll,
    'batch_number', v_batch.batch_number
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;

  UPDATE public.batches
  SET status = 'archived', archived_at = now()
  WHERE id = p_batch_id
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Batch could not be archived.');
  END IF;

  UPDATE public.registration_forms
  SET status = 'inactive'
  WHERE batch_id = p_batch_id;

  UPDATE public.profiles
  SET status = 'archived'
  WHERE batch_id = p_batch_id
    AND role = 'student'
    AND status = 'active';

  RETURN jsonb_build_object('success', true);
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
  v_students int;
  v_logs int;
BEGIN
  IF NOT private.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_batch FROM public.batches WHERE id = p_batch_id;
  IF v_batch.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;

  v_expected := 'DELETE BATCH ' || v_batch.batch_number;
  IF btrim(COALESCE(p_confirmation, '')) <> v_expected THEN
    RETURN jsonb_build_object('success', false, 'code', 'CONFIRMATION', 'message', 'Confirmation text did not match.');
  END IF;

  SELECT count(*) INTO v_logs
  FROM public.entry_exit_logs e
  JOIN public.profiles p ON p.id = e.student_id
  WHERE p.batch_id = p_batch_id;

  IF v_logs > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'HAS_HISTORY',
      'message', 'This batch has historical entry/exit records. Archive it instead of deleting.'
    );
  END IF;

  SELECT count(*) INTO v_students
  FROM public.profiles
  WHERE batch_id = p_batch_id AND role = 'student';

  DELETE FROM public.student_qr_codes q
  USING public.profiles p
  WHERE q.student_id = p.id
    AND p.batch_id = p_batch_id;

  DELETE FROM public.registration_forms WHERE batch_id = p_batch_id;
  DELETE FROM public.profiles WHERE batch_id = p_batch_id AND role = 'student';
  DELETE FROM public.batches WHERE id = p_batch_id;

  RETURN jsonb_build_object('success', true, 'deleted_students', v_students);
END;
$$;

ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY batches_select_staff
  ON public.batches FOR SELECT TO authenticated
  USING ((SELECT private.is_staff()));

CREATE POLICY batches_insert_admin
  ON public.batches FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY batches_update_admin
  ON public.batches FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()))
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY batches_delete_admin
  ON public.batches FOR DELETE TO authenticated
  USING ((SELECT private.is_admin()));

CREATE POLICY registration_forms_select_admin
  ON public.registration_forms FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()));

CREATE POLICY registration_forms_insert_admin
  ON public.registration_forms FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY registration_forms_update_admin
  ON public.registration_forms FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()))
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY registration_forms_delete_admin
  ON public.registration_forms FOR DELETE TO authenticated
  USING ((SELECT private.is_admin()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registration_forms TO authenticated;

REVOKE ALL ON FUNCTION public.get_public_registration_form(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_student_registration(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_batch(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_batch_permanently(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campus_status_board(date, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_registration_form(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_student_registration(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_batch_permanently(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campus_status_board(date, text, text, text) TO authenticated;
