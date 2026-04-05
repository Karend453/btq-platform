-- Ensure new broker signups get an active office_memberships row (same model as roster / wallet).

DROP FUNCTION IF EXISTS public.complete_broker_signup(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
);

CREATE OR REPLACE FUNCTION public.complete_broker_signup (
  p_display_name text,
  p_office_name text,
  p_team_name text,
  p_firm_address text,
  p_state text,
  p_mls_name text,
  p_mls_url text,
  p_landvoice_leads text,
  p_referral text,
  p_broker_phone text DEFAULT NULL,
  p_plan_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_uid uuid := auth.uid ();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = v_uid
      AND up.office_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Workspace already provisioned';
  END IF;

  IF p_office_name IS NULL OR trim(p_office_name) = '' THEN
    RAISE EXCEPTION 'Office name is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = v_uid
  ) THEN
    RAISE EXCEPTION 'user_profiles row missing; confirm handle_new_user trigger on auth.users is installed';
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
    mls_url,
    landvoice_leads,
    referral_source,
    is_active,
    created_at,
    updated_at,
    plan_tier
  )
  VALUES (
    'BTQ-' || replace(gen_random_uuid ()::text, '-', ''),
    trim(p_office_name),
    NULLIF(trim(p_team_name), ''),
    NULLIF(trim(p_state), ''),
    NULLIF(trim(p_firm_address), ''),
    NULL,
    NULL,
    NULLIF(trim(p_display_name), ''),
    (SELECT email FROM auth.users u WHERE u.id = v_uid),
    NULLIF(trim(p_mls_name), ''),
    NULLIF(trim(p_mls_url), ''),
    NULLIF(trim(p_landvoice_leads), ''),
    NULLIF(trim(p_referral), ''),
    TRUE,
    now(),
    now(),
    NULLIF(trim(lower(p_plan_key)), '')
  )
  RETURNING id INTO v_id;

  UPDATE public.user_profiles
  SET
    role = 'broker',
    office_id = v_id,
    display_name = NULLIF(trim(p_display_name), ''),
    email = (SELECT email FROM auth.users u WHERE u.id = v_uid),
    phone = NULLIF(trim(p_broker_phone), '')
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to link broker profile';
  END IF;

  INSERT INTO public.office_memberships (
    office_id,
    user_id,
    role,
    status
  )
  VALUES (
    v_id,
    v_uid,
    'broker',
    'active'
  )
  ON CONFLICT (office_id, user_id) DO UPDATE
  SET
    role = 'broker',
    status = 'active',
    updated_at = now();

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_broker_signup (
  text,
  text,
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
