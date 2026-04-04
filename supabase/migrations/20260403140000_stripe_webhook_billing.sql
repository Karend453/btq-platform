-- Stripe webhook: billing columns on offices + idempotent event log.
-- Safe to re-run: IF NOT EXISTS / IF NOT EXISTS for indexes.

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS billing_status text,
  ADD COLUMN IF NOT EXISTS billing_plan_tier text,
  ADD COLUMN IF NOT EXISTS billing_price_id text,
  ADD COLUMN IF NOT EXISTS billing_seat_quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS billing_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS billing_cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_last_invoice_id text,
  ADD COLUMN IF NOT EXISTS billing_last_payment_status text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS billing_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS app_access_status text NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS public.stripe_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  stripe_event_id text UNIQUE NOT NULL,
  stripe_event_type text NOT NULL,
  stripe_object_id text,
  office_id uuid REFERENCES public.offices (id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'received',
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.stripe_event_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS offices_stripe_customer_id_idx ON public.offices (stripe_customer_id);

CREATE INDEX IF NOT EXISTS offices_stripe_subscription_id_idx ON public.offices (stripe_subscription_id);

CREATE INDEX IF NOT EXISTS stripe_event_log_office_id_idx ON public.stripe_event_log (office_id);

CREATE INDEX IF NOT EXISTS stripe_event_log_stripe_event_type_idx ON public.stripe_event_log (stripe_event_type);
