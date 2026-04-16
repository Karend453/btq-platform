import { supabase, supabaseInitError } from "../lib/supabaseClient";
import { resolveOfficeScopedDataAccess } from "./auth";

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
  return;
}

  // Determine stage
  const hasFinancials =
    tx.closing_date ||
    tx.saleprice ||
    tx.gci !== null;

  const portfolioStage = hasFinancials ? "estimated" : "seeded";

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
  /** Set when portfolio first reaches `final` (finalize closing). */
  finalized_at?: string | null;
  export_created_at?: string | null;
  export_created_by?: string | null;
  export_created_by_email?: string | null;
  /** pending | ready | failed */
  export_status?: string | null;
  export_file_name?: string | null;
  export_storage_path?: string | null;
  retention_delete_at?: string | null;
  /**
   * Workflow status is Closed (`transactions.status`), batched in `listClientPortfolio`.
   * Omitted when not loaded via that path.
   */
  workflowClosed?: boolean;
};

export type ClientPortfolioFilters = {
  year?: number;
  agentId?: string;
  transactionType?: string;
};

/** Latest durable export row for transaction details (server-driven lifecycle). */
export type TransactionExportSnapshot = {
  id: string;
  transaction_id: string;
  status: "queued" | "processing" | "ready" | "failed";
  requested_at: string;
  zip_storage_path: string | null;
  error_message: string | null;
};

/** Snapshot fields for transaction details overview (stage + locked financials when finalized). */
export type ClientPortfolioForTransactionSnapshot = Pick<
  ClientPortfolioRow,
  | "id"
  | "portfolio_stage"
  | "close_price"
  | "event_date"
  | "revenue_amount"
  | "finalized_at"
  | "export_created_at"
  | "export_created_by"
  | "export_created_by_email"
  | "export_status"
  | "export_file_name"
  | "export_storage_path"
  | "retention_delete_at"
>;

/** Portfolio row for a single transaction (for UI: stage badge, finalize flow, final snapshot). */
export async function getClientPortfolioForTransaction(
  transactionId: string,
): Promise<ClientPortfolioForTransactionSnapshot | null> {
  if (!supabase) {
    throw new Error(supabaseInitError ?? "Supabase is not configured.");
  }

  const { denyAll } = await resolveOfficeScopedDataAccess();
  if (denyAll) {
    return null;
  }

  // Do not filter by office_id here: scoped users can have portfolio rows whose office_id does not
  // exactly match profile scope (legacy/sync drift). RPC finalize reads by transaction_id only; matching
  // that avoids "UI shows Finalize" while DB returns already finalized. RLS on client_portfolio still applies.
  const { data, error } = await supabase
    .from("client_portfolio")
    .select(
      "id, portfolio_stage, close_price, event_date, revenue_amount, finalized_at, export_created_at, export_created_by, export_created_by_email, export_status, export_file_name, export_storage_path, retention_delete_at"
    )
    .eq("transaction_id", transactionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load client portfolio.");
  }

  return data as ClientPortfolioForTransactionSnapshot | null;
}

/** Newest export request for a transaction (`requested_at` desc). */
export async function getLatestTransactionExportForTransaction(
  transactionId: string,
): Promise<TransactionExportSnapshot | null> {
  if (!supabase) {
    throw new Error(supabaseInitError ?? "Supabase is not configured.");
  }

  const { denyAll } = await resolveOfficeScopedDataAccess();
  if (denyAll) {
    return null;
  }

  const { data, error } = await supabase
    .from("transaction_exports")
    .select("id, transaction_id, status, requested_at, zip_storage_path, error_message")
    .eq("transaction_id", transactionId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load transaction export.");
  }

  if (!data) return null;

  return data as TransactionExportSnapshot;
}

export async function finalizeTransactionClosing(input: {
  transactionId: string;
  closePrice: number;
  closingDate: string;
  revenueAmount: number;
}): Promise<{ success: boolean; portfolioId?: string }> {
  if (!supabase) {
    throw new Error(supabaseInitError ?? "Supabase is not configured.");
  }

  const { data, error } = await supabase.rpc("finalize_transaction_closing", {
    p_transaction_id: input.transactionId,
    p_close_price: input.closePrice,
    p_closing_date: input.closingDate,
    p_revenue_amount: input.revenueAmount,
  });

  if (error) {
    throw new Error(error.message || "Failed to finalize closing.");
  }

  const row = data as { success?: boolean; portfolio_id?: string } | null;
  return {
    success: !!row?.success,
    portfolioId: row?.portfolio_id,
  };
}

const WORKFLOW_STATUS_BATCH = 120;

async function fetchWorkflowClosedByTransactionId(
  transactionIds: string[],
  /** `transactions.office` must match when set (broker scope). */
  scopeOfficeId?: string | null,
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  if (!supabase || transactionIds.length === 0) return map;

  const unique = [...new Set(transactionIds.map((id) => id.trim()).filter(Boolean))];

  for (let i = 0; i < unique.length; i += WORKFLOW_STATUS_BATCH) {
    const chunk = unique.slice(i, i + WORKFLOW_STATUS_BATCH);
    let q = supabase
      .from("transactions")
      .select("id, status")
      .in("id", chunk);
    if (scopeOfficeId) {
      q = q.eq("office", scopeOfficeId);
    }
    const { data, error } = await q;

    if (error) {
      console.error("[fetchWorkflowClosedByTransactionId]", error);
      continue;
    }

    for (const row of data ?? []) {
      const r = row as { id?: string | null; status?: string | null };
      const id = r.id?.trim();
      if (!id) continue;
      map.set(id, (r.status ?? "").trim().toLowerCase() === "closed");
    }
  }

  return map;
}

export async function listClientPortfolio(
  filters: ClientPortfolioFilters = {}
): Promise<ClientPortfolioRow[]> {
  if (!supabase) {
    throw new Error(supabaseInitError ?? "Supabase is not configured.");
  }

  const { scopeOfficeId, denyAll } = await resolveOfficeScopedDataAccess();
  if (denyAll) {
    return [];
  }

  let query = supabase
    .from("client_portfolio")
    .select("*")
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (scopeOfficeId) {
    query = query.eq("office_id", scopeOfficeId);
  }

  if (filters.agentId) {
    query = query.eq("agent_id", filters.agentId);
  }

  if (filters.transactionType) {
    query = query.eq("transaction_type", filters.transactionType);
  }

  if (filters.year) {
    const start = `${filters.year}-01-01`;
    const end = `${filters.year}-12-31`;
    // Include open pipeline rows (null event_date) while keeping year bounds for closed rows.
    query = query.or(
      `event_date.is.null,and(event_date.gte.${start},event_date.lte.${end})`,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || "Failed to load client portfolio.");
  }

  const raw = (data ?? []) as ClientPortfolioRow[];

  const wfByTx = await fetchWorkflowClosedByTransactionId(
    raw.map((r) => r.transaction_id).filter((id): id is string => !!id?.trim()),
    scopeOfficeId,
  );

  return raw.map((row) => {
    const tid = row.transaction_id?.trim();
    return {
      ...row,
      workflowClosed: tid ? wfByTx.get(tid) === true : false,
    };
  });
}

/** Analytics KPIs: finalized vs non-finalized are never mixed in the same field. */
export function summarizeClientPortfolio(rows: ClientPortfolioRow[]) {
  const finalized = rows.filter((row) => row.portfolio_stage === "final");
  const nonFinal = rows.filter((row) => row.portfolio_stage !== "final");

  const totalGciActual = finalized.reduce(
    (sum, row) => sum + (Number(row.revenue_amount) || 0),
    0,
  );

  const totalVolumeActual = finalized.reduce(
    (sum, row) => sum + (Number(row.close_price) || 0),
    0,
  );

  const potentialGci = nonFinal.reduce(
    (sum, row) => sum + (Number(row.revenue_amount) || 0),
    0,
  );

  const potentialVolume = nonFinal.reduce(
    (sum, row) => sum + (Number(row.close_price) || 0),
    0,
  );

  const closingsCount = finalized.length;

  return {
    totalGciActual,
    totalVolumeActual,
    potentialGci,
    potentialVolume,
    closingsCount,
  };
}