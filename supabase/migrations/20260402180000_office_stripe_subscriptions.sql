-- Stripe subscription facts keyed by office (v1). Webhook writes here only — does not mutate `offices`.
-- `offices` already has stripe_* columns from an older prep migration; this table is the canonical billing row until product decides to denormalize.

CREATE TABLE IF NOT EXISTS public.office_stripe_subscriptions (
  office_id uuid PRIMARY KEY REFERENCES public.offices (id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text NOT NULL,
  broker_plan_key text NOT NULL,
  stripe_checkout_session_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS office_stripe_subscriptions_stripe_subscription_id_idx
  ON public.office_stripe_subscriptions (stripe_subscription_id);

ALTER TABLE public.office_stripe_subscriptions ENABLE ROW LEVEL SECURITY;
