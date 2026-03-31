-- Manual "Finalize Closing" from the app UI: set final portfolio numbers and lock (no transaction_documents row).
CREATE OR REPLACE FUNCTION public.finalize_transaction_closing(
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.transactions t
    WHERE t.id = p_transaction_id
      AND (
        t.agent_user_id = auth.uid()
        OR t.assigned_admin_user_id = auth.uid()
        OR (
          t.assignedadmin IS NOT NULL
          AND btrim(t.assignedadmin) = auth.uid()::text
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
      coalesce(t.office, ''),
      t.office,
      t.agent_user_id,
      t.agent,
      t.type,
      coalesce(nullif(trim(t.clientname), ''), 'Unknown client'),
      coalesce(t.buyeremail1, t.selleremail1),
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
      now()
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

  IF coalesce(v_portfolio.portfolio_stage::text, '') = 'final' THEN
    RAISE EXCEPTION 'Closing already finalized';
  END IF;

  UPDATE public.client_portfolio
  SET
    close_price = p_close_price,
    event_date = p_closing_date,
    revenue_amount = p_revenue_amount,
    portfolio_stage = 'final',
    last_updated_by_document_id = NULL,
    last_updated_at = now(),
    updated_at = now()
  WHERE id = v_portfolio.id;

  RETURN jsonb_build_object(
    'success', true,
    'portfolio_id', v_portfolio.id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.finalize_transaction_closing(uuid, numeric, date, numeric) TO authenticated;
