begin;

alter table public.transactions enable row level security;
alter table public.client_portfolio enable row level security;

-- =====================================================
-- transactions
-- =====================================================

drop policy if exists transactions_insert_by_role on public.transactions;
drop policy if exists transactions_select_by_role on public.transactions;
drop policy if exists admins_can_update_all_transactions on public.transactions;
drop policy if exists agents_can_update_own_transactions on public.transactions;
drop policy if exists transactions_update_agent_or_assigned_admin on public.transactions;
drop policy if exists transactions_update_claim_agent_null on public.transactions;

create policy transactions_insert_by_role
on public.transactions
for insert
to authenticated
with check (
  EXISTS (
    SELECT 1
    FROM user_profiles up
    WHERE (
      (up.id = auth.uid())
      AND (
        (
          (up.role = ANY (ARRAY['broker'::text, 'admin'::text, 'btq_admin'::text]))
          AND (up.office_id = transactions.office_id)
        )
        OR (
          (up.role = 'agent'::text)
          AND (up.office_id = transactions.office_id)
          AND (transactions.agent_user_id = auth.uid())
        )
      )
    )
  )
);

create policy transactions_select_by_role
on public.transactions
for select
to authenticated
using (
  EXISTS (
    SELECT 1
    FROM user_profiles up
    WHERE (
      (up.id = auth.uid())
      AND (
        (
          (up.role = ANY (ARRAY['broker'::text, 'admin'::text, 'btq_admin'::text]))
          AND (up.office_id = transactions.office_id)
        )
        OR (
          (up.role = 'agent'::text)
          AND (transactions.agent_user_id = auth.uid())
        )
      )
    )
  )
);

create policy admins_can_update_all_transactions
on public.transactions
for update
to authenticated
using (
  EXISTS (
    SELECT 1
    FROM user_profiles up
    WHERE (
      (up.id = auth.uid())
      AND (up.role = 'admin'::text)
    )
  )
)
with check (
  EXISTS (
    SELECT 1
    FROM user_profiles up
    WHERE (
      (up.id = auth.uid())
      AND (up.role = 'admin'::text)
    )
  )
);

create policy agents_can_update_own_transactions
on public.transactions
for update
to authenticated
using (
  agent_user_id = auth.uid()
)
with check (
  agent_user_id = auth.uid()
);

create policy transactions_update_agent_or_assigned_admin
on public.transactions
for update
to authenticated
using (
  (
    (agent_user_id = auth.uid())
    OR (assigned_admin_user_id = auth.uid())
    OR (
      (assignedadmin IS NOT NULL)
      AND (btrim(assignedadmin) = (auth.uid())::text)
    )
  )
)
with check (
  (
    (agent_user_id = auth.uid())
    OR (assigned_admin_user_id = auth.uid())
    OR (
      (assignedadmin IS NOT NULL)
      AND (btrim(assignedadmin) = (auth.uid())::text)
    )
  )
);

create policy transactions_update_claim_agent_null
on public.transactions
for update
to authenticated
using (
  agent_user_id IS NULL
)
with check (
  agent_user_id = auth.uid()
);

-- =====================================================
-- client_portfolio
-- =====================================================

drop policy if exists client_portfolio_insert_by_role on public.client_portfolio;
drop policy if exists client_portfolio_select_same_office on public.client_portfolio;
drop policy if exists client_portfolio_update_by_role on public.client_portfolio;

create policy client_portfolio_insert_by_role
on public.client_portfolio
for insert
to authenticated
with check (
  EXISTS (
    SELECT 1
    FROM user_profiles up
    WHERE (
      (up.id = auth.uid())
      AND (
        (
          (up.role = ANY (ARRAY['broker'::text, 'admin'::text, 'btq_admin'::text]))
          AND ((up.office_id)::text = client_portfolio.office_id)
        )
        OR (
          (up.role = 'agent'::text)
          AND ((up.office_id)::text = client_portfolio.office_id)
          AND (client_portfolio.agent_id = auth.uid())
        )
      )
    )
  )
);

create policy client_portfolio_select_same_office
on public.client_portfolio
for select
to authenticated
using (
  EXISTS (
    SELECT 1
    FROM user_profiles up
    WHERE (
      (up.id = auth.uid())
      AND (up.office_id = (client_portfolio.office_id)::uuid)
    )
  )
);

create policy client_portfolio_update_by_role
on public.client_portfolio
for update
to authenticated
using (
  EXISTS (
    SELECT 1
    FROM user_profiles up
    WHERE (
      (up.id = auth.uid())
      AND (
        (
          (up.role = ANY (ARRAY['broker'::text, 'admin'::text, 'btq_admin'::text]))
          AND ((up.office_id)::text = client_portfolio.office_id)
        )
        OR (
          (up.role = 'agent'::text)
          AND ((up.office_id)::text = client_portfolio.office_id)
          AND (client_portfolio.agent_id = auth.uid())
        )
      )
    )
  )
)
with check (
  EXISTS (
    SELECT 1
    FROM user_profiles up
    WHERE (
      (up.id = auth.uid())
      AND (
        (
          (up.role = ANY (ARRAY['broker'::text, 'admin'::text, 'btq_admin'::text]))
          AND ((up.office_id)::text = client_portfolio.office_id)
        )
        OR (
          (up.role = 'agent'::text)
          AND ((up.office_id)::text = client_portfolio.office_id)
          AND (client_portfolio.agent_id = auth.uid())
        )
      )
    )
  )
);

commit;