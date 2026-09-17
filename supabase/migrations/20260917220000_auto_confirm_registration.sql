-- Auto-confirm Auth accounts so students can sign in immediately after registration.
-- confirmed_at on auth.users is generated from email_confirmed_at.

CREATE OR REPLACE FUNCTION private.auto_confirm_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auth_users_auto_confirm ON auth.users;
CREATE TRIGGER auth_users_auto_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.auto_confirm_auth_user();

CREATE OR REPLACE FUNCTION private.auto_verify_auth_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.identity_data := COALESCE(NEW.identity_data, '{}'::jsonb) || jsonb_build_object('email_verified', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auth_identities_auto_verify ON auth.identities;
CREATE TRIGGER auth_identities_auto_verify
  BEFORE INSERT ON auth.identities
  FOR EACH ROW
  EXECUTE FUNCTION private.auto_verify_auth_identity();
