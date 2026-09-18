-- Admin-pushed dashboard notices. Students only see currently active notices
-- that match their profile, such as missing ID card.

CREATE TABLE public.student_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'missing_id' CHECK (audience IN ('missing_id', 'all')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_notices_body_length CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  CONSTRAINT student_notices_window CHECK (ends_at > starts_at)
);

CREATE INDEX idx_student_notices_active ON public.student_notices (ends_at, audience);

ALTER TABLE public.student_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY student_notices_select_visible
  ON public.student_notices FOR SELECT TO authenticated
  USING (
    private.is_admin()
    OR (
      private.is_student()
      AND now() >= starts_at
      AND now() < ends_at
      AND (
        audience = 'all'
        OR (
          audience = 'missing_id'
          AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = (SELECT auth.uid())
              AND p.role = 'student'
              AND COALESCE(btrim(p.id_card_path), '') = ''
          )
        )
      )
    )
  );

CREATE POLICY student_notices_insert_admin
  ON public.student_notices FOR INSERT TO authenticated
  WITH CHECK (private.is_admin());

CREATE POLICY student_notices_update_admin
  ON public.student_notices FOR UPDATE TO authenticated
  USING (private.is_admin())
  WITH CHECK (private.is_admin());

CREATE POLICY student_notices_delete_admin
  ON public.student_notices FOR DELETE TO authenticated
  USING (private.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_notices TO authenticated;
