-- v3 of the Back Office offices list: adds Stripe-derived monthly amount + currency so
-- Business Overview and Billing can display ACTUAL recurring revenue (not catalog math).
--
-- v2 is left intact (Postgres forbids changing RETURNS TABLE on REPLACE). Frontend will
-- migrate to v3 in the same change; v1/v2 remain for any back-compat callers.

CREATE OR REPLACE FUNCTION public.list_offices_for_back_office_v3 ()
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
  stripe_subscription_id text,
  billing_status text,
  billing_last_payment_failed_at timestamptz,
  billing_last_payment_succeeded_at timestamptz,
  billing_amount_due_cents integer,
  billing_monthly_amount_cents integer,
  billing_currency text,
  plan_tier text,
  billing_plan_tier text,
  display_plan_label text,
  active_member_count bigint,
  signup_billing_cycle text,
  billing_seat_quantity integer,
  app_access_status text
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
    o.stripe_subscription_id::text,
    o.billing_status::text,
    o.billing_last_payment_failed_at,
    o.billing_last_payment_succeeded_at,
    o.billing_amount_due_cents,
    o.billing_monthly_amount_cents,
    o.billing_currency::text,
    o.plan_tier::text,
    o.billing_plan_tier::text,
    o.display_plan_label::text,
    (
      SELECT count(*)::bigint
      FROM public.office_memberships m
      WHERE m.office_id = o.id
        AND m.status = 'active'
    ) AS active_member_count,
    o.signup_billing_cycle::text,
    o.billing_seat_quantity,
    o.app_access_status::text
  FROM public.offices o
  ORDER BY o.name ASC NULLS LAST, o.id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_offices_for_back_office_v3 () TO authenticated;
