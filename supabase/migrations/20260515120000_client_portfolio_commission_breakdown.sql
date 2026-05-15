-- v1 commission split: persist gross / agent payout / office net on the finalized portfolio row
-- (the existing production-numbers source of truth) so analytics never drifts after finalization.
--
-- Calculation (always):
--   gross_commission_amount        = sale_price * commission_percent / 100  (already captured as revenue_amount today)
--   referral_fee_amount            = COALESCE(transactions.referral_fee_amount, 0)
--   adjusted_gross_commission_amount = gross_commission_amount - referral_fee_amount
--   agent_net_commission_amount    = adjusted_gross_commission_amount * agent_split_percent / 100
--   office_net_commission_amount   = adjusted_gross_commission_amount - agent_net_commission_amount
--
-- agent_split_percent is the snapshot of office_memberships.agent_split_percent at finalize
-- time, with a 40% fallback when the membership row has not been configured.
--
-- TODO (future): transaction-level overrides (luxury, caps, graduated splits, special
-- exceptions) should layer in here _before_ the agent/office net split.

ALTER TABLE public.client_portfolio
  ADD COLUMN IF NOT EXISTS gross_commission_amount numeric,
  ADD COLUMN IF NOT EXISTS referral_fee_amount numeric,
  ADD COLUMN IF NOT EXISTS adjusted_gross_commission_amount numeric,
  ADD COLUMN IF NOT EXISTS agent_net_commission_amount numeric,
  ADD COLUMN IF NOT EXISTS office_net_commission_amount numeric,
  ADD COLUMN IF NOT EXISTS agent_split_percent numeric;

COMMENT ON COLUMN public.client_portfolio.gross_commission_amount IS
  'Gross commission = sale_price * commission_percent / 100. Snapshot at finalize; mirrors legacy revenue_amount but is now the authoritative gross field.';
COMMENT ON COLUMN public.client_portfolio.referral_fee_amount IS
  'Referral fee deducted before the agent/office split. Null/blank treated as 0 in calculations.';
COMMENT ON COLUMN public.client_portfolio.adjusted_gross_commission_amount IS
  'Gross commission after referral fee deduction. Input to the agent/office split.';
COMMENT ON COLUMN public.client_portfolio.agent_net_commission_amount IS
  'Agent payout = adjusted gross * agent_split_percent / 100. Surfaced to agents as "Your Net Commission" and to brokers as "Agent Payout".';
COMMENT ON COLUMN public.client_portfolio.office_net_commission_amount IS
  'Office net commission = adjusted gross - agent payout. Brokers/admins only.';
COMMENT ON COLUMN public.client_portfolio.agent_split_percent IS
  'Agent split snapshot (0–100) used to compute agent/office net on this row. Office retained percent = 100 - this value.';

-- ---------------------------------------------------------------------------
-- Helper: resolve the agent split for a transaction's agent at the moment of write
-- (active office_memberships row → 40% fallback). NULL on the membership row also
-- falls back to 40 so historical/legacy memberships never break the math.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_agent_split_for_transaction (
  p_transaction_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT om.agent_split_percent
      FROM public.transactions t
      JOIN public.office_memberships om
        ON om.user_id = t.agent_user_id
       AND om.office_id = t.office_id
       AND om.status = 'active'
      WHERE t.id = p_transaction_id
        AND om.agent_split_percent IS NOT NULL
      LIMIT 1
    ),
    40
  );
$$;

GRANT EXECUTE ON FUNCTION public.resolve_agent_split_for_transaction (uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Backfill existing client_portfolio rows so analytics shows agent/office net
-- immediately. Uses the row's current revenue_amount as the gross figure and
-- the transaction's referral fee + the assigned agent's membership split
-- (40% fallback). Does NOT mutate finalized totals — only fills the new
-- breakdown columns.
-- ---------------------------------------------------------------------------
WITH src AS (
  SELECT
    cp.id,
    COALESCE(cp.revenue_amount, 0) AS gross,
    COALESCE(t.referral_fee_amount, 0) AS ref_fee,
    COALESCE(om.agent_split_percent, 40) AS split_pct
  FROM public.client_portfolio cp
  LEFT JOIN public.transactions t
    ON t.id = cp.transaction_id
  LEFT JOIN public.office_memberships om
    ON om.user_id = t.agent_user_id
   AND om.office_id = t.office_id
   AND om.status = 'active'
), calc AS (
  SELECT
    id,
    gross,
    ref_fee,
    GREATEST(gross - ref_fee, 0) AS adjusted,
    split_pct
  FROM src
)
UPDATE public.client_portfolio cp
SET
  gross_commission_amount = calc.gross,
  referral_fee_amount = calc.ref_fee,
  adjusted_gross_commission_amount = calc.adjusted,
  agent_net_commission_amount = calc.adjusted * calc.split_pct / 100,
  office_net_commission_amount = calc.adjusted - (calc.adjusted * calc.split_pct / 100),
  agent_split_percent = calc.split_pct
FROM calc
WHERE cp.id = calc.id
  AND (
    cp.gross_commission_amount IS NULL
    OR cp.agent_split_percent IS NULL
  );

-- ---------------------------------------------------------------------------
-- finalize_transaction_closing: write commission breakdown alongside locked totals.
-- Keeps existing authorization + idempotency behavior from earlier migrations.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_transaction_closing (
  p_transaction_id uuid,
  p_close_price numeric,
  p_closing_date date,
  p_revenue_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_portfolio public.client_portfolio%rowtype;
  v_ref_fee numeric;
  v_split_pct numeric;
  v_adjusted numeric;
  v_agent_net numeric;
  v_office_net numeric;
BEGIN
  IF auth.uid () IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.transactions t
    WHERE t.id = p_transaction_id
      AND (
        t.agent_user_id = auth.uid ()
        OR t.assigned_admin_user_id = auth.uid ()
        OR (
          t.assignedadmin IS NOT NULL
          AND btrim(t.assignedadmin) = auth.uid ()::text
        )
        OR EXISTS (
          SELECT 1
          FROM public.user_profiles up
          WHERE up.id = auth.uid ()
            AND up.role = ANY (ARRAY['broker'::text, 'admin'::text, 'btq_admin'::text])
            AND up.office_id IS NOT DISTINCT FROM t.office_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized to finalize this transaction';
  END IF;

  IF p_close_price IS NULL OR p_closing_date IS NULL OR p_revenue_amount IS NULL THEN
    RAISE EXCEPTION 'close_price, closing_date, and revenue_amount are required';
  END IF;

  SELECT *
  INTO v_portfolio
  FROM public.client_portfolio
  WHERE transaction_id = p_transaction_id
  LIMIT 1;

  IF v_portfolio.id IS NULL THEN
    INSERT INTO public.client_portfolio (
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
    SELECT
      t.id,
      COALESCE(t.office, ''),
      t.office,
      t.agent_user_id,
      t.agent,
      t.type,
      COALESCE(nullif(trim(t.clientname), ''), 'Unknown client'),
      COALESCE(t.buyeremail1, t.selleremail1),
      t.identifier,
      t.gci,
      CASE
        WHEN nullif(t.saleprice, '') IS NOT NULL THEN t.saleprice::numeric
        ELSE NULL
      END,
      CASE
        WHEN nullif(t.closing_date, '') IS NOT NULL THEN t.closing_date::date
        ELSE NULL
      END,
      t.lead_source,
      now ()
    FROM public.transactions t
    WHERE t.id = p_transaction_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transaction % not found', p_transaction_id;
    END IF;
    SELECT *
    INTO v_portfolio
    FROM public.client_portfolio
    WHERE transaction_id = p_transaction_id
    LIMIT 1;
  END IF;

  IF COALESCE(v_portfolio.portfolio_stage::text, '') = 'final' THEN
    RAISE EXCEPTION 'Closing already finalized';
  END IF;

  SELECT COALESCE(t.referral_fee_amount, 0)
  INTO v_ref_fee
  FROM public.transactions t
  WHERE t.id = p_transaction_id;

  v_ref_fee := COALESCE(v_ref_fee, 0);
  v_split_pct := public.resolve_agent_split_for_transaction (p_transaction_id);
  v_adjusted := GREATEST(p_revenue_amount - v_ref_fee, 0);
  v_agent_net := v_adjusted * v_split_pct / 100;
  v_office_net := v_adjusted - v_agent_net;

  UPDATE public.client_portfolio
  SET
    close_price = p_close_price,
    event_date = p_closing_date,
    revenue_amount = p_revenue_amount,
    gross_commission_amount = p_revenue_amount,
    referral_fee_amount = v_ref_fee,
    adjusted_gross_commission_amount = v_adjusted,
    agent_net_commission_amount = v_agent_net,
    office_net_commission_amount = v_office_net,
    agent_split_percent = v_split_pct,
    portfolio_stage = 'final',
    last_updated_by_document_id = NULL,
    last_updated_at = now (),
    updated_at = now (),
    finalized_at = COALESCE(finalized_at, now ())
  WHERE id = v_portfolio.id;

  RETURN jsonb_build_object (
    'success', true,
    'portfolio_id', v_portfolio.id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.finalize_transaction_closing (uuid, numeric, date, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- apply_document_to_portfolio: when document ingestion sets the 'final' branch,
-- mirror finalize_transaction_closing and snapshot the commission breakdown.
-- All other branches are untouched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_document_to_portfolio (p_document_id uuid, p_transaction_id uuid, p_update_type text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_portfolio public.client_portfolio%rowtype;
  v_changed boolean := false;
  v_old text;
  v_new text;
  v_date_str text;
  v_ref_fee numeric;
  v_split_pct numeric;
  v_gross numeric;
  v_adjusted numeric;
  v_agent_net numeric;
  v_office_net numeric;
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
    v_date_str := coalesce(
      nullif(trim(p_payload->>'event_date'), ''),
      nullif(trim(p_payload->>'closing_date'), '')
    );
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
    if nullif(p_payload->>'revenue_amount', '') is not null
       and coalesce(v_portfolio.revenue_amount::text, '') is distinct from (p_payload->>'revenue_amount') then
      v_old := v_portfolio.revenue_amount::text;
      v_new := p_payload->>'revenue_amount';
      update public.client_portfolio
      set revenue_amount = (p_payload->>'revenue_amount')::numeric
      where id = v_portfolio.id;
      insert into public.document_field_updates (
        document_id, transaction_id, field_name, old_value, new_value
      ) values (
        p_document_id, p_transaction_id, 'revenue_amount', v_old, v_new
      );
      v_changed := true;
      v_portfolio.revenue_amount := (p_payload->>'revenue_amount')::numeric;
    end if;
    if v_date_str is not null
       and v_portfolio.event_date is distinct from v_date_str::date then
      v_old := v_portfolio.event_date::text;
      v_new := v_date_str;
      update public.client_portfolio
      set event_date = v_date_str::date
      where id = v_portfolio.id;
      insert into public.document_field_updates (
        document_id, transaction_id, field_name, old_value, new_value
      ) values (
        p_document_id, p_transaction_id, 'event_date', v_old, v_new
      );
      v_changed := true;
      v_portfolio.event_date := v_date_str::date;
    end if;

    -- Commission breakdown snapshot for the 'final' branch (mirrors
    -- finalize_transaction_closing). Re-read v_portfolio.revenue_amount so this
    -- works whether revenue_amount was just updated above or pre-existed.
    select coalesce(t.referral_fee_amount, 0)
    into v_ref_fee
    from public.transactions t
    where t.id = p_transaction_id;
    v_ref_fee := coalesce(v_ref_fee, 0);
    v_split_pct := public.resolve_agent_split_for_transaction(p_transaction_id);
    v_gross := coalesce(v_portfolio.revenue_amount, 0);
    v_adjusted := greatest(v_gross - v_ref_fee, 0);
    v_agent_net := v_adjusted * v_split_pct / 100;
    v_office_net := v_adjusted - v_agent_net;

    update public.client_portfolio
    set
      gross_commission_amount = v_gross,
      referral_fee_amount = v_ref_fee,
      adjusted_gross_commission_amount = v_adjusted,
      agent_net_commission_amount = v_agent_net,
      office_net_commission_amount = v_office_net,
      agent_split_percent = v_split_pct
    where id = v_portfolio.id;
    v_changed := true;
    v_portfolio.gross_commission_amount := v_gross;
    v_portfolio.referral_fee_amount := v_ref_fee;
    v_portfolio.adjusted_gross_commission_amount := v_adjusted;
    v_portfolio.agent_net_commission_amount := v_agent_net;
    v_portfolio.office_net_commission_amount := v_office_net;
    v_portfolio.agent_split_percent := v_split_pct;

    if coalesce(v_portfolio.portfolio_stage::text, '') is distinct from 'final' then
      update public.client_portfolio
      set portfolio_stage = 'final'
      where id = v_portfolio.id;
      v_changed := true;
      v_portfolio.portfolio_stage := 'final';
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
