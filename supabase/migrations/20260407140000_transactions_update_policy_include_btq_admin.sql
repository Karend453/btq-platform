-- Align UPDATE with SELECT: transactions_select_by_role allows btq_admin, but
-- admins_can_update_all_transactions previously allowed only role = 'admin',
-- so btq_admin could read transactions but UPDATE returned 0 rows (empty PATCH response).

begin;

drop policy if exists admins_can_update_all_transactions on public.transactions;

create policy admins_can_update_all_transactions
on public.transactions
for update
to authenticated
using (
  exists (
    select 1
    from user_profiles up
    where (
      (up.id = auth.uid())
      and (up.role = any (array['admin'::text, 'btq_admin'::text]))
    )
  )
)
with check (
  exists (
    select 1
    from user_profiles up
    where (
      (up.id = auth.uid())
      and (up.role = any (array['admin'::text, 'btq_admin'::text]))
    )
  )
);

commit;
