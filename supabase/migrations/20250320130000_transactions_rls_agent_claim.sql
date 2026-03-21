-- Narrow fix: legacy rows with agent_user_id IS NULL can only be updated when the UPDATE
-- sets agent_user_id = auth.uid() (claim). All other agent updates stay unchanged.

DROP POLICY IF EXISTS "transactions_update_agent_or_assigned_admin" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update_claim_agent_null" ON public.transactions;

CREATE POLICY "transactions_update_agent_or_assigned_admin"
  ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (
    agent_user_id = auth.uid()
    OR assigned_admin_user_id = auth.uid()
    OR (
      assignedadmin IS NOT NULL
      AND btrim(assignedadmin) = auth.uid()::text
    )
  )
  WITH CHECK (
    agent_user_id = auth.uid()
    OR assigned_admin_user_id = auth.uid()
    OR (
      assignedadmin IS NOT NULL
      AND btrim(assignedadmin) = auth.uid()::text
    )
  );

CREATE POLICY "transactions_update_claim_agent_null"
  ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (agent_user_id IS NULL)
  WITH CHECK (agent_user_id = auth.uid());
