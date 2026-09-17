-- Harden public registration: hide inactive form details, restrict admin RPCs,
-- reject unprovisioned public signups, and keep batch_id in sync with batch text.

CREATE OR REPLACE FUNCTION private.sync_profile_batch_text()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_number text;
  v_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.batch_id IS DISTINCT FROM OLD.batch_id AND NEW.batch_id IS NOT NULL THEN
    SELECT b.batch_number INTO v_number FROM public.batches b WHERE b.id = NEW.batch_id;
    IF v_number IS NOT NULL THEN
      NEW.batch := v_number;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.batch_id IS NOT NULL THEN
    SELECT b.batch_number INTO v_number FROM public.batches b WHERE b.id = NEW.batch_id;
    IF v_number IS NOT NULL THEN
      NEW.batch := v_number;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.batch IS NOT NULL AND btrim(NEW.batch) <> '' THEN
    SELECT b.id, b.batch_number INTO v_id, v_number
    FROM public.batches b
    WHERE b.batch_number = btrim(NEW.batch);
    IF v_id IS NOT NULL THEN
      NEW.batch_id := v_id;
      NEW.batch := v_number;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_batch_text ON public.profiles;
CREATE TRIGGER profiles_sync_batch_text
  BEFORE INSERT OR UPDATE OF batch_id, batch ON public.profiles
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

  IF v_form.status <> 'active' OR v_batch.id IS NULL OR v_batch.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'code', 'CLOSED');
  END IF;

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

REVOKE ALL ON FUNCTION public.archive_batch(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_batch(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_batch_permanently(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_batch_permanently(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_campus_status_board(date, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campus_status_board(date, text, text, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.archive_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_batch_permanently(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campus_status_board(date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_registration_form(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_student_registration(text, text, text) TO anon, authenticated;
