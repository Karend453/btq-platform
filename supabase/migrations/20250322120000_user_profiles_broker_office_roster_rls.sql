-- Align with app usage (offices linkage + display); idempotent for existing DBs.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS office_id uuid;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS display_name text;

CREATE INDEX IF NOT EXISTS idx_user_profiles_office_id ON public.user_profiles (office_id);

-- Brokers may read other profiles in the same office (read-only roster in Settings).
-- Existing "select own" policy still applies for self-service profile reads.
CREATE POLICY "user_profiles_select_same_office_broker"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles AS viewer
      WHERE viewer.id = auth.uid()
        AND lower(trim(viewer.role)) = 'broker'
        AND viewer.office_id IS NOT NULL
        AND viewer.office_id = user_profiles.office_id
    )
  );
