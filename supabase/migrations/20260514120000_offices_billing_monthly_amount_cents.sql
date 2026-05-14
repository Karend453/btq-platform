-- Denormalized Stripe-derived recurring monthly amount for each office.
--
-- This is the SINGLE SOURCE OF TRUTH for "what does this office actually pay each month",
-- across Settings → My Wallet, Back Office → Billing, and Back Office → Business Overview.
-- It is populated by api/billing/webhook.ts (checkout / subscription / invoice events) from
-- the Stripe subscription line items via `sumSubscriptionLineItemsMinor` — never from BTQ's
-- internal plan/seat catalogs. NULL means the office has no active Stripe subscription
-- (legacy/manual offices, pre-checkout state, etc.).
--
-- Currency for this amount is the existing `billing_currency` column.

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS billing_monthly_amount_cents integer;

COMMENT ON COLUMN public.offices.billing_monthly_amount_cents IS
  'Stripe-derived recurring monthly amount (sum of subscription line items, in minor units of '
  'billing_currency). Authoritative for "monthly revenue" displays. Webhook-maintained; NULL when '
  'no live Stripe subscription is attached.';
