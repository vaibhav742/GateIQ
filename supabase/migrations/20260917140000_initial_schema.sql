-- Campus Access — IIM Calcutta
-- Source of truth: PostgreSQL. Roles live in public.profiles, never in user_metadata.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.campus_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (timezone('Asia/Kolkata', now()))::date;
$$;

CREATE OR REPLACE FUNCTION private.campus_day_start(p_day date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT (p_day::timestamp AT TIME ZONE 'Asia/Kolkata');
$$;

CREATE OR REPLACE FUNCTION private.campus_day_end(p_day date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ((p_day + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
$$;

CREATE OR REPLACE FUNCTION private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text NOT NULL,
  roll_number text UNIQUE,
  email text UNIQUE,
  role text NOT NULL CHECK (role IN ('student', 'security', 'admin')),
  batch text,
  section text,
  phone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.security_gate_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  gate_id uuid NOT NULL REFERENCES public.gates (id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.student_qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE TABLE public.entry_exit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  gate_id uuid NOT NULL REFERENCES public.gates (id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('ENTRY', 'EXIT')),
  timestamp timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  verification_method text NOT NULL DEFAULT 'QR',
  device_id text,
  is_admin_override boolean NOT NULL DEFAULT false,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX student_qr_codes_one_active_idx
  ON public.student_qr_codes (student_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX security_one_active_assignment_idx
  ON public.security_gate_assignments (security_user_id)
  WHERE active = true;

CREATE INDEX idx_profiles_roll_number ON public.profiles (roll_number);
CREATE INDEX idx_profiles_role_status ON public.profiles (role, status);
CREATE INDEX idx_profiles_full_name ON public.profiles (full_name);
CREATE INDEX idx_student_qr_codes_token ON public.student_qr_codes (token);
CREATE INDEX idx_student_qr_codes_student ON public.student_qr_codes (student_id);
CREATE INDEX idx_assignments_security ON public.security_gate_assignments (security_user_id);
CREATE INDEX idx_assignments_gate ON public.security_gate_assignments (gate_id);
CREATE INDEX idx_logs_student ON public.entry_exit_logs (student_id);
CREATE INDEX idx_logs_gate ON public.entry_exit_logs (gate_id);
CREATE INDEX idx_logs_timestamp ON public.entry_exit_logs (timestamp);
CREATE INDEX idx_logs_action ON public.entry_exit_logs (action);
CREATE INDEX idx_logs_student_timestamp ON public.entry_exit_logs (student_id, timestamp DESC);
CREATE INDEX idx_logs_timestamp_action ON public.entry_exit_logs (timestamp, action);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth helpers (SECURITY DEFINER, not exposed)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.current_profile()
RETURNS public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.*
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.current_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid())
    AND p.status = 'active';
$$;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(private.current_role() = 'admin', false);
$$;

CREATE OR REPLACE FUNCTION private.is_security()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(private.current_role() = 'security', false);
$$;

CREATE OR REPLACE FUNCTION private.is_student()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(private.current_role() = 'student', false);
$$;

CREATE OR REPLACE FUNCTION private.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(private.current_role() IN ('security', 'admin'), false);
$$;

CREATE OR REPLACE FUNCTION private.assigned_gate_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT a.gate_id
  FROM public.security_gate_assignments a
  JOIN public.gates g ON g.id = a.gate_id
  WHERE a.security_user_id = (SELECT auth.uid())
    AND a.active = true
    AND g.status = 'active'
  ORDER BY a.created_at DESC
  LIMIT 1;
$$;

-- Single source of truth for campus presence (today, Asia/Kolkata).
CREATE OR REPLACE FUNCTION private.student_status_for_day(p_student_id uuid, p_day date)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT CASE e.action
        WHEN 'ENTRY' THEN 'INSIDE'
        WHEN 'EXIT' THEN 'OUTSIDE'
      END
      FROM public.entry_exit_logs e
      WHERE e.student_id = p_student_id
        AND e.timestamp >= private.campus_day_start(p_day)
        AND e.timestamp < private.campus_day_end(p_day)
      ORDER BY e.timestamp DESC, e.created_at DESC
      LIMIT 1
    ),
    'UNKNOWN'
  );
$$;

CREATE OR REPLACE FUNCTION private.parse_qr_token(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_token text;
BEGIN
  v_token := trim(both FROM COALESCE(p_raw, ''));
  IF v_token = '' THEN
    RETURN NULL;
  END IF;

  IF v_token ILIKE 'IIMC:%' THEN
    v_token := substr(v_token, 6);
  END IF;

  IF v_token ~* '^https?://' THEN
    v_token := regexp_replace(v_token, '[?#].*$', '');
    v_token := regexp_replace(v_token, '^.*/', '');
  END IF;

  v_token := trim(both FROM v_token);
  IF v_token = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_token;
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

  INSERT INTO public.student_qr_codes (student_id, token, status)
  VALUES (p_student_id, v_token, 'active');

  RETURN v_token;
END;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_name text;
BEGIN
  v_role := COALESCE(NEW.raw_app_meta_data->>'role', 'student');
  IF v_role NOT IN ('student', 'security', 'admin') THEN
    v_role := 'student';
  END IF;

  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(COALESCE(NEW.email, 'user'), '@', 1)
  );

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, v_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.handle_new_user();

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

  IF (SELECT auth.uid()) IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'You can only update your own profile.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_protect_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_profile_columns();

CREATE OR REPLACE FUNCTION private.ensure_student_qr()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role = 'student' AND NEW.status = 'active' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.student_qr_codes q
      WHERE q.student_id = NEW.id
        AND q.status = 'active'
    ) THEN
      PERFORM private.issue_student_qr(NEW.id);
    END IF;
  END IF;

  IF (NEW.role <> 'student' OR NEW.status <> 'active') THEN
    UPDATE public.student_qr_codes
    SET status = 'revoked'
    WHERE student_id = NEW.id
      AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_ensure_student_qr
  AFTER INSERT OR UPDATE OF role, status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.ensure_student_qr();

CREATE OR REPLACE FUNCTION private.prevent_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.role() = 'service_role' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Entry/exit records are immutable.';
END;
$$;

CREATE TRIGGER entry_exit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.entry_exit_logs
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_log_mutation();

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_student_campus_status(
  p_student_id uuid DEFAULT NULL,
  p_day date DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_day date;
  v_role text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_role := private.current_role();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Inactive account';
  END IF;

  v_id := COALESCE(p_student_id, (SELECT auth.uid()));
  v_day := COALESCE(p_day, private.campus_today());

  IF v_role = 'student' AND v_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_role NOT IN ('student', 'security', 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN private.student_status_for_day(v_id, v_day);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_campus_summary(p_day date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_day date;
  v_start timestamptz;
  v_end timestamptz;
  v_total int;
  v_inside int;
  v_outside int;
  v_unknown int;
  v_entries int;
  v_exits int;
BEGIN
  IF NOT private.is_staff() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_day := COALESCE(p_day, private.campus_today());
  v_start := private.campus_day_start(v_day);
  v_end := private.campus_day_end(v_day);

  SELECT count(*) INTO v_total
  FROM public.profiles
  WHERE role = 'student' AND status = 'active';

  WITH latest AS (
    SELECT DISTINCT ON (e.student_id)
      e.student_id,
      e.action
    FROM public.entry_exit_logs e
    JOIN public.profiles p ON p.id = e.student_id
    WHERE p.role = 'student'
      AND p.status = 'active'
      AND e.timestamp >= v_start
      AND e.timestamp < v_end
    ORDER BY e.student_id, e.timestamp DESC, e.created_at DESC
  )
  SELECT
    count(*) FILTER (WHERE action = 'ENTRY'),
    count(*) FILTER (WHERE action = 'EXIT')
  INTO v_inside, v_outside
  FROM latest;

  v_inside := COALESCE(v_inside, 0);
  v_outside := COALESCE(v_outside, 0);
  v_unknown := v_total - v_inside - v_outside;

  SELECT
    count(*) FILTER (WHERE action = 'ENTRY'),
    count(*) FILTER (WHERE action = 'EXIT')
  INTO v_entries, v_exits
  FROM public.entry_exit_logs
  WHERE timestamp >= v_start AND timestamp < v_end;

  RETURN jsonb_build_object(
    'day', v_day,
    'total_students', v_total,
    'inside', v_inside,
    'outside', v_outside,
    'unknown', v_unknown,
    'entries_today', COALESCE(v_entries, 0),
    'exits_today', COALESCE(v_exits, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_campus_status_board(
  p_day date DEFAULT NULL,
  p_status text DEFAULT 'ALL',
  p_search text DEFAULT NULL
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
BEGIN
  IF NOT private.is_staff() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_day := COALESCE(p_day, private.campus_today());
  v_start := private.campus_day_start(v_day);
  v_end := private.campus_day_end(v_day);
  v_search := nullif(trim(both FROM COALESCE(p_search, '')), '');

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

  SELECT * INTO v_qr
  FROM public.student_qr_codes
  WHERE token = v_token;

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
    SELECT g.* INTO v_gate
    FROM public.gates g
    WHERE g.id = private.assigned_gate_id();

    IF v_gate.id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'NO_GATE', 'message', 'You are not assigned to an active gate.');
    END IF;
  END IF;

  v_status := private.student_status_for_day(v_student.id, private.campus_today());
  v_next := CASE v_status
    WHEN 'INSIDE' THEN 'EXIT'
    ELSE 'ENTRY'
  END;

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
      'section', v_student.section,
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
  IF NOT FOUND OR v_qr.status <> 'active' OR (v_qr.expires_at IS NOT NULL AND v_qr.expires_at < now()) THEN
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

CREATE OR REPLACE FUNCTION public.admin_correct_movement(
  p_student_id uuid,
  p_gate_id uuid,
  p_action text,
  p_remarks text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student public.profiles%ROWTYPE;
  v_gate public.gates%ROWTYPE;
  v_log public.entry_exit_logs%ROWTYPE;
BEGIN
  IF NOT private.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Only administrators can override records.');
  END IF;

  IF p_action NOT IN ('ENTRY', 'EXIT') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_ACTION', 'message', 'Action must be ENTRY or EXIT.');
  END IF;

  IF nullif(trim(both FROM COALESCE(p_remarks, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'REMARKS_REQUIRED', 'message', 'A remark is required for admin overrides.');
  END IF;

  SELECT * INTO v_student FROM public.profiles WHERE id = p_student_id AND role = 'student';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Student not found.');
  END IF;

  SELECT * INTO v_gate FROM public.gates WHERE id = p_gate_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Gate not found.');
  END IF;

  INSERT INTO public.entry_exit_logs (
    student_id,
    gate_id,
    action,
    recorded_by,
    verification_method,
    is_admin_override,
    remarks
  )
  VALUES (
    v_student.id,
    v_gate.id,
    p_action,
    (SELECT auth.uid()),
    'ADMIN_OVERRIDE',
    true,
    trim(both FROM p_remarks)
  )
  RETURNING * INTO v_log;

  RETURN jsonb_build_object(
    'success', true,
    'student', jsonb_build_object('name', v_student.full_name, 'roll_number', v_student.roll_number),
    'action', v_log.action,
    'status', CASE v_log.action WHEN 'ENTRY' THEN 'INSIDE' ELSE 'OUTSIDE' END,
    'gate', v_gate.name,
    'timestamp', v_log.timestamp,
    'is_admin_override', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.regenerate_student_qr(p_student_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_role text;
  v_token text;
BEGIN
  v_role := private.current_role();
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED', 'message', 'Please sign in.');
  END IF;

  v_id := COALESCE(p_student_id, (SELECT auth.uid()));

  IF v_role = 'student' AND v_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'You can only regenerate your own campus ID.');
  END IF;

  IF v_role NOT IN ('student', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Not allowed.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_id AND role = 'student' AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Active student not found.');
  END IF;

  v_token := private.issue_student_qr(v_id);

  RETURN jsonb_build_object('success', true, 'token', v_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_assigned_gate()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gate public.gates%ROWTYPE;
BEGIN
  IF NOT private.is_security() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT g.* INTO v_gate
  FROM public.gates g
  WHERE g.id = private.assigned_gate_id();

  IF v_gate.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_GATE', 'message', 'You are not assigned to an active gate.');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'gate', jsonb_build_object(
      'id', v_gate.id,
      'name', v_gate.name,
      'location', v_gate.location,
      'status', v_gate.status
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_gate_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_exit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY profiles_select_students_staff
  ON public.profiles FOR SELECT TO authenticated
  USING (
    (SELECT private.is_staff())
    AND role = 'student'
  );

CREATE POLICY profiles_select_all_admin
  ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()));

CREATE POLICY profiles_insert_admin
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY profiles_update_admin
  ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()))
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY gates_select_authenticated
  ON public.gates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY gates_insert_admin
  ON public.gates FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY gates_update_admin
  ON public.gates FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()))
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY assignments_select_own
  ON public.security_gate_assignments FOR SELECT TO authenticated
  USING (security_user_id = (SELECT auth.uid()));

CREATE POLICY assignments_select_admin
  ON public.security_gate_assignments FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()));

CREATE POLICY assignments_insert_admin
  ON public.security_gate_assignments FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY assignments_update_admin
  ON public.security_gate_assignments FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()))
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY qr_select_own
  ON public.student_qr_codes FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

CREATE POLICY qr_select_admin
  ON public.student_qr_codes FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()));

CREATE POLICY logs_select_own
  ON public.entry_exit_logs FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

CREATE POLICY logs_select_security_today
  ON public.entry_exit_logs FOR SELECT TO authenticated
  USING (
    (SELECT private.is_security())
    AND timestamp >= private.campus_day_start(private.campus_today())
    AND timestamp < private.campus_day_end(private.campus_today())
  );

CREATE POLICY logs_select_admin
  ON public.entry_exit_logs FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()));

-- No INSERT/UPDATE/DELETE policies on entry_exit_logs for authenticated.
-- Mutations happen only through SECURITY DEFINER RPCs.

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.gates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.security_gate_assignments TO authenticated;
GRANT SELECT ON public.student_qr_codes TO authenticated;
GRANT SELECT ON public.entry_exit_logs TO authenticated;

REVOKE ALL ON FUNCTION public.get_student_campus_status(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campus_summary(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campus_status_board(date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_student_by_qr(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_campus_movement(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_correct_movement(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.regenerate_student_qr(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_assigned_gate() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_student_campus_status(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campus_summary(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campus_status_board(date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_student_by_qr(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_campus_movement(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_correct_movement(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_student_qr(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_assigned_gate() TO authenticated;

ALTER TABLE public.entry_exit_logs REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.entry_exit_logs;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
