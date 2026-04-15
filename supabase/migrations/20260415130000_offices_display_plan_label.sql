-- Optional UI-only label for My Subscriptions (e.g. "Custom" for legacy billing).
-- Does not affect entitlements; set manually for edge-case offices.

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS display_plan_label text;

COMMENT ON COLUMN public.offices.display_plan_label IS
  'Optional display override for subscription card plan name only; null = use standard tier label.';
