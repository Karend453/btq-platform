-- Finalize export package metadata + finalized_at for audit/retention (ZIP generated client-side; paths stored here).
alter table public.client_portfolio
  add column if not exists finalized_at timestamptz,
  add column if not exists export_created_at timestamptz,
  add column if not exists export_created_by uuid,
  add column if not exists export_created_by_email text,
  add column if not exists export_status text,
  add column if not exists export_file_name text,
  add column if not exists export_storage_path text,
  add column if not exists retention_delete_at timestamptz;

comment on column public.client_portfolio.finalized_at is 'When portfolio_stage became final (first finalize).';
comment on column public.client_portfolio.export_created_at is 'When the downloadable ZIP export was generated.';
comment on column public.client_portfolio.export_created_by is 'auth.users id of user who ran finalize/export.';
comment on column public.client_portfolio.export_created_by_email is 'Denormalized email at export time for audit display.';
comment on column public.client_portfolio.export_status is 'pending | ready | failed';
comment on column public.client_portfolio.export_file_name is 'Suggested download filename for the ZIP.';
comment on column public.client_portfolio.export_storage_path is 'Object key in transaction-documents bucket.';
comment on column public.client_portfolio.retention_delete_at is 'Optional future purge date; null = not scheduled.';

-- Allow authenticated uploads to the transaction-documents bucket (export ZIP + existing inbox uploads).
drop policy if exists "btq_transaction_docs_authenticated_insert" on storage.objects;
create policy "btq_transaction_docs_authenticated_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'transaction-documents');

-- Extend finalize RPC: set finalized_at on first finalization.
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

  return jsonb_build_object(
    'success', true,
    'portfolio_id', v_portfolio.id
  );
end;
$function$;
