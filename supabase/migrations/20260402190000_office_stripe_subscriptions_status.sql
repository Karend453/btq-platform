-- Current Stripe subscription status (mirrors Stripe.Subscription.status at last webhook write).

ALTER TABLE public.office_stripe_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text;
