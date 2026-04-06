-- Align Back Office SECURITY DEFINER gates with app `canAccessBtqBackOffice` (btq_admin).
-- Legacy `admin` profile rows remain allowed for existing deployments.

CREATE OR REPLACE FUNCTION public.list_offices_for_back_office ()
RETURNS TABLE (
  id uuid,
  name text,
  display_name text,
  state text,
  address_line1 text,
  city text,
  postal_code text,
  broker_name text,
  broker_email text,
  mls_name text,
  stripe_customer_id text,
  stripe_subscription_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid () IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid ()
      AND lower(trim(up.role)) IN ('admin', 'btq_admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name::text,
    o.display_name::text,
    o.state::text,
    o.address_line1::text,
    o.city::text,
    o.postal_code::text,
    o.broker_name::text,
    o.broker_email::text,
    o.mls_name::text,
    o.stripe_customer_id::text,
    o.stripe_subscription_id::text
  FROM public.offices o
  ORDER BY o.name ASC NULLS LAST, o.id ASC;
END;
$$;

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

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid ()
      AND lower(trim(up.role)) IN ('admin', 'btq_admin')
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
