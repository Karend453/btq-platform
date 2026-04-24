-- Add invite_email to office_memberships so pending invites can display the
-- invited email/name before a user_profiles row exists (user hasn't accepted yet).
alter table public.office_memberships
  add column if not exists invite_email text;

comment on column public.office_memberships.invite_email is
  'Email address used when inviting this member. Populated on pending invites so the Pending Acceptance UI can display identity before the user accepts and a user_profiles row is linked. Null for non-invite memberships.';
