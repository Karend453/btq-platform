create or replace function public.create_client_portfolio_from_transaction()
returns trigger
language plpgsql
as $function$
begin
  if exists (
    select 1
    from public.client_portfolio cp
    where cp.transaction_id = new.id
      and cp.portfolio_stage = 'final'
  ) then
    return new;
  end if;

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
  values (
    new.id,
    new.office,
    new.office,
    new.agent_user_id,
    new.agent,
    new.type,
    new.clientname,
    coalesce(new.buyeremail1, new.selleremail1),
    new.identifier,
    new.gci,
    case
      when nullif(new.saleprice, '') is not null then new.saleprice::numeric
      else null
    end,
    case
      when nullif(new.closing_date, '') is not null then new.closing_date::date
      else null
    end,
    new.lead_source,
    now()
  )
  on conflict (transaction_id) do update
  set
    office_name = excluded.office_name,
    agent_name = excluded.agent_name,
    transaction_type = excluded.transaction_type,
    client_name = excluded.client_name,
    email = excluded.email,
    property_address_primary = excluded.property_address_primary,
    revenue_amount = excluded.revenue_amount,
    close_price = excluded.close_price,
    event_date = excluded.event_date,
    source = excluded.source,
    updated_at = now();

  return new;
end;
$function$;