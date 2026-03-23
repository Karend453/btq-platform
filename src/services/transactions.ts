// src/services/transactions.ts

import { WorkItem, WorkItemStatus, type ComplianceDominantState } from "../types/workItem";
import { supabase } from "../lib/supabaseClient";
import type { PostgrestError } from "@supabase/supabase-js";
import { getCurrentUser, getTransactionRuntimeRole, getUserProfileRoleKey } from "./auth";
import { getOfficeRosterForCurrentBroker } from "./officeRoster";
import { resolveChecklistTemplateForNewTransaction } from "./checklistTemplates";
import { fetchComplianceDocCountsByTransactionIds } from "./checklistItems";
import { checklistItemToEngineDocument } from "../lib/documents/adapter";
import type { ChecklistItemShape } from "../lib/documents/adapter";
import { getTransactionClosingReadiness } from "../lib/documents/documentEngine";
import type { DocumentEngineDocument } from "../lib/documents/types";

function compactDefined<T extends Record<string, unknown>>(row: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(row).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}


export type TransactionRow = {
  id: string;
  identifier: string | null;
  clientname: string | null;
  type: string | null;
  office: string | null;
  status: string | null;
  /** Legacy or display; may also hold admin UID when `assigned_admin_user_id` is unset. */
  assignedadmin: string | null;
  /** Preferred stable auth UID of assigned admin. */
  assigned_admin_user_id: string | null;
  contractdate: string | null;
  /** Supabase column `closing_date` */
  closing_date: string | null;
  checklisttype: string | null;
  checklist_template_id: string | null;
  saleprice: number | null;
  sellernames: string | null;
  buyernames: string | null;
  listagent: string | null;
  buyeragent: string | null;
  /** Stable auth UID of agent. Use for identity; listagent/buyeragent are display names only. */
  agent_user_id: string | null;
  listcommissionpercent: string | null;
  buyercommissionpercent: string | null;
  listcommissionamount: string | null;
  buyercommissionamount: string | null;
  transaction_side: string | null;
  transaction_category: string | null;
  lead_source: string | null;
  gci: number | null;
  referral_fee_amount: number | null;
  isarchived: boolean | null;
  archivedat: string | null;
};

/** Stable admin auth UID: prefer `assigned_admin_user_id`, else legacy `assignedadmin` when it holds the UID. */
export function getAssignedAdminUserId(row: Pick<TransactionRow, "assigned_admin_user_id" | "assignedadmin">): string | null {
  return row.assigned_admin_user_id ?? row.assignedadmin ?? null;
}

/**
 * Interprets `transaction_side` the same way as {@link getAssignedAgentDisplayNameFromRow}.
 * Keep in sync with `supabase/migrations/20250321140000_backfill_agent_display_from_profiles.sql`.
 */
export function transactionSideFlags(transactionSide: string | null | undefined): {
  buyerSide: boolean;
  sellerSide: boolean;
} {
  const side = (transactionSide ?? "").toLowerCase();
  const buyerSide =
    /\b(buyer|purchase|buy\s*side|buyer's)\b/.test(side) || side.includes("buyer");
  const sellerSide =
    /\b(seller|list|listing|sell\s*side|seller's)\b/.test(side) ||
    side.includes("seller") ||
    side.includes("list");
  return { buyerSide, sellerSide };
}

/**
 * Session user email into `listagent` / `buyeragent` without cross-user reads.
 * - Listing-only → `listagent` only
 * - Buyer-only → `buyeragent` only
 * - Ambiguous (both or neither) → both set so `list || buyer` in display always has a value
 */
export function sessionAgentNameFieldsForTransactionSide(
  transactionSide: string | null | undefined,
  sessionEmail: string
): { listagent: string | null; buyeragent: string | null } {
  const email = sessionEmail.trim();
  if (!email) return { listagent: null, buyeragent: null };
  const { buyerSide, sellerSide } = transactionSideFlags(transactionSide);
  if (buyerSide && !sellerSide) return { listagent: null, buyeragent: email };
  if (sellerSide && !buyerSide) return { listagent: email, buyeragent: null };
  return { listagent: email, buyeragent: email };
}

/**
 * Display label for the transaction agent. `agent_user_id` is canonical; list/buyer names are
 * only used as display hints, chosen by `transaction_side` so we don't default to buyer first.
 * (Cross-user profile/email is not available from the client under current user_profiles RLS.)
 */
export function getAssignedAgentDisplayNameFromRow(row: TransactionRow): string {
  const list = (row.listagent ?? "").trim();
  const buyer = (row.buyeragent ?? "").trim();

  if (!list && !buyer) {
    return "Unassigned";
  }

  const hasAgentUid = !!(row.agent_user_id && String(row.agent_user_id).trim());

  if (!hasAgentUid) {
    return list || buyer;
  }

  const { buyerSide, sellerSide } = transactionSideFlags(row.transaction_side);

  if (buyerSide && !sellerSide) return buyer || list;
  if (sellerSide && !buyerSide) return list || buyer;
  return list || buyer;
}

/**
 * Prefer human-readable labels over raw emails for the list and transaction details (no cross-user profile reads).
 * Roster-backed names are applied separately for brokers when available.
 */
export function formatAgentLabelForList(raw: string): string {
  const s = raw.trim();
  if (!s || s === "Unassigned") return raw;
  const at = s.indexOf("@");
  if (at <= 0 || at === s.length - 1) return raw;
  const local = s.slice(0, at).replace(/[._]+/g, " ").trim();
  if (!local) return raw;
  return local
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

/** List column: Sale / Purchase / Lease / Other (non-matching → Other). */
function normalizeTransactionTypeForList(type: string | null): string {
  const t = (type ?? "").toLowerCase();
  if (t.includes("lease")) return "Lease";
  if (t.includes("purchase") || t.includes("buy")) return "Purchase";
  if (t.includes("sale")) return "Sale";
  return "Other";
}

function formatRiskMinimal(
  readiness: ReturnType<typeof getTransactionClosingReadiness>
): string {
  const m = readiness.missingRequiredCount;
  const r = readiness.rejectedRequiredCount;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} missing`);
  if (r > 0) parts.push(`${r} rejected`);
  return parts.length > 0 ? parts.join(", ") : "—";
}

function toWorkItem(row: TransactionRow): WorkItem {
  const agentDisplayName = formatAgentLabelForList(getAssignedAgentDisplayNameFromRow(row));
  const { readiness, dominant } = getComplianceReadinessAndDominant(row, []);
  const wf = dominantStateToTableFields(dominant, readiness);
  const closing = row.closing_date ?? "";

  return {
    id: row.id,
    identifier: row.identifier ?? row.id,
    type: normalizeTransactionTypeForList(row.type),
    owner: row.assignedadmin ?? "",
    agentDisplayName: agentDisplayName.trim() || undefined,
    status: wf.statusLabel,
    statusLabel: wf.statusLabel,
    statusType: wf.status,
    stage: (row.status ?? "").trim() || "—",
    rawTransactionStatus: row.status ?? undefined,
    closingDate: closing,
    dueDate: closing,
    risk: formatRiskMinimal(readiness),
    missingCount: 0,
    rejectedCount: 0,
    lastActivity: "",
    organizationId: `org_${(row.office ?? "unknown").toLowerCase().replace(/\s+/g, "_")}`,
    organizationName: row.office ?? "",
    isArchived: row.isarchived ?? false,
    archivedBy: null,
  };
}

export async function getTransaction(id: string): Promise<TransactionRow | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Failed to load transaction", error);
    return null;
  }

  return data as TransactionRow;
}

type CreateTransactionInput = {
  identifier: string;
  type: string;
  clientName: string;
  officeId: string;
  /** Stored on `transaction_side`; drives which of listagent/buyeragent gets session email. */
  transactionSide?: string | null;
};

export async function createTransaction(input: CreateTransactionInput): Promise<WorkItem | null> {
  const user = await getCurrentUser();
  if (!user?.id) {
    console.error("[createTransaction] no authenticated user; cannot set agent_user_id");
    return null;
  }

  const checklistTemplate = await resolveChecklistTemplateForNewTransaction(
    input.officeId,
    input.type
  );
  const transactionSide = input.transactionSide ?? null;
  const sessionEmail = user.email?.trim() ?? "";
  const agentFields = sessionAgentNameFieldsForTransactionSide(transactionSide, sessionEmail);

  const payload = {
    identifier: input.identifier,
    type: input.type,
    clientname: input.clientName,
    office: input.officeId,
    status: "Pre-Contract",
    isarchived: false,
    archivedat: null,
    agent_user_id: user.id,
    transaction_side: transactionSide,
    listagent: agentFields.listagent,
    buyeragent: agentFields.buyeragent,
    checklist_template_id: checklistTemplate.id,
    checklisttype: checklistTemplate.name,
  };

  // TODO: remove after RLS insert path verified
  console.log("[createTransaction] public.transactions insert payload:", payload);

  const { data, error } = await supabase
    .from("transactions")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    // TODO: remove after RLS insert path verified
    console.error("[createTransaction] supabase insert error:", error);
    console.error("Failed to create transaction", error);
    return null;
  }

  return data ? toWorkItem(data as TransactionRow) : null;
}
export type UpdateTransactionInput = {
  type?: string | null;
  office?: string | null;
  status?: string | null;
  admin?: string | null;
  contractDate?: string | null;
  closingDate?: string | null;

  sellerNames?: string | null;
  buyerNames?: string | null;
  salePrice?: number | null;
  checklistType?: string | null;
  checklistTemplateId?: string | null;

  listAgent?: string | null;
  buyerAgent?: string | null;
  listCommissionPercent?: string | null;
  buyerCommissionPercent?: string | null;
  listCommissionAmount?: string | null;
  buyerCommissionAmount?: string | null;

  transactionSide?: string | null;
  transactionCategory?: string | null;
  leadSource?: string | null;
  gci?: number | null;
  referralFeeAmount?: number | null;

  /** Set when claiming a legacy row with null agent_user_id (RLS + client must allow). */
  agentUserId?: string | null;
};

export type UpdateTransactionResult = {
  data: TransactionRow | null;
  error: PostgrestError | null;
};

export async function updateTransaction(
  id: string,
  input: UpdateTransactionInput
): Promise<UpdateTransactionResult> {
  const patch = compactDefined({
    type: input.type,
    office: input.office,
    status: input.status,
    assignedadmin: input.admin,
    contractdate: input.contractDate,
    closing_date: input.closingDate,

    sellernames: input.sellerNames,
    buyernames: input.buyerNames,
    saleprice: input.salePrice,
    checklisttype: input.checklistType,
    checklist_template_id: input.checklistTemplateId,

    listagent: input.listAgent,
    buyeragent: input.buyerAgent,
    listcommissionpercent: input.listCommissionPercent,
    buyercommissionpercent: input.buyerCommissionPercent,
    listcommissionamount: input.listCommissionAmount,
    buyercommissionamount: input.buyerCommissionAmount,

    transaction_side: input.transactionSide,
    transaction_category: input.transactionCategory,
    lead_source: input.leadSource,
    gci: input.gci,
    referral_fee_amount: input.referralFeeAmount,
    agent_user_id: input.agentUserId,
  });

  const { data, error } = await supabase
    .from("transactions")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[updateTransaction] Supabase error:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { data: null, error };
  }

  return { data: data as TransactionRow, error: null };
}

// ─── Compliance Overview (dashboard): batched checklist + document engine ───

const CHECKLIST_BATCH_SIZE = 120;

/** Mirrors dashboard TransactionTable row shape (StatusType-compatible). */
export type ComplianceOverviewTableRow = {
  id: string;
  address: string;
  agent: string;
  type: "Sale" | "Purchase" | "Lease";
  status: "success" | "warning" | "error" | "info" | "pending";
  statusLabel: string;
  amount: string;
  closingDate: string;
  documents?: number;
  missingDocs?: number;
};

export type ComplianceOverviewLegend = {
  rejected: number;
  missing: number;
  pendingReview: number;
  complete: number;
};

/** Dashboard KPIs: same RLS scope as Compliance Overview (`transactions` + role filter). */
export type DashboardKpis = {
  /** Non-archived deals with workflow status other than Closed/Archived. */
  activeTransactionCount: number;
  /** Distinct `agent_user_id` on active pipeline deals (null UIDs excluded). */
  distinctAgentsOnActiveDeals: number;
  /** Distinct `office` values on active pipeline deals (empty string excluded). */
  distinctOfficesOnActiveDeals: number;
  /**
   * Sum of `submittedRequiredCount` from the document engine across all non-archived
   * scoped transactions (required compliance docs awaiting admin review).
   */
  complianceDocsPendingReviewCount: number;
  /** Sum of `saleprice` on active pipeline deals (null prices excluded). */
  activePipelineSalePriceSum: number;
};

export type ComplianceOverviewData = {
  legend: ComplianceOverviewLegend;
  /** Mutually exclusive dominant state per row; table lists non-complete only. */
  tableRows: ComplianceOverviewTableRow[];
  kpis: DashboardKpis;
};

function parseReviewStatusForEngine(
  s: string | null | undefined
): ChecklistItemShape["reviewStatus"] {
  const v = (s ?? "pending").toLowerCase();
  if (v === "pending" || v === "rejected" || v === "complete" || v === "waived") return v;
  return "pending";
}

type ChecklistItemDbRow = {
  id: string;
  transaction_id: string;
  required: boolean;
  is_compliance_document?: boolean | null;
  reviewstatus: string | null;
  document_id: string | null;
  archived_at?: string | null;
};

function dbChecklistRowToShape(row: ChecklistItemDbRow): ChecklistItemShape {
  return {
    id: row.id,
    requirement: row.required ? "required" : "optional",
    isComplianceDocument: row.is_compliance_document !== false,
    reviewStatus: parseReviewStatusForEngine(row.reviewstatus),
    documentId: row.document_id ?? null,
  };
}

function mapTransactionType(type: string | null): ComplianceOverviewTableRow["type"] {
  const t = (type ?? "").toLowerCase();
  if (t.includes("lease")) return "Lease";
  if (t.includes("purchase") || t.includes("buy")) return "Purchase";
  return "Sale";
}

function formatCurrencyUsd(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatClosingDate(iso: string | null): string {
  if (!iso) return "—";
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return iso;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(d));
}

function closingSortKey(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const d = Date.parse(iso);
  return Number.isNaN(d) ? Number.POSITIVE_INFINITY : d;
}

/** Pipeline / “active deal” for KPI counts: not archived and not terminal workflow status. */
function isActivePipelineTransaction(row: TransactionRow): boolean {
  if (row.isarchived) return false;
  const s = (row.status ?? "").trim().toLowerCase();
  if (s === "closed" || s === "archived") return false;
  return true;
}

function resolveDominantState(readiness: ReturnType<typeof getTransactionClosingReadiness>): ComplianceDominantState {
  if (readiness.rejectedRequiredCount > 0) return "rejected";
  if (readiness.missingRequiredCount > 0) return "missing";
  if (readiness.submittedRequiredCount > 0) return "pending_review";
  return "complete";
}

function dominantStateToTableFields(
  dominant: ComplianceDominantState,
  readiness: ReturnType<typeof getTransactionClosingReadiness>
): Pick<ComplianceOverviewTableRow, "status" | "statusLabel" | "documents" | "missingDocs"> {
  switch (dominant) {
    case "rejected":
      return {
        status: "error",
        statusLabel: "Rejected",
        missingDocs: readiness.rejectedRequiredCount,
        documents: undefined,
      };
    case "missing":
      return {
        status: "warning",
        statusLabel: "Missing required",
        missingDocs: readiness.missingRequiredCount,
        documents: undefined,
      };
    case "pending_review":
      return {
        status: "info",
        statusLabel: "Pending review",
        missingDocs: readiness.submittedRequiredCount,
        documents: undefined,
      };
    default:
      return {
        status: "success",
        statusLabel: "Complete",
        missingDocs: undefined,
        documents: readiness.acceptedRequiredCount,
      };
  }
}

function engineDocumentsForTransaction(
  tx: TransactionRow,
  rows: ChecklistItemDbRow[]
): DocumentEngineDocument[] {
  const officeId = (tx.office ?? "").trim() || "unknown";
  const assignedAdmin = getAssignedAdminUserId(tx);
  return rows.map((r) =>
    checklistItemToEngineDocument(dbChecklistRowToShape(r), tx.id, officeId, {
      assignedAdminUserId: assignedAdmin,
    })
  );
}

async function fetchChecklistRowsForTransactions(
  transactionIds: string[]
): Promise<ChecklistItemDbRow[]> {
  if (transactionIds.length === 0) return [];
  const out: ChecklistItemDbRow[] = [];

  for (let i = 0; i < transactionIds.length; i += CHECKLIST_BATCH_SIZE) {
    const chunk = transactionIds.slice(i, i + CHECKLIST_BATCH_SIZE);
    const { data, error } = await supabase
      .from("checklist_items")
      .select("id, transaction_id, required, is_compliance_document, reviewstatus, document_id, archived_at")
      .in("transaction_id", chunk)
      .is("archived_at", null);

    if (error) {
      console.error("[fetchChecklistRowsForTransactions]", error);
      continue;
    }
    out.push(...((data ?? []) as ChecklistItemDbRow[]));
  }

  return out;
}

function getComplianceReadinessAndDominant(
  tx: TransactionRow,
  checklistRowsForTx: ChecklistItemDbRow[]
): {
  readiness: ReturnType<typeof getTransactionClosingReadiness>;
  dominant: ComplianceDominantState;
} {
  const docs = engineDocumentsForTransaction(tx, checklistRowsForTx);
  const readiness = getTransactionClosingReadiness(docs);
  const dominant = resolveDominantState(readiness);
  return { readiness, dominant };
}

/** Same dominant-state rules as Compliance Overview (engine + closing readiness). */
export function getComplianceDominantStateForTransaction(
  tx: TransactionRow,
  checklistRowsForTx: ChecklistItemDbRow[]
): ComplianceDominantState {
  return getComplianceReadinessAndDominant(tx, checklistRowsForTx).dominant;
}

/**
 * Compliance Overview: two queries (transactions + batched checklist_items), then
 * checklistItemToEngineDocument + getTransactionClosingReadiness per transaction in memory.
 * Agent scope: only that agent's transactions. Admin and broker: same RLS-visible row set (no extra client filter).
 */
export async function fetchComplianceOverviewData(): Promise<ComplianceOverviewData | null> {
  const user = await getCurrentUser();
  const role = await getTransactionRuntimeRole();

  const { data: txData, error: txErr } = await supabase.from("transactions").select("*");

  if (txErr) {
    console.error("fetchComplianceOverviewData: transactions", txErr);
    return null;
  }

  let rows = (txData ?? []) as TransactionRow[];
  rows = rows.filter((r) => !r.isarchived);

  const emptyKpis: DashboardKpis = {
    activeTransactionCount: 0,
    distinctAgentsOnActiveDeals: 0,
    distinctOfficesOnActiveDeals: 0,
    complianceDocsPendingReviewCount: 0,
    activePipelineSalePriceSum: 0,
  };

  if (role === "agent") {
    if (!user?.id) {
      return {
        legend: { rejected: 0, missing: 0, pendingReview: 0, complete: 0 },
        tableRows: [],
        kpis: emptyKpis,
      };
    }
    rows = rows.filter((r) => r.agent_user_id === user.id);
  }
  // role === "admin" | "broker": keep full RLS-scoped set; do not collapse broker identity into admin.

  const ids = rows.map((r) => r.id);
  const checklistRows = await fetchChecklistRowsForTransactions(ids);
  const byTx = new Map<string, ChecklistItemDbRow[]>();
  for (const cr of checklistRows) {
    const tid = cr.transaction_id;
    const list = byTx.get(tid);
    if (list) list.push(cr);
    else byTx.set(tid, [cr]);
  }

  const legend: ComplianceOverviewLegend = {
    rejected: 0,
    missing: 0,
    pendingReview: 0,
    complete: 0,
  };

  const tableRows: ComplianceOverviewTableRow[] = [];
  const kpis: DashboardKpis = { ...emptyKpis };
  const agentIdsOnActive = new Set<string>();
  const officesOnActive = new Set<string>();

  for (const tx of rows) {
    const { readiness, dominant } = getComplianceReadinessAndDominant(tx, byTx.get(tx.id) ?? []);

    kpis.complianceDocsPendingReviewCount += readiness.submittedRequiredCount;

    if (isActivePipelineTransaction(tx)) {
      kpis.activeTransactionCount += 1;
      const uid = tx.agent_user_id?.trim();
      if (uid) agentIdsOnActive.add(uid);
      const off = (tx.office ?? "").trim();
      if (off) officesOnActive.add(off);
      if (tx.saleprice != null && !Number.isNaN(Number(tx.saleprice))) {
        kpis.activePipelineSalePriceSum += Number(tx.saleprice);
      }
    }

    switch (dominant) {
      case "rejected":
        legend.rejected += 1;
        break;
      case "missing":
        legend.missing += 1;
        break;
      case "pending_review":
        legend.pendingReview += 1;
        break;
      default:
        legend.complete += 1;
    }

    if (dominant === "complete") continue;

    const fields = dominantStateToTableFields(dominant, readiness);
    const agentName = getAssignedAgentDisplayNameFromRow(tx);

    tableRows.push({
      id: tx.id,
      address: (tx.identifier ?? "").trim() || "—",
      agent: agentName || "—",
      type: mapTransactionType(tx.type),
      ...fields,
      amount: formatCurrencyUsd(tx.saleprice),
      closingDate: formatClosingDate(tx.closing_date),
    });
  }

  const closingById = new Map(rows.map((r) => [r.id, r.closing_date] as const));
  tableRows.sort(
    (a, b) =>
      closingSortKey(closingById.get(a.id) ?? null) - closingSortKey(closingById.get(b.id) ?? null)
  );

  kpis.distinctAgentsOnActiveDeals = agentIdsOnActive.size;
  kpis.distinctOfficesOnActiveDeals = officesOnActive.size;

  return { legend, tableRows, kpis };
}

export async function listTransactions(
  viewerRoleKey?: "admin" | "agent" | "broker" | null
): Promise<WorkItem[]> {
  const { data, error } = await supabase.from("transactions").select("*");

  if (error) {
    console.error("Failed to load transactions", error);
    return [];
  }

  const role =
    viewerRoleKey !== undefined ? viewerRoleKey : await getUserProfileRoleKey();

  const rosterDisplayByUserId = new Map<string, string>();
  if (role === "broker") {
    const roster = await getOfficeRosterForCurrentBroker();
    for (const r of roster) {
      const dn = (r.display_name ?? "").trim();
      if (r.id && dn) rosterDisplayByUserId.set(r.id, dn);
    }
  }

  const rows = (data ?? []) as TransactionRow[];
  const items = rows.map((row) => toWorkItem(row));
  const ids = items.map((i) => i.id);
  const [counts, checklistRows] = await Promise.all([
    fetchComplianceDocCountsByTransactionIds(ids),
    fetchChecklistRowsForTransactions(ids),
  ]);

  const byTx = new Map<string, ChecklistItemDbRow[]>();
  for (const cr of checklistRows) {
    const tid = cr.transaction_id;
    const list = byTx.get(tid);
    if (list) list.push(cr);
    else byTx.set(tid, [cr]);
  }

  return items.map((item, index) => {
    const c = counts[item.id];
    const pending = c?.pending ?? 0;
    const rejected = c?.rejected ?? 0;
    const tx = rows[index];
    const checklistForTx = byTx.get(tx.id) ?? [];
    const { readiness, dominant } = getComplianceReadinessAndDominant(tx, checklistForTx);
    const wf = dominantStateToTableFields(dominant, readiness);

    const rawAgent = getAssignedAgentDisplayNameFromRow(tx);
    const uid = tx.agent_user_id?.trim();
    let agentDisplayName = rawAgent;
    if (uid && rosterDisplayByUserId.has(uid)) {
      agentDisplayName = rosterDisplayByUserId.get(uid)!;
    } else {
      agentDisplayName = formatAgentLabelForList(rawAgent);
    }

    return {
      ...item,
      agentDisplayName: agentDisplayName.trim() || undefined,
      status: wf.statusLabel,
      statusLabel: wf.statusLabel,
      statusType: wf.status,
      risk: formatRiskMinimal(readiness),
      compliancePendingReviewCount: pending,
      complianceRejectedCount: rejected,
      missingCount: pending,
      rejectedCount: rejected,
      complianceDominant: dominant,
    };
  });
}

/** Re-export for consumers that import compliance types from the service layer. */
export type { ComplianceDominantState };