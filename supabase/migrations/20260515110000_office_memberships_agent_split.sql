-- v1 commission split: per-membership agent split (0–100) stored on office_memberships.
-- The office-retained percent is always derived as 100 - agent_split_percent (no second column).
-- TODO: transaction-level overrides (luxury, caps, graduated/tiered splits) are NOT supported here.
--       When those land, add a transaction-scoped override column + helper that takes precedence
--       over this membership value at finalize/sync time.

ALTER TABLE public.office_memberships
  ADD COLUMN IF NOT EXISTS agent_split_percent numeric;

-- Default to 40% for any row currently NULL so analytics/finalize math has a stable baseline
-- (broker can edit later from Team Management). NULL remains technically allowed for
-- future "no split configured yet" states, but UI + RPC normalize to 40 either way.
UPDATE public.office_memberships
SET agent_split_percent = 40
WHERE agent_split_percent IS NULL;

ALTER TABLE public.office_memberships
  ALTER COLUMN agent_split_percent SET DEFAULT 40;

ALTER TABLE public.office_memberships
  DROP CONSTRAINT IF EXISTS office_memberships_agent_split_percent_range;

ALTER TABLE public.office_memberships
  ADD CONSTRAINT office_memberships_agent_split_percent_range
  CHECK (agent_split_percent IS NULL OR (agent_split_percent >= 0 AND agent_split_percent <= 100));

COMMENT ON COLUMN public.office_memberships.agent_split_percent IS
  'Agent split of commission (0–100). Office retained percent is 100 - agent_split_percent. NULL falls back to 40 in calculations until broker/admin edits it. Broker/admin controlled; agents cannot edit their own split.';

-- ---------------------------------------------------------------------------
-- RPC: broker/admin (same office) or btq_admin can set an agent/admin's split.
-- Matches existing broker_*_office_member RPC pattern (SECURITY DEFINER, no
-- recursive RLS on office_memberships — uses helper-style EXISTS lookups).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broker_set_office_member_agent_split (
  p_office_id uuid,
  p_user_id uuid,
  p_agent_split_percent numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid uuid := auth.uid ();
  v_target_role text;
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_office_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Office and member are required';
  END IF;

  IF p_agent_split_percent IS NULL THEN
    RAISE EXCEPTION 'Agent split is required';
  END IF;

  IF p_agent_split_percent < 0 OR p_agent_split_percent > 100 THEN
    RAISE EXCEPTION 'Agent split must be between 0 and 100';
  END IF;

  -- Authorize: caller is broker/admin in the same office, or a BTQ admin.
  IF NOT (
    EXISTS (
      SELECT 1
      FROM public.office_memberships om
      WHERE om.office_id = p_office_id
        AND om.user_id = v_caller_uid
        AND om.status = 'active'
        AND lower(trim(om.role)) IN ('broker', 'admin')
    )
    OR public.is_btq_admin (v_caller_uid)
  ) THEN
    RAISE EXCEPTION 'Not authorized to edit splits in this office';
  END IF;

  SELECT lower(trim(om.role))
  INTO v_target_role
  FROM public.office_memberships om
  WHERE om.office_id = p_office_id
    AND om.user_id = p_user_id
  LIMIT 1;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Member not found in this office';
  END IF;

  -- Brokers are not on a split (they take office retention). Allow editing for
  -- admins/agents only; this matches the Team Management UI which surfaces the
  -- field for admin/agent rows.
  IF v_target_role NOT IN ('admin', 'agent') THEN
    RAISE EXCEPTION 'Split is only configurable for admin or agent members';
  END IF;

  UPDATE public.office_memberships
  SET
    agent_split_percent = p_agent_split_percent,
    updated_at = now ()
  WHERE office_id = p_office_id
    AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.broker_set_office_member_agent_split (uuid, uuid, numeric) TO authenticated;
