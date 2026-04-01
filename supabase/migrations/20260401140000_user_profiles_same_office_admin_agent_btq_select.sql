-- Allow office admins and agents to read peer profiles in the same office (mirrors broker roster RLS).
-- Needed so transaction list / compliance UI can resolve agent_user_id → display_name / email via batched SELECT.
CREATE POLICY "user_profiles_select_same_office_admin_agent"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles AS viewer
      WHERE viewer.id = auth.uid()
        AND viewer.office_id IS NOT NULL
        AND viewer.office_id = user_profiles.office_id
        AND lower(trim(viewer.role)) IN ('admin', 'agent')
    )
  );

-- Internal operators may resolve agent labels across offices (client omits office filter; RLS on transactions still applies).
CREATE POLICY "user_profiles_select_btq_admin"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles AS viewer
      WHERE viewer.id = auth.uid()
        AND lower(trim(viewer.role)) = 'btq_admin'
    )
  );
