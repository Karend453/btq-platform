-- Back Office list RPC: add billing snapshot + active membership count for billing dashboard (visibility only).
--
-- DROP-then-CREATE: this migration grows the v1 function's RETURNS TABLE from 12 → 21 columns
-- (adds billing_*, plan_tier, billing_plan_tier, display_plan_label, active_member_count).
-- Postgres rejects `CREATE OR REPLACE` when the RETURNS TABLE shape changes (SQLSTATE 42P13 —
-- "cannot change return type of existing function" / "Row type defined by OUT parameters is
-- different"). Dropping first makes the migration idempotent for fresh DBs, DBs running the
-- 12-column shape from 20260406120000, and DBs left in a partial state by a failed earlier run.

DROP FUNCTION IF EXISTS public.list_offices_for_back_office ();

CREATE FUNCTION public.list_offices_for_back_office ()
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
  plan_tier text,
  billing_plan_tier text,
  display_plan_label text,
  active_member_count bigint
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
    o.plan_tier::text,
    o.billing_plan_tier::text,
    o.display_plan_label::text,
    (
      SELECT count(*)::bigint
      FROM public.office_memberships m
      WHERE m.office_id = o.id
        AND m.status = 'active'
    ) AS active_member_count
  FROM public.offices o
  ORDER BY o.name ASC NULLS LAST, o.id ASC;
END;
$$;
