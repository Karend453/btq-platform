// src/services/transactions.ts

import { WorkItem, WorkItemStatus } from "../types/workItem";
import { supabase } from "../lib/supabaseClient";


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

function toWorkItem(row: TransactionRow): WorkItem {
  const allowed: WorkItemStatus[] = ["error", "warning", "success", "pending", "info"];

  const status = allowed.includes(row.status as WorkItemStatus)
    ? (row.status as WorkItemStatus)
    : "info";

    return {
      id: row.id,
      identifier: row.identifier ?? row.id,
      type: row.type ?? "",
      owner: row.assignedadmin ?? "",
      status,
      statusLabel: row.status ?? "",
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
  const payload = {
    identifier: input.identifier,
    type: input.type,
    clientname: input.clientName,
    office: input.officeId,
    isarchived: false,
    archivedat: null,
  };

  const { data, error } = await supabase
    .from("transactions")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
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
};

export async function updateTransaction(
  id: string,
  input: UpdateTransactionInput
) {
  const patch = {
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
  };

  console.log("[updateTransaction] public.transactions patch keys:", Object.keys(patch));

  const { data, error } = await supabase.from("transactions").update(patch).eq("id", id).select().single();

  console.log("updateTransaction data:", data);
  console.log("updateTransaction error:", error);

  if (error) {
    console.error("Failed to update transaction", error);
    return null;
  }

  return data as TransactionRow;
}
export async function listTransactions(): Promise<WorkItem[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*");

  if (error) {
    console.error("Failed to load transactions", error);
    return [];
  }

  return (data ?? []).map((row) => toWorkItem(row as TransactionRow));
}