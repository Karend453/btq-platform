-- Back Office roster: btq_admin (and legacy admin) must be able to read all office_memberships
-- rows so client queries with embedded user_profiles return the full roster. Brokers still use
-- same-office membership; others unchanged.

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
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND lower(trim(up.role)) IN ('admin', 'btq_admin')
    );
$$;
