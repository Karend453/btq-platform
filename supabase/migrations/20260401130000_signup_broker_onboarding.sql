-- Public broker self-serve signup: profile row on auth user creation + RPC to create office and link broker.
-- Replaces with Stripe subscription flow later (see TODO in app).

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS plan_tier text;

-- Ensure every new auth user has a user_profiles row (client has SELECT-only RLS; inserts happen here).
CREATE OR REPLACE FUNCTION public.handle_new_user ()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'agent')
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user ();

-- Replace with Stripe subscription flow: persist subscription id, trial, payment method, etc.
CREATE OR REPLACE FUNCTION public.complete_broker_signup (
  p_display_name text,
  p_office_name text,
  p_state text,
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
    is_active,
    created_at,
    updated_at,
    plan_tier
  )
  VALUES (
    'BTQ-' || replace(gen_random_uuid ()::text, '-', ''),
    trim(p_office_name),
    trim(p_office_name),
    NULLIF(trim(p_state), ''),
    NULL,
    NULL,
    NULL,
    NULLIF(trim(p_display_name), ''),
    (SELECT email FROM auth.users u WHERE u.id = v_uid),
    NULL,
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

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_broker_signup (text, text, text, text, text) TO authenticated;
