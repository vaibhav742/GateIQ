ALTER TABLE public.registration_forms
  ADD COLUMN IF NOT EXISTS id_card_required boolean NOT NULL DEFAULT false;

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
      'id_card_required', COALESCE(v_form.id_card_required, false),
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
