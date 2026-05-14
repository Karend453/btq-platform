-- =====================================================================
-- DEV-ONLY: Multi-office proof-of-concept seed (NOT a migration).
-- =====================================================================
-- Purpose
--   Verify whether the existing schema lets ONE broker user have active
--   memberships in MORE THAN ONE office, without modifying production
--   code or shipping a public "Add Office" feature.
--
-- What this script does (idempotent)
--   1. Finds the target user by auth.users.email = 'karend453@gmail.com'
--      (the actual Supabase login email for the "John Broker / Pro Realty"
--      test persona). Falls back to user_profiles.email if needed.
--   2. Captures and prints the user's current office_id from
--      user_profiles.office_id and active office_memberships rows.
--   3. Inserts (or reuses) a second office named "Multi Office Test Office"
--      with the absolute minimum NOT NULL fields. Leaves billing/Stripe
--      fields as defaults so the RootLayout billing gate does NOT bounce
--      this user to /billing-required (plan_tier stays NULL ⇒ grandfathered).
--   4. Inserts an active 'broker' office_memberships row connecting the
--      same user_id to the new office. ON CONFLICT (office_id, user_id)
--      it re-asserts role='broker', status='active'.
--   5. Does NOT touch user_profiles.office_id (the whole point of the test
--      is to see whether office_memberships alone can drive the app).
--   6. Prints a final summary so you can verify in the SQL Editor.
--
-- Safety
--   * Marker fields you can grep for when cleaning up:
--       offices.name              = 'Multi Office Test Office'
--       offices.display_name      = 'Multi Office Test Office'
--       offices.billing_admin_note LIKE 'DEV TEST: multi-office%'
--   * Run multi_office_poc_cleanup.sql to remove the test office and
--     its membership row.
--   * Wrapped in BEGIN/COMMIT — abort with ROLLBACK if anything looks wrong.
--
-- How to run
--   Paste into Supabase Studio → SQL Editor → Run, OR run via psql with
--   a connection string that has rights to public.offices /
--   office_memberships (typically the postgres role).
-- =====================================================================

BEGIN;

DO $do$
DECLARE
  v_login_email  text := 'karend453@gmail.com';      -- actual Supabase auth email
  v_persona_email text := 'JBroker@gmail.com';       -- visible-in-app email (fallback only)
  v_user_id      uuid;
  v_resolved_via text;
  v_profile_office_id uuid;
  v_membership_office_ids text;
  v_new_office_id uuid;
  v_office_id_text text;
BEGIN
  -- -----------------------------------------------------------------
  -- 1. Resolve the auth user_id (prefer auth.users, fall back to user_profiles).
  -- -----------------------------------------------------------------
  SELECT u.id
    INTO v_user_id
    FROM auth.users u
   WHERE lower(u.email) = lower(v_login_email)
   LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    v_resolved_via := 'auth.users.email=' || v_login_email;
  ELSE
    -- Some setups don't expose auth.users to the calling role; try user_profiles.
    SELECT up.id
      INTO v_user_id
      FROM public.user_profiles up
     WHERE lower(up.email) IN (lower(v_login_email), lower(v_persona_email))
     LIMIT 1;

    IF v_user_id IS NOT NULL THEN
      v_resolved_via := 'user_profiles.email IN (' || v_login_email || ', ' || v_persona_email || ')';
    END IF;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'Could not find a user with email % (or fallback %). '
      'Check the auth.users / user_profiles tables for the right email and rerun.',
      v_login_email, v_persona_email;
  END IF;

  RAISE NOTICE '[multi-office POC] user_id = % (resolved via %)', v_user_id, v_resolved_via;

  -- -----------------------------------------------------------------
  -- 2. Snapshot current state for the report at the bottom.
  -- -----------------------------------------------------------------
  SELECT up.office_id
    INTO v_profile_office_id
    FROM public.user_profiles up
   WHERE up.id = v_user_id;

  SELECT string_agg(om.office_id::text || ' (' || om.role || '/' || om.status || ')', ', ')
    INTO v_membership_office_ids
    FROM public.office_memberships om
   WHERE om.user_id = v_user_id;

  RAISE NOTICE '[multi-office POC] user_profiles.office_id BEFORE = %', COALESCE(v_profile_office_id::text, '<null>');
  RAISE NOTICE '[multi-office POC] office_memberships BEFORE = %', COALESCE(v_membership_office_ids, '<none>');

  -- -----------------------------------------------------------------
  -- 3. Insert (or reuse) the second test office.
  --    NOT NULL columns we satisfy:
  --      office_id (text, BTQ-…), name, is_active, created_at, updated_at,
  --      billing_status (defaults to 'active' via 20260504120000).
  --    We deliberately leave plan_tier NULL so the broker billing gate in
  --    RootLayout treats this office as legacy (no checkout required).
  -- -----------------------------------------------------------------
  SELECT o.id
    INTO v_new_office_id
    FROM public.offices o
   WHERE o.name = 'Multi Office Test Office'
   ORDER BY o.created_at ASC
   LIMIT 1;

  IF v_new_office_id IS NULL THEN
    v_office_id_text := 'BTQ-' || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO public.offices (
      office_id,
      name,
      display_name,
      state,
      broker_name,
      broker_email,
      is_active,
      created_at,
      updated_at,
      billing_admin_note
    )
    VALUES (
      v_office_id_text,
      'Multi Office Test Office',
      'Multi Office Test Office',
      'NA',
      'John Broker (test)',
      v_login_email,
      TRUE,
      now(),
      now(),
      'DEV TEST: multi-office proof-of-concept seed; safe to delete.'
    )
    RETURNING id INTO v_new_office_id;

    RAISE NOTICE '[multi-office POC] CREATED office id=% office_id_text=%', v_new_office_id, v_office_id_text;
  ELSE
    RAISE NOTICE '[multi-office POC] reusing existing test office id=%', v_new_office_id;
  END IF;

  -- -----------------------------------------------------------------
  -- 4. Insert / re-assert the active broker membership for the same user_id.
  --    unique (office_id, user_id) means this is naturally idempotent.
  --    Does NOT touch user_profiles.office_id.
  -- -----------------------------------------------------------------
  INSERT INTO public.office_memberships (
    office_id,
    user_id,
    role,
    status
  )
  VALUES (
    v_new_office_id,
    v_user_id,
    'broker',
    'active'
  )
  ON CONFLICT (office_id, user_id) DO UPDATE
    SET role = 'broker',
        status = 'active',
        updated_at = now();

  RAISE NOTICE '[multi-office POC] upserted office_memberships row (office=%, user=%, role=broker, status=active)',
    v_new_office_id, v_user_id;

  -- -----------------------------------------------------------------
  -- 5. After-state snapshot for the trailing SELECT to print.
  -- -----------------------------------------------------------------
  SELECT string_agg(om.office_id::text || ' (' || om.role || '/' || om.status || ')', ', ')
    INTO v_membership_office_ids
    FROM public.office_memberships om
   WHERE om.user_id = v_user_id;

  RAISE NOTICE '[multi-office POC] office_memberships AFTER  = %', COALESCE(v_membership_office_ids, '<none>');
  RAISE NOTICE '[multi-office POC] user_profiles.office_id AFTER  = % (intentionally unchanged)',
    COALESCE(v_profile_office_id::text, '<null>');
END
$do$;

-- =====================================================================
-- Final verification SELECTs (these appear in the SQL Editor results).
-- =====================================================================

-- Confirm user identity.
SELECT 'user' AS section, up.id AS user_id, up.email, up.role, up.display_name, up.office_id AS profile_office_id
  FROM public.user_profiles up
  JOIN auth.users u ON u.id = up.id
 WHERE lower(u.email) = lower('karend453@gmail.com')
 LIMIT 1;

-- Confirm both office rows the user is meant to belong to.
SELECT 'offices' AS section,
       o.id,
       o.office_id,
       o.name,
       o.display_name,
       o.is_active,
       o.plan_tier,
       o.billing_status,
       o.stripe_subscription_id,
       o.billing_admin_note
  FROM public.offices o
 WHERE o.id IN (
         SELECT om.office_id
           FROM public.office_memberships om
           JOIN auth.users u ON u.id = om.user_id
          WHERE lower(u.email) = lower('karend453@gmail.com')
       )
 ORDER BY o.created_at ASC;

-- Confirm all of the user's memberships (should be ≥ 2 after this script).
SELECT 'memberships' AS section,
       om.office_id,
       om.role,
       om.status,
       om.created_at,
       om.updated_at,
       o.name AS office_name
  FROM public.office_memberships om
  JOIN auth.users u ON u.id = om.user_id
  LEFT JOIN public.offices o ON o.id = om.office_id
 WHERE lower(u.email) = lower('karend453@gmail.com')
 ORDER BY om.created_at ASC;

COMMIT;
