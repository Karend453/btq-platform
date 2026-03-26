-- Stripe billing linkage (schema prep only — no Stripe automation, webhooks, or checkout).
-- One row per brokerage workspace; aligns with user_profiles.office_id and transaction scoping.

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Back Office list: include linkage ids for admin tooling (same auth gate as before).
DROP FUNCTION IF EXISTS public.list_offices_for_back_office();
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
      AND lower(trim(up.role)) = 'admin'
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
