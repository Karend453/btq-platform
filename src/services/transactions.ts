// src/services/transactions.ts

import { WorkItem, WorkItemStatus } from "../types/workItem";
import { supabase } from "../lib/supabaseClient";
import type { PostgrestError } from "@supabase/supabase-js";
import { getCurrentUser } from "./auth";
import { resolveChecklistTemplateForNewTransaction } from "./checklistTemplates";
import { fetchComplianceDocCountsByTransactionIds } from "./checklistItems";

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
 * Display label for the transaction agent. `agent_user_id` is canonical; list/buyer names are
 * only used as display hints, chosen by `transaction_side` so we don't default to buyer first.
 * (Cross-user profile/email is not available from the client under current user_profiles RLS.)
 */
export function getAssignedAgentDisplayNameFromRow(row: TransactionRow): string {
  const list = (row.listagent ?? "").trim();
  const buyer = (row.buyeragent ?? "").trim();
  const hasAgentUid = !!(row.agent_user_id && String(row.agent_user_id).trim());

  if (!hasAgentUid) {
    if (list) return list;
    if (buyer) return buyer;
    return "";
  }

  const side = (row.transaction_side ?? "").toLowerCase();
  const buyerSide =
    /\b(buyer|purchase|buy\s*side|buyer's)\b/.test(side) ||
    side.includes("buyer");
  const sellerSide =
    /\b(seller|list|listing|sell\s*side|seller's)\b/.test(side) ||
    side.includes("seller") ||
    side.includes("list");

  if (buyerSide && !sellerSide) return buyer || list;
  if (sellerSide && !buyerSide) return list || buyer;
  return list || buyer;
}

function toWorkItem(row: TransactionRow): WorkItem {
  const allowed: WorkItemStatus[] = ["error", "warning", "success", "pending", "info"];

  const status = allowed.includes(row.status as WorkItemStatus)
    ? (row.status as WorkItemStatus)
    : "info";

  const agentDisplayName = getAssignedAgentDisplayNameFromRow(row);

  return {
    id: row.id,
    identifier: row.identifier ?? row.id,
    type: row.type ?? "",
    owner: row.assignedadmin ?? "",
    agentDisplayName: agentDisplayName || undefined,
    status,
    statusLabel: row.status ?? "",
    rawTransactionStatus: row.status ?? undefined,
    dueDate: row.closing_date ?? "",
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
};

export async function createTransaction(input: CreateTransactionInput): Promise<WorkItem | null> {
  const user = await getCurrentUser();
  if (!user?.id) {
    console.error("[createTransaction] no authenticated user; cannot set agent_user_id");
    return null;
  }

  const checklistTemplate = await resolveChecklistTemplateForNewTransaction(input.type);

  const payload = {
    identifier: input.identifier,
    type: input.type,
    clientname: input.clientName,
    office: input.officeId,
    status: "Pre-Contract",
    isarchived: false,
    archivedat: null,
    agent_user_id: user.id,
    ...(checklistTemplate
      ? {
          checklist_template_id: checklistTemplate.id,
          checklisttype: checklistTemplate.name,
        }
      : {}),
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
export async function listTransactions(): Promise<WorkItem[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*");

  if (error) {
    console.error("Failed to load transactions", error);
    return [];
  }

  const rows = (data ?? []) as TransactionRow[];
  const items = rows.map((row) => toWorkItem(row));
  const ids = items.map((i) => i.id);
  const counts = await fetchComplianceDocCountsByTransactionIds(ids);

  return items.map((item) => {
    const c = counts[item.id];
    const pending = c?.pending ?? 0;
    const rejected = c?.rejected ?? 0;
    return {
      ...item,
      compliancePendingReviewCount: pending,
      complianceRejectedCount: rejected,
      missingCount: pending,
      rejectedCount: rejected,
    };
  });
}