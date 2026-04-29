-- Per-transaction shortcut link to the user's external forms / e-sign workspace
-- (Dotloop loop, SkySlope file, ZipForms workspace, etc.). Stored as a URL only —
-- no credentials, tokens, or usernames are persisted. Provider is resolved from the
-- viewer's `user_profiles.preferred_forms_provider` and is therefore not duplicated here.
--
-- Permissions: existing transactions UPDATE RLS policies already cover this column
-- (admin/broker office-scoped, agent on own claimed rows). No new policies needed.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS external_forms_url text;

COMMENT ON COLUMN public.transactions.external_forms_url IS
  'Optional URL to this transaction''s external forms/e-sign workspace (Dotloop loop, SkySlope file, ZipForms workspace, etc.). NULL when unset. No credentials stored.';
