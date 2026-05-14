-- Global BTQ Back Office settings (manual estimates). Single row id `default`; btq_admin only via RLS.
--
-- Idempotency: this migration uses IF NOT EXISTS / DROP-IF-EXISTS-then-CREATE / ON CONFLICT
-- throughout so `supabase db push` can re-run it safely after a partial failure (the original
-- bare `CREATE TABLE` raised "relation already exists" once the table was created but a later
-- statement failed). Re-running now should leave the schema in the same final state as a
-- successful first run.

CREATE TABLE IF NOT EXISTS public.btq_backoffice_settings (
  id text PRIMARY KEY DEFAULT 'default',
  monthly_expense_estimate_cents integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT btq_backoffice_settings_singleton CHECK (id = 'default'),
  CONSTRAINT btq_backoffice_settings_monthly_expense_nonneg CHECK (monthly_expense_estimate_cents >= 0)
);

COMMENT ON TABLE public.btq_backoffice_settings IS 'Global BTQ Back Office settings (e.g. manual monthly expense estimate). Editable by btq_admin only.';

INSERT INTO public.btq_backoffice_settings (id, monthly_expense_estimate_cents)
VALUES ('default', 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_btq_backoffice_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS btq_backoffice_settings_set_updated_at ON public.btq_backoffice_settings;
CREATE TRIGGER btq_backoffice_settings_set_updated_at
  BEFORE UPDATE ON public.btq_backoffice_settings
  FOR EACH ROW
  execute function public.set_btq_backoffice_settings_updated_at();

ALTER TABLE public.btq_backoffice_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS btq_backoffice_settings_select_btq_admin ON public.btq_backoffice_settings;
CREATE POLICY btq_backoffice_settings_select_btq_admin
  ON public.btq_backoffice_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND lower(trim(up.role)) = 'btq_admin'
    )
  );

DROP POLICY IF EXISTS btq_backoffice_settings_insert_btq_admin ON public.btq_backoffice_settings;
CREATE POLICY btq_backoffice_settings_insert_btq_admin
  ON public.btq_backoffice_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND lower(trim(up.role)) = 'btq_admin'
    )
    AND id = 'default'
  );

DROP POLICY IF EXISTS btq_backoffice_settings_update_btq_admin ON public.btq_backoffice_settings;
CREATE POLICY btq_backoffice_settings_update_btq_admin
  ON public.btq_backoffice_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND lower(trim(up.role)) = 'btq_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND lower(trim(up.role)) = 'btq_admin'
    )
    AND id = 'default'
  );

GRANT SELECT, INSERT, UPDATE ON public.btq_backoffice_settings TO authenticated;
