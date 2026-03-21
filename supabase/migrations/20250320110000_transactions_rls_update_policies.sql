-- public.transactions: UPDATE was missing after RLS enablement (INSERT/SELECT only).
-- Agents may update rows they own; assigned admins may update rows they manage.
-- Legacy: assignedadmin may hold the admin auth uid as text when assigned_admin_user_id is unset.

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_update_agent_or_assigned_admin" ON public.transactions;

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
