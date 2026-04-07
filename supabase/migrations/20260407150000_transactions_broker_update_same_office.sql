-- Brokers can SELECT transactions in their office (transactions_select_by_role) but had
-- no UPDATE policy. Office-scoped PATCH from Edit Transaction Details returned 0 rows.

begin;

drop policy if exists brokers_update_transactions_same_office on public.transactions;

create policy brokers_update_transactions_same_office
on public.transactions
for update
to authenticated
using (
  exists (
    select 1
    from user_profiles up
    where (
      (up.id = auth.uid())
      and (up.role = 'broker'::text)
      and (up.office_id is not null)
      and (up.office_id = transactions.office_id)
    )
  )
)
with check (
  exists (
    select 1
    from user_profiles up
    where (
      (up.id = auth.uid())
      and (up.role = 'broker'::text)
      and (up.office_id is not null)
      and (up.office_id = transactions.office_id)
    )
  )
);

commit;
