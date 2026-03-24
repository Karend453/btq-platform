-- Fix: public.offices.office_id is NOT NULL — generate it inside create_office_for_back_office.
-- Type of office_id is read from information_schema (uuid vs text/varchar) so the RPC matches the live table.

CREATE OR REPLACE FUNCTION public.create_office_for_back_office (
  p_name text,
  p_display_name text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_address_line1 text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_postal_code text DEFAULT NULL,
  p_broker_name text DEFAULT NULL,
  p_broker_email text DEFAULT NULL,
  p_mls_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_office_id_type text;
  v_office_id_uuid uuid;
  v_office_id_text text;
BEGIN
  IF auth.uid () IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Temporary BTQ Back Office gate; aligns with `canAccessBtqBackOffice` / list_offices_for_back_office.
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid ()
      AND lower(trim(up.role)) = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  SELECT c.data_type INTO v_office_id_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'offices'
    AND c.column_name = 'office_id';

  IF v_office_id_type IS NULL THEN
    RAISE EXCEPTION 'public.offices.office_id not found';
  END IF;

  IF v_office_id_type = 'uuid' THEN
    v_office_id_uuid := gen_random_uuid ();
    INSERT INTO public.offices (
      office_id,
      name,
      display_name,
      state,
      address_line1,
      city,
      postal_code,
      broker_name,
      broker_email,
      mls_name
    )
    VALUES (
      v_office_id_uuid,
      trim(p_name),
      NULLIF(trim(p_display_name), ''),
      NULLIF(trim(p_state), ''),
      NULLIF(trim(p_address_line1), ''),
      NULLIF(trim(p_city), ''),
      NULLIF(trim(p_postal_code), ''),
      NULLIF(trim(p_broker_name), ''),
      NULLIF(trim(p_broker_email), ''),
      NULLIF(trim(p_mls_name), '')
    )
    RETURNING id INTO v_id;
  ELSIF v_office_id_type IN ('text', 'character varying') THEN
    -- BTQ-style external id; UUID-derived so collision risk is negligible.
    v_office_id_text := 'BTQ-' || replace(gen_random_uuid ()::text, '-', '');
    INSERT INTO public.offices (
      office_id,
      name,
      display_name,
      state,
      address_line1,
      city,
      postal_code,
      broker_name,
      broker_email,
      mls_name
    )
    VALUES (
      v_office_id_text,
      trim(p_name),
      NULLIF(trim(p_display_name), ''),
      NULLIF(trim(p_state), ''),
      NULLIF(trim(p_address_line1), ''),
      NULLIF(trim(p_city), ''),
      NULLIF(trim(p_postal_code), ''),
      NULLIF(trim(p_broker_name), ''),
      NULLIF(trim(p_broker_email), ''),
      NULLIF(trim(p_mls_name), '')
    )
    RETURNING id INTO v_id;
  ELSE
    RAISE EXCEPTION 'public.offices.office_id has unsupported type: % (expected uuid or text/varchar)', v_office_id_type;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_office_for_back_office (
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) TO authenticated;
