-- If client_portfolio has no row for the transaction, seed one from public.transactions
-- (same column mapping as create_client_portfolio_from_transaction), then run existing apply logic.
CREATE OR REPLACE FUNCTION public.apply_document_to_portfolio(p_document_id uuid, p_transaction_id uuid, p_update_type text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_portfolio public.client_portfolio%rowtype;
  v_changed boolean := false;
  v_old text;
  v_new text;
begin
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
      raise exception 'No client_portfolio row for transaction % and transaction not found in public.transactions', p_transaction_id;
    end if;
    select *
    into v_portfolio
    from public.client_portfolio
    where transaction_id = p_transaction_id
    limit 1;
  end if;
  if p_update_type = 'client' then
    if nullif(trim(coalesce(p_payload->>'client_name', '')), '') is not null
       and coalesce(v_portfolio.client_name, '') is distinct from (p_payload->>'client_name') then
      v_old := v_portfolio.client_name;
      v_new := p_payload->>'client_name';
      update public.client_portfolio
      set client_name = v_new
      where id = v_portfolio.id;
      insert into public.document_field_updates (
        document_id, transaction_id, field_name, old_value, new_value
      ) values (
        p_document_id, p_transaction_id, 'client_name', v_old, v_new
      );
      v_changed := true;
      v_portfolio.client_name := v_new;
    end if;
    if nullif(trim(coalesce(p_payload->>'email', '')), '') is not null
       and coalesce(v_portfolio.email, '') is distinct from (p_payload->>'email') then
      v_old := v_portfolio.email;
      v_new := p_payload->>'email';
      update public.client_portfolio
      set email = v_new
      where id = v_portfolio.id;
      insert into public.document_field_updates (
        document_id, transaction_id, field_name, old_value, new_value
      ) values (
        p_document_id, p_transaction_id, 'email', v_old, v_new
      );
      v_changed := true;
      v_portfolio.email := v_new;
    end if;
    if nullif(trim(coalesce(p_payload->>'phone', '')), '') is not null
       and coalesce(v_portfolio.phone, '') is distinct from (p_payload->>'phone') then
      v_old := v_portfolio.phone;
      v_new := p_payload->>'phone';
      update public.client_portfolio
      set phone = v_new
      where id = v_portfolio.id;
      insert into public.document_field_updates (
        document_id, transaction_id, field_name, old_value, new_value
      ) values (
        p_document_id, p_transaction_id, 'phone', v_old, v_new
      );
      v_changed := true;
      v_portfolio.phone := v_new;
    end if;
  end if;
  if p_update_type = 'deal' then
    if nullif(trim(coalesce(p_payload->>'property_address_primary', '')), '') is not null
       and coalesce(v_portfolio.property_address_primary, '') is distinct from (p_payload->>'property_address_primary') then
      v_old := v_portfolio.property_address_primary;
      v_new := p_payload->>'property_address_primary';
      update public.client_portfolio
      set property_address_primary = v_new
      where id = v_portfolio.id;
      insert into public.document_field_updates (
        document_id, transaction_id, field_name, old_value, new_value
      ) values (
        p_document_id, p_transaction_id, 'property_address_primary', v_old, v_new
      );
      v_changed := true;
      v_portfolio.property_address_primary := v_new;
    end if;
    if nullif(trim(coalesce(p_payload->>'property_address_secondary', '')), '') is not null
       and coalesce(v_portfolio.property_address_secondary, '') is distinct from (p_payload->>'property_address_secondary') then
      v_old := v_portfolio.property_address_secondary;
      v_new := p_payload->>'property_address_secondary';
      update public.client_portfolio
      set property_address_secondary = v_new
      where id = v_portfolio.id;
      insert into public.document_field_updates (
        document_id, transaction_id, field_name, old_value, new_value
      ) values (
        p_document_id, p_transaction_id, 'property_address_secondary', v_old, v_new
      );
      v_changed := true;
      v_portfolio.property_address_secondary := v_new;
    end if;
    if nullif(trim(coalesce(p_payload->>'agent_name', '')), '') is not null
       and coalesce(v_portfolio.agent_name, '') is distinct from (p_payload->>'agent_name') then
      v_old := v_portfolio.agent_name;
      v_new := p_payload->>'agent_name';
      update public.client_portfolio
      set agent_name = v_new
      where id = v_portfolio.id;
      insert into public.document_field_updates (
        document_id, transaction_id, field_name, old_value, new_value
      ) values (
        p_document_id, p_transaction_id, 'agent_name', v_old, v_new
      );
      v_changed := true;
      v_portfolio.agent_name := v_new;
    end if;
    if nullif(p_payload->>'list_price', '') is not null
       and coalesce(v_portfolio.list_price::text, '') is distinct from (p_payload->>'list_price') then
      v_old := v_portfolio.list_price::text;
      v_new := p_payload->>'list_price';
      update public.client_portfolio
      set list_price = (p_payload->>'list_price')::numeric
      where id = v_portfolio.id;
      insert into public.document_field_updates (
        document_id, transaction_id, field_name, old_value, new_value
      ) values (
        p_document_id, p_transaction_id, 'list_price', v_old, v_new
      );
      v_changed := true;
      v_portfolio.list_price := (p_payload->>'list_price')::numeric;
    end if;
    if nullif(p_payload->>'contract_date', '') is not null
       and coalesce(v_portfolio.contract_date::text, '') is distinct from (p_payload->>'contract_date') then
      v_old := v_portfolio.contract_date::text;
      v_new := p_payload->>'contract_date';
      update public.client_portfolio
      set contract_date = (p_payload->>'contract_date')::date
      where id = v_portfolio.id;
      insert into public.document_field_updates (
        document_id, transaction_id, field_name, old_value, new_value
      ) values (
        p_document_id, p_transaction_id, 'contract_date', v_old, v_new
      );
      v_changed := true;
      v_portfolio.contract_date := (p_payload->>'contract_date')::date;
    end if;
  end if;
  if p_update_type = 'final' then
    if nullif(trim(coalesce(p_payload->>'property_address_primary', '')), '') is not null
       and coalesce(v_portfolio.property_address_primary, '') is distinct from (p_payload->>'property_address_primary') then
      v_old := v_portfolio.property_address_primary;
      v_new := p_payload->>'property_address_primary';
      update public.client_portfolio
      set property_address_primary = v_new
      where id = v_portfolio.id;
      insert into public.document_field_updates (
        document_id, transaction_id, field_name, old_value, new_value
      ) values (
        p_document_id, p_transaction_id, 'property_address_primary', v_old, v_new
      );
      v_changed := true;
      v_portfolio.property_address_primary := v_new;
    end if;
    if nullif(p_payload->>'close_price', '') is not null
       and coalesce(v_portfolio.close_price::text, '') is distinct from (p_payload->>'close_price') then
      v_old := v_portfolio.close_price::text;
      v_new := p_payload->>'close_price';
      update public.client_portfolio
      set close_price = (p_payload->>'close_price')::numeric
      where id = v_portfolio.id;
      insert into public.document_field_updates (
        document_id, transaction_id, field_name, old_value, new_value
      ) values (
        p_document_id, p_transaction_id, 'close_price', v_old, v_new
      );
      v_changed := true;
      v_portfolio.close_price := (p_payload->>'close_price')::numeric;
    end if;
    if nullif(p_payload->>'closing_date', '') is not null
       and coalesce(v_portfolio.closing_date::text, '') is distinct from (p_payload->>'closing_date') then
      v_old := v_portfolio.closing_date::text;
      v_new := p_payload->>'closing_date';
      update public.client_portfolio
      set closing_date = (p_payload->>'closing_date')::date
      where id = v_portfolio.id;
      insert into public.document_field_updates (
        document_id, transaction_id, field_name, old_value, new_value
      ) values (
        p_document_id, p_transaction_id, 'closing_date', v_old, v_new
      );
      v_changed := true;
      v_portfolio.closing_date := (p_payload->>'closing_date')::date;
    end if;
  end if;
  if v_changed then
    update public.client_portfolio
    set
      last_updated_by_document_id = p_document_id,
      last_updated_at = now(),
      updated_at = now()
    where id = v_portfolio.id;
  end if;
  return jsonb_build_object(
    'success', true,
    'changed', v_changed,
    'portfolio_id', v_portfolio.id
  );
end;
$function$;