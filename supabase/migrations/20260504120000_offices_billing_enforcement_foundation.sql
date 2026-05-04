-- BTQ billing enforcement — schema foundation only.
-- Does not change RLS, access control, Stripe config, checkout, or webhook handlers.
-- Existing webhook columns retained: billing_last_invoice_id, billing_last_payment_status, billing_updated_at.

-- Expected BTQ semantics for billing_status: active, past_due, restricted, locked, unpaid, canceled.
-- Legacy: api/billing/webhook.ts currently stores Stripe.Subscription.status in billing_status;
--         future work can copy that into stripe_subscription_status and align billing_status with BTQ values.
COMMENT ON COLUMN public.offices.billing_status IS
  'BTQ per-office billing/enforcement state. Expected values: active, past_due, restricted, locked, unpaid, canceled. '
  'Until webhook migration, Stripe subscription status strings (e.g. trialing, active) may also appear here.';

UPDATE public.offices
SET billing_status = 'active'
WHERE billing_status IS NULL;

ALTER TABLE public.offices
  ALTER COLUMN billing_status SET DEFAULT 'active',
  ALTER COLUMN billing_status SET NOT NULL;

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text,
  ADD COLUMN IF NOT EXISTS stripe_latest_invoice_id text,
  ADD COLUMN IF NOT EXISTS stripe_latest_invoice_status text,
  ADD COLUMN IF NOT EXISTS stripe_latest_invoice_url text,
  ADD COLUMN IF NOT EXISTS billing_amount_due_cents integer,
  ADD COLUMN IF NOT EXISTS billing_currency text,
  ADD COLUMN IF NOT EXISTS billing_last_payment_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_last_payment_succeeded_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_grace_period_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_restricted_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_admin_note text;

COMMENT ON COLUMN public.offices.stripe_subscription_status IS
  'Stripe Subscription.status from API/webhook (e.g. active, past_due, trialing, canceled).';

COMMENT ON COLUMN public.offices.stripe_latest_invoice_id IS
  'Stripe Invoice.id for the latest invoice snapshot used for billing UI or reconciliation.';

COMMENT ON COLUMN public.offices.stripe_latest_invoice_status IS
  'Stripe Invoice.status (e.g. paid, open, void).';

COMMENT ON COLUMN public.offices.stripe_latest_invoice_url IS
  'Hosted invoice URL from Stripe when available.';

COMMENT ON COLUMN public.offices.billing_amount_due_cents IS
  'Outstanding amount due for the office subscription, in minor units (e.g. cents), if tracked.';

COMMENT ON COLUMN public.offices.billing_currency IS
  'ISO currency code for billing_amount_due_cents (e.g. usd).';

COMMENT ON COLUMN public.offices.billing_last_payment_failed_at IS
  'Timestamp of the most recent failed payment (e.g. from invoice.payment_failed).';

COMMENT ON COLUMN public.offices.billing_last_payment_succeeded_at IS
  'Timestamp of the most recent successful payment.';

COMMENT ON COLUMN public.offices.billing_grace_period_ends_at IS
  'When a grace period for past_due / remedy ends before enforcement actions.';

COMMENT ON COLUMN public.offices.billing_locked_at IS
  'When the office entered a fully locked billing state (foundation only; no behavior wired yet).';

COMMENT ON COLUMN public.offices.billing_restricted_at IS
  'When the office entered a restricted billing state (foundation only; no behavior wired yet).';

COMMENT ON COLUMN public.offices.billing_admin_note IS
  'Internal BTQ note for billing exceptions or manual review.';

COMMENT ON COLUMN public.offices.billing_updated_at IS
  'Last time billing-related fields were updated (e.g. Stripe webhook writes).';
