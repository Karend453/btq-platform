-- Strict SELECT on public.office_memberships without RLS recursion:
-- the policy must not subquery office_memberships directly. This migration replaces
-- public.can_read_office_membership_row with memberships-only rules (own row OR active broker
-- for the office). No user_profiles.office_id / role as office truth; no btq_admin bypass.

CREATE OR REPLACE FUNCTION public.can_read_office_membership_row (
  p_office_id uuid,
  p_row_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_row_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.office_memberships om
      WHERE om.office_id = p_office_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role = 'broker'
        AND om.status = 'active'
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_read_office_membership_row (uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "office_memberships_select_scope" ON public.office_memberships;

CREATE POLICY "office_memberships_select_scope"
  ON public.office_memberships
  FOR SELECT
  TO authenticated
  USING (public.can_read_office_membership_row (office_id, user_id));
