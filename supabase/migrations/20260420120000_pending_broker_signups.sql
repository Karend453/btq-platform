-- Pending broker signups: bridge form submit → email confirmation → post-login provisioning.
--
-- Problem: when Supabase email confirmation is enabled, `supabase.auth.signUp` does not return a
-- session, so `complete_broker_signup` cannot run from the form handler. Client state is lost
-- between the confirmation email and the first sign-in. This migration persists the signup
-- form in a dedicated table so provisioning can resume on the next login.
--
-- Access model: RLS on, NO direct policies. All reads/writes go through SECURITY DEFINER RPCs so
-- PII (phone, addresses, MLS info) never leaves the database without going through a function
-- that enforces who can touch which row.

CREATE TABLE IF NOT EXISTS public.pending_broker_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  email text NOT NULL,
  full_name text,
  phone text,
  firm_name text NOT NULL,
  team_name text,
  firm_address text,
  licensed_states text,
  mls_name text,
  mls_url text,
  landvoice_leads text,
  referral text,
  plan_tier text,
  billing_cycle text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completed_office_id uuid REFERENCES public.offices (id) ON DELETE SET NULL,
  CONSTRAINT pending_broker_signups_email_unique UNIQUE (email),
  CONSTRAINT pending_broker_signups_status_chk
    CHECK (status IN ('pending', 'completed'))
);

CREATE INDEX IF NOT EXISTS pending_broker_signups_email_idx
  ON public.pending_broker_signups (email);

ALTER TABLE public.pending_broker_signups ENABLE ROW LEVEL SECURITY;

-- Intentionally NO policies: only SECURITY DEFINER functions below may read/write.

-- Upsert-by-email save. Callable by anon because the user is not yet authenticated when the
-- signup form is submitted. Normalizes email to lower-case to match auth.users behavior.
CREATE OR REPLACE FUNCTION public.save_pending_broker_signup (
  p_email text,
  p_full_name text,
  p_phone text,
  p_firm_name text,
  p_team_name text DEFAULT NULL,
  p_firm_address text DEFAULT NULL,
  p_licensed_states text DEFAULT NULL,
  p_mls_name text DEFAULT NULL,
  p_mls_url text DEFAULT NULL,
  p_landvoice_leads text DEFAULT NULL,
  p_referral text DEFAULT NULL,
  p_plan_tier text DEFAULT NULL,
  p_billing_cycle text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_firm text := trim(coalesce(p_firm_name, ''));
BEGIN
  IF v_email = '' THEN
    RAISE EXCEPTION 'email required';
  END IF;
  IF v_firm = '' THEN
    RAISE EXCEPTION 'firm_name required';
  END IF;

  INSERT INTO public.pending_broker_signups (
    email,
    full_name,
    phone,
    firm_name,
    team_name,
    firm_address,
    licensed_states,
    mls_name,
    mls_url,
    landvoice_leads,
    referral,
    plan_tier,
    billing_cycle,
    status,
    updated_at
  )
  VALUES (
    v_email,
    NULLIF(trim(coalesce(p_full_name, '')), ''),
    NULLIF(trim(coalesce(p_phone, '')), ''),
    v_firm,
    NULLIF(trim(coalesce(p_team_name, '')), ''),
    NULLIF(trim(coalesce(p_firm_address, '')), ''),
    NULLIF(trim(coalesce(p_licensed_states, '')), ''),
    NULLIF(trim(coalesce(p_mls_name, '')), ''),
    NULLIF(trim(coalesce(p_mls_url, '')), ''),
    NULLIF(trim(coalesce(p_landvoice_leads, '')), ''),
    NULLIF(trim(coalesce(p_referral, '')), ''),
    NULLIF(trim(lower(coalesce(p_plan_tier, ''))), ''),
    NULLIF(trim(lower(coalesce(p_billing_cycle, ''))), ''),
    'pending',
    now()
  )
  ON CONFLICT (email) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    firm_name = EXCLUDED.firm_name,
    team_name = EXCLUDED.team_name,
    firm_address = EXCLUDED.firm_address,
    licensed_states = EXCLUDED.licensed_states,
    mls_name = EXCLUDED.mls_name,
    mls_url = EXCLUDED.mls_url,
    landvoice_leads = EXCLUDED.landvoice_leads,
    referral = EXCLUDED.referral,
    plan_tier = EXCLUDED.plan_tier,
    billing_cycle = EXCLUDED.billing_cycle,
    status = 'pending',
    completed_at = NULL,
    completed_office_id = NULL,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_pending_broker_signup (
  text, text, text, text, text, text, text, text, text, text, text, text, text
) TO anon, authenticated;

-- Post-login resume. Idempotent + fail-safe:
--   * returns NULL if no pending row for the authenticated user's email
--   * returns existing office id if user is already provisioned
--   * otherwise: creates office + broker membership, sets user_profiles.role = 'broker', marks
--     the pending row completed, and returns the new office id.
-- Mirrors the provisioning steps in `complete_broker_signup` so we stay on a single well-trodden
-- code path; when `complete_broker_signup` changes, update this in lockstep.
CREATE OR REPLACE FUNCTION public.resume_pending_broker_signup ()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid ();
  v_email text;
  v_pending public.pending_broker_signups%ROWTYPE;
  v_existing_office_id uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Already provisioned → idempotent no-op, return their current office.
  SELECT up.office_id INTO v_existing_office_id
  FROM public.user_profiles up
  WHERE up.id = v_uid;

  IF v_existing_office_id IS NOT NULL THEN
    RETURN v_existing_office_id;
  END IF;

  SELECT lower(trim(u.email)) INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_pending
  FROM public.pending_broker_signups
  WHERE email = v_email
    AND status = 'pending'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles up WHERE up.id = v_uid
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
    v_pending.firm_name,
    NULLIF(v_pending.team_name, ''),
    NULLIF(v_pending.licensed_states, ''),
    NULLIF(v_pending.firm_address, ''),
    NULL,
    NULL,
    NULLIF(v_pending.full_name, ''),
    v_email,
    NULLIF(v_pending.mls_name, ''),
    NULLIF(v_pending.mls_url, ''),
    NULLIF(v_pending.landvoice_leads, ''),
    NULLIF(v_pending.referral, ''),
    TRUE,
    now(),
    now(),
    NULLIF(v_pending.plan_tier, '')
  )
  RETURNING id INTO v_id;

  UPDATE public.user_profiles
  SET
    role = 'broker',
    office_id = v_id,
    display_name = COALESCE(NULLIF(v_pending.full_name, ''), display_name),
    email = v_email,
    phone = COALESCE(NULLIF(v_pending.phone, ''), phone)
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

  UPDATE public.pending_broker_signups
  SET
    status = 'completed',
    completed_at = now(),
    completed_office_id = v_id,
    updated_at = now()
  WHERE id = v_pending.id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resume_pending_broker_signup () TO authenticated;
