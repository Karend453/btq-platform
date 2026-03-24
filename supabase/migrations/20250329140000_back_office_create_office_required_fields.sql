-- create_office_for_back_office: set NOT NULL office_id (text), is_active, created_at, updated_at.

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
    mls_name,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    'BTQ-' || replace(gen_random_uuid ()::text, '-', ''),
    trim(p_name),
    NULLIF(trim(p_display_name), ''),
    NULLIF(trim(p_state), ''),
    NULLIF(trim(p_address_line1), ''),
    NULLIF(trim(p_city), ''),
    NULLIF(trim(p_postal_code), ''),
    NULLIF(trim(p_broker_name), ''),
    NULLIF(trim(p_broker_email), ''),
    NULLIF(trim(p_mls_name), ''),
    TRUE,
    now(),
    now()
  )
  RETURNING id INTO v_id;

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
