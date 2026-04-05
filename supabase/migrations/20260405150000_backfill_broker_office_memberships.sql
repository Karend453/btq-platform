-- One-time backfill: brokers with user_profiles.office_id but no office_memberships row
-- (e.g. signed up after office_memberships existed, before complete_broker_signup inserted a row).
-- Idempotent: safe to re-run; only inserts when no (office_id, user_id) row exists.

INSERT INTO public.office_memberships (office_id, user_id, role, status)
SELECT up.office_id, up.id, 'broker', 'active'
FROM public.user_profiles up
WHERE up.role = 'broker'
  AND up.office_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.office_memberships om
    WHERE om.office_id = up.office_id
      AND om.user_id = up.id
  );
