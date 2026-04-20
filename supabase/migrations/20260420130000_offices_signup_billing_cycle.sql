-- Persist the broker's originally-selected billing cadence (monthly/annual) onto the office so
-- the `/billing-required` retry screen can restart checkout with the correct cycle. Before this
-- change, that flow hardcoded monthly, which silently downgraded any broker who picked annual
-- at signup and bounced through the billing gate.
--
-- Kept separate from Stripe-owned columns (`billing_*`) because this is a pre-billing intent,
-- not an observed subscription state. The Stripe webhook never writes here.

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS signup_billing_cycle text;

-- Backfill: for offices that were already provisioned via `resume_pending_broker_signup` before
-- this migration landed (and therefore never captured the cycle), copy the value forward from
-- the completed pending row. Non-signup offices have no pending row and stay NULL.
UPDATE public.offices o
SET signup_billing_cycle = p.billing_cycle
FROM public.pending_broker_signups p
WHERE p.completed_office_id = o.id
  AND p.billing_cycle IS NOT NULL
  AND o.signup_billing_cycle IS NULL;

-- Re-create the resume RPC so newly provisioned offices capture `signup_billing_cycle` inline.
-- Signature is unchanged; `CREATE OR REPLACE` keeps existing grants intact.
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
    plan_tier,
    signup_billing_cycle
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
    NULLIF(v_pending.plan_tier, ''),
    NULLIF(v_pending.billing_cycle, '')
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
