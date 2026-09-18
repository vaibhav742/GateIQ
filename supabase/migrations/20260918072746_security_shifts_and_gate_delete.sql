-- Shared shift logins (morning/night) with named guards, plus admin delete for gates.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS security_shift text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_security_shift_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_security_shift_check
  CHECK (security_shift IS NULL OR security_shift IN ('morning', 'night'));

CREATE TABLE IF NOT EXISTS public.security_shift_guards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  full_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_shift_guards_name_check CHECK (length(btrim(full_name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_security_shift_guards_user
  ON public.security_shift_guards (security_user_id);

ALTER TABLE public.security_shift_guards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shift_guards_select_admin ON public.security_shift_guards;
DROP POLICY IF EXISTS shift_guards_select_own ON public.security_shift_guards;
DROP POLICY IF EXISTS shift_guards_insert_admin ON public.security_shift_guards;
DROP POLICY IF EXISTS shift_guards_delete_admin ON public.security_shift_guards;

CREATE POLICY shift_guards_select_admin
  ON public.security_shift_guards FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()));

CREATE POLICY shift_guards_select_own
  ON public.security_shift_guards FOR SELECT TO authenticated
  USING (security_user_id = (SELECT auth.uid()));

CREATE POLICY shift_guards_insert_admin
  ON public.security_shift_guards FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY shift_guards_delete_admin
  ON public.security_shift_guards FOR DELETE TO authenticated
  USING ((SELECT private.is_admin()));

GRANT SELECT, INSERT, DELETE ON public.security_shift_guards TO authenticated;

DROP POLICY IF EXISTS gates_delete_admin ON public.gates;
CREATE POLICY gates_delete_admin
  ON public.gates FOR DELETE TO authenticated
  USING ((SELECT private.is_admin()));

GRANT DELETE ON public.gates TO authenticated;

DROP POLICY IF EXISTS assignments_delete_admin ON public.security_gate_assignments;
CREATE POLICY assignments_delete_admin
  ON public.security_gate_assignments FOR DELETE TO authenticated
  USING ((SELECT private.is_admin()));

GRANT DELETE ON public.security_gate_assignments TO authenticated;

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

  IF NEW.security_shift IS DISTINCT FROM OLD.security_shift THEN
    RAISE EXCEPTION 'You cannot change shift assignments.';
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
