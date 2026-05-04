-- Running balance + annual goal for Back Office Business Overview (BTQ admin settings).

ALTER TABLE public.btq_backoffice_settings
  ADD COLUMN IF NOT EXISTS starting_balance_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_goal_cents integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.btq_backoffice_settings.starting_balance_cents IS
  'Manual operating balance baseline (cents). Used with selected-month payouts for Business Position.';
COMMENT ON COLUMN public.btq_backoffice_settings.annual_goal_cents IS
  'Annual cash goal (cents) for progress UI; nonnegative.';

ALTER TABLE public.btq_backoffice_settings
  DROP CONSTRAINT IF EXISTS btq_backoffice_settings_annual_goal_nonneg;

ALTER TABLE public.btq_backoffice_settings
  ADD CONSTRAINT btq_backoffice_settings_annual_goal_nonneg CHECK (annual_goal_cents >= 0);
