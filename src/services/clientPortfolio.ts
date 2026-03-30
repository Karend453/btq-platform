import { supabase, supabaseInitError } from "../lib/supabaseClient";

export async function syncClientPortfolioFromTransaction(
  transactionId: string,
): Promise<void> {
  if (!supabase) {
    throw new Error(supabaseInitError ?? "Supabase is not configured.");
  }


  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .select(`
      id,
      identifier,
      type,
      agent,
      agent_user_id,
      office,
      office_id,
      clientname,
      clientemail,
      clientphone,
      propertyaddress,
      closing_date,
      saleprice,
      gci,
      lead_source
    `)
    .eq("id", transactionId)
    .single();
    if (txError) {
      console.error("Failed to load transaction for portfolio sync", txError);
      return;
    }
    
    if (!tx) return;
    
    if (!tx.office_id) {
      console.error("Portfolio sync skipped: missing office_id on transaction", tx);
      return;
    }

  const { data: existing, error: existingError } = await supabase
    .from("client_portfolio")
    .select("id, portfolio_stage")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  // 🔒 DO NOT overwrite final

if (existing?.portfolio_stage === "final") {
  console.log("STOPPED because portfolio is final", existing);
  return;
}

  // Determine stage
  const hasFinancials =
    tx.closing_date ||
    tx.saleprice ||
    tx.gci !== null;

  const portfolioStage = hasFinancials ? "estimated" : "seeded";

  console.log("ABOUT TO WRITE TO PORTFOLIO");
  const payload = {
    transaction_id: tx.id,

    // Office
    office_id: tx.office_id ? String(tx.office_id) : null,
    office_name: tx.office ?? null,

    // Agent
    agent_id: tx.agent_user_id ?? null,
    agent_name: tx.agent ?? null,

    // Client
    client_name: tx.clientname ?? "",
    email: tx.clientemail ?? null,
    phone: tx.clientphone ?? null,

    // Property
    property_address_primary:
      tx.propertyaddress ?? tx.identifier ?? null,
    property_address_secondary: null,

    // Financials
    revenue_amount: tx.gci ?? null,
    close_price: tx.saleprice
      ? Number(String(tx.saleprice).replace(/[^0-9.-]/g, ""))
      : null,
    list_price: null,

    // Dates
    event_date: tx.closing_date ?? null,

    // Meta
    transaction_type: tx.type ?? null,
    source: tx.lead_source ?? "transaction",
    portfolio_stage: portfolioStage,
  };

  const { error: upsertError } = await supabase
    .from("client_portfolio")
    .upsert(payload, { onConflict: "transaction_id" });

  if (upsertError) {
    throw new Error(upsertError.message);
  }
}

export type ClientPortfolioRow = {
  id: string;
  transaction_id: string | null;
  office_id: string | null;
  office_name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  transaction_type: string | null;
  client_name: string;
  email: string | null;
  phone: string | null;
  property_address_primary: string | null;
  property_address_secondary: string | null;
  revenue_amount: number | null;
  list_price: number | null;
  close_price: number | null;
  event_date: string | null;
  created_at: string;
  updated_at: string | null;
  notes: string | null;
  source: string | null;
  tags: string[] | null;
  portfolio_stage: "seeded" | "estimated" | "final";
};

export type ClientPortfolioFilters = {
  year?: number;
  agentId?: string;
  transactionType?: string;
};

export async function listClientPortfolio(
  filters: ClientPortfolioFilters = {}
): Promise<ClientPortfolioRow[]> {
  if (!supabase) {
    throw new Error(supabaseInitError ?? "Supabase is not configured.");
  }

  let query = supabase
    .from("client_portfolio")
    .select("*")
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (filters.agentId) {
    query = query.eq("agent_id", filters.agentId);
  }

  if (filters.transactionType) {
    query = query.eq("transaction_type", filters.transactionType);
  }

  if (filters.year) {
    const start = `${filters.year}-01-01`;
    const end = `${filters.year}-12-31`;
    query = query.gte("event_date", start).lte("event_date", end);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || "Failed to load client portfolio.");
  }

  return (data ?? []) as ClientPortfolioRow[];
}

export function summarizeClientPortfolio(rows: ClientPortfolioRow[]) {
  const closedRows = rows.filter((row) => !!row.event_date);

  const totalGci = closedRows.reduce(
    (sum, row) => sum + (Number(row.revenue_amount) || 0),
    0
  );

  const closingsCount = closedRows.length;

  const avgGciPerDeal =
    closingsCount > 0 ? totalGci / closingsCount : 0;

  return {
    totalGci,
    closingsCount,
    avgGciPerDeal,
  };
}