-- Durable export lifecycle for finalized closings (ZIP generation comes in a later phase).
begin;

create table public.transaction_exports (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  status text not null
    check (status in ('queued', 'processing', 'ready', 'failed')),
  requested_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  failed_at timestamptz null,
  requested_by uuid null references auth.users (id),
  zip_storage_path text null,
  manifest_storage_path text null,
  document_count integer null,
  byte_size bigint null,
  error_message text null,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.transaction_exports is 'Closing export packages (ZIP) — status tracked server-side; generation not implemented in v1 slice.';

create index transaction_exports_transaction_id_idx
  on public.transaction_exports (transaction_id);

create index transaction_exports_transaction_id_requested_at_desc_idx
  on public.transaction_exports (transaction_id, requested_at desc);

create or replace function public.set_transaction_exports_updated_at()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists transaction_exports_set_updated_at on public.transaction_exports;
create trigger transaction_exports_set_updated_at
before update on public.transaction_exports
for each row
execute function public.set_transaction_exports_updated_at();

alter table public.transaction_exports enable row level security;

-- Read: same office/role model as public.transactions (transactions_select_by_role).
drop policy if exists transaction_exports_select_by_transaction_access on public.transaction_exports;
create policy transaction_exports_select_by_transaction_access
on public.transaction_exports
for select
to authenticated
using (
  exists (
    select 1
    from public.transactions t
    where t.id = transaction_exports.transaction_id
      and exists (
        select 1
        from public.user_profiles up
        where up.id = auth.uid()
          and (
            (
              up.role = any (array['broker'::text, 'admin'::text, 'btq_admin'::text])
              and up.office_id = t.office_id
            )
            or (
              up.role = 'agent'::text
              and up.office_id = t.office_id
              and t.agent_user_id = auth.uid()
            )
          )
      )
  )
);

-- No insert/update/delete for authenticated — rows are created by finalize_transaction_closing (SECURITY DEFINER)
-- and future workers will use service role.

grant select on public.transaction_exports to authenticated;

-- Finalize closing: lock portfolio and enqueue export in one coordinated success path.
create or replace function public.finalize_transaction_closing(
  p_transaction_id uuid,
  p_close_price numeric,
  p_closing_date date,
  p_revenue_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_portfolio public.client_portfolio%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.transactions t
    where t.id = p_transaction_id
      and (
        t.agent_user_id = auth.uid()
        or t.assigned_admin_user_id = auth.uid()
        or (
          t.assignedadmin is not null
          and btrim(t.assignedadmin) = auth.uid()::text
        )
        or exists (
          select 1
          from public.user_profiles up
          where up.id = auth.uid()
            and up.role = any (array['broker'::text, 'admin'::text, 'btq_admin'::text])
            and up.office_id is not distinct from t.office_id
        )
      )
  ) then
    raise exception 'Not authorized to finalize this transaction';
  end if;

  if p_close_price is null or p_closing_date is null or p_revenue_amount is null then
    raise exception 'close_price, closing_date, and revenue_amount are required';
  end if;

  select *
  into v_portfolio
  from public.client_portfolio
  where transaction_id = p_transaction_id
  limit 1;

  if v_portfolio.id is null then
    insert into public.client_portfolio (
      transaction_id,
      office_id,
      office_name,
      agent_id,
      agent_name,
      transaction_type,
      client_name,
      email,
      property_address_primary,
      revenue_amount,
      close_price,
      event_date,
      source,
      created_at
    )
    select
      t.id,
      coalesce(t.office, ''),
      t.office,
      t.agent_user_id,
      t.agent,
      t.type,
      coalesce(nullif(trim(t.clientname), ''), 'Unknown client'),
      coalesce(t.buyeremail1, t.selleremail1),
      t.identifier,
      t.gci,
      case
        when nullif(t.saleprice, '') is not null then t.saleprice::numeric
        else null
      end,
      case
        when nullif(t.closing_date, '') is not null then t.closing_date::date
        else null
      end,
      t.lead_source,
      now()
    from public.transactions t
    where t.id = p_transaction_id;
    if not found then
      raise exception 'Transaction % not found', p_transaction_id;
    end if;
    select *
    into v_portfolio
    from public.client_portfolio
    where transaction_id = p_transaction_id
    limit 1;
  end if;

  if coalesce(v_portfolio.portfolio_stage::text, '') = 'final' then
    raise exception 'Closing already finalized';
  end if;

  update public.client_portfolio
  set
    close_price = p_close_price,
    event_date = p_closing_date,
    revenue_amount = p_revenue_amount,
    portfolio_stage = 'final',
    last_updated_by_document_id = null,
    last_updated_at = now(),
    updated_at = now(),
    finalized_at = coalesce(finalized_at, now())
  where id = v_portfolio.id;

  insert into public.transaction_exports (
    transaction_id,
    status,
    requested_by
  ) values (
    p_transaction_id,
    'queued',
    auth.uid()
  );

  return jsonb_build_object(
    'success', true,
    'portfolio_id', v_portfolio.id
  );
end;
$function$;

commit;
