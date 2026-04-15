-- Third membership status: `pending` = invite issued, not yet accepted (no seat until `active`).
-- `inactive` remains broker-initiated removal / deactivation only (not shown as "pending acceptance").
-- `active` = accepted member; billable for admin/agent per existing rules.

ALTER TABLE public.office_memberships
  DROP CONSTRAINT IF EXISTS office_memberships_status_check;

ALTER TABLE public.office_memberships
  ADD CONSTRAINT office_memberships_status_check
  CHECK (status IN ('active', 'inactive', 'pending'));

COMMENT ON COLUMN public.office_memberships.status IS
  'active = member; inactive = removed/deactivated; pending = invite not yet accepted (no seat).';

-- Invited user: flip own pending admin/agent rows to active after login (billing sync client-side).
CREATE OR REPLACE FUNCTION public.activate_pending_office_memberships_for_user ()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.office_memberships om
  SET
    status = 'active',
    updated_at = now()
  WHERE
    om.user_id = (SELECT auth.uid ())
    AND om.status = 'pending'
    AND om.role IN ('admin', 'agent')
  RETURNING om.office_id;
$$;

GRANT EXECUTE ON FUNCTION public.activate_pending_office_memberships_for_user () TO authenticated;
