-- Add invite_name to office_memberships so the Team Management roster can show
-- the name the broker/admin entered when inviting a member, even while the
-- invite is still pending. Mirrors invite_email: pending invitees have
-- user_profiles.office_id = NULL until they accept, so user_profiles RLS hides
-- their display_name from the inviting broker and the roster has no other
-- source for the entered name.
alter table public.office_memberships
  add column if not exists invite_name text;

comment on column public.office_memberships.invite_name is
  'Display name entered by the broker/admin when inviting this member (e.g. "First Last"). Populated on pending invites so the Team Management roster can show the entered name before acceptance, when user_profiles RLS hides display_name from the inviting broker. Null for non-invite memberships.';

-- Backfill existing pending invites from user_profiles.display_name (which the
-- add-team-member API already populates at invite time) so the display fix
-- applies retroactively to invites created before this column existed.
update public.office_memberships om
set invite_name = trim(up.display_name)
from public.user_profiles up
where up.id = om.user_id
  and om.status = 'pending'
  and om.role in ('admin', 'agent')
  and (om.invite_name is null or trim(om.invite_name) = '')
  and up.display_name is not null
  and trim(up.display_name) <> '';
