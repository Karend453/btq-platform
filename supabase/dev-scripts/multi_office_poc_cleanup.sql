-- =====================================================================
-- DEV-ONLY: Undo the multi-office proof-of-concept seed.
-- =====================================================================
-- Removes:
--   * Every office_memberships row that points to an office whose name
--     is 'Multi Office Test Office'.
--   * The office row itself (only those marked with the POC billing_admin_note,
--     so a real office that happens to share the name isn't deleted).
-- Leaves alone:
--   * user_profiles (we never touched it).
--   * The user's original office or its memberships.
-- =====================================================================

BEGIN;

DELETE FROM public.office_memberships om
 USING public.offices o
 WHERE om.office_id = o.id
   AND o.name = 'Multi Office Test Office'
   AND o.billing_admin_note LIKE 'DEV TEST: multi-office%';

DELETE FROM public.offices o
 WHERE o.name = 'Multi Office Test Office'
   AND o.billing_admin_note LIKE 'DEV TEST: multi-office%';

-- Verify nothing related to the POC remains.
SELECT 'remaining_test_offices' AS section, o.id, o.name, o.billing_admin_note
  FROM public.offices o
 WHERE o.name = 'Multi Office Test Office';

SELECT 'remaining_test_memberships' AS section, om.*
  FROM public.office_memberships om
  JOIN public.offices o ON o.id = om.office_id
 WHERE o.name = 'Multi Office Test Office';

COMMIT;
