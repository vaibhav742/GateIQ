-- IIM Calcutta student emails are username@email.iimcal.ac.in.
-- Hostels are campus-managed so new buildings can be added without a schema change.

CREATE TABLE IF NOT EXISTS public.hostels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hostels_name_lower_idx
  ON public.hostels (lower(name));

INSERT INTO public.hostels (name)
SELECT n
FROM (VALUES ('Annexe'), ('Tagore'), ('LVH'), ('OH'), ('NH')) AS t(n)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hostels h WHERE lower(h.name) = lower(t.n)
);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_hostel_check;

UPDATE public.registration_forms
SET email_domain = 'email.iimcal.ac.in'
WHERE private.normalize_email_domain(email_domain) = 'iimcal.ac.in';

ALTER TABLE public.hostels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hostels_select_admin ON public.hostels;
DROP POLICY IF EXISTS hostels_insert_admin ON public.hostels;
DROP POLICY IF EXISTS hostels_update_admin ON public.hostels;
DROP POLICY IF EXISTS hostels_delete_admin ON public.hostels;

CREATE POLICY hostels_select_admin
  ON public.hostels FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()));

CREATE POLICY hostels_insert_admin
  ON public.hostels FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY hostels_update_admin
  ON public.hostels FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()))
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY hostels_delete_admin
  ON public.hostels FOR DELETE TO authenticated
  USING ((SELECT private.is_admin()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hostels TO authenticated;

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

  IF v_hostel IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.hostels h
    WHERE h.name = v_hostel
      AND h.status = 'active'
  ) THEN
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
      'registration_suffix', '/' || v_batch.batch_number,
      'hostels', COALESCE(
        (
          SELECT jsonb_agg(h.name ORDER BY h.name)
          FROM public.hostels h
          WHERE h.status = 'active'
        ),
        '[]'::jsonb
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_registration_form(text) TO anon, authenticated;
