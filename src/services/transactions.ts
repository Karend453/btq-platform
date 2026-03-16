// src/services/transactions.ts

import { WorkItem, WorkItemStatus } from "../types/workItem";
import { supabase } from "../lib/supabaseClient";


export type TransactionRow = {
  id: string;
  identifier: string | null;
  type: string | null;
  office: string | null;
  status: string | null;
  assignedadmin: string | null;
  contractdate: string | null;
  closingdate: string | null;
  checklisttype: string | null;
  saleprice: number | null;
  sellernames: string | null;
  buyernames: string | null;
  listagent: string | null;
  buyeragent: string | null;
  listcommissionpercent: string | null;
  buyercommissionpercent: string | null;
  listcommissionamount: string | null;
  buyercommissionamount: string | null;
  isarchived: boolean | null;
  archivedat: string | null;
};


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
      dueDate: row.closingdate ?? "",
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
  agent: string;
  status?: string;
  statusLabel?: string;
  closingDate?: string;
  lastActivity?: string;
  office?: string;
};

export async function createTransaction(input: CreateTransactionInput): Promise<WorkItem | null> {
  const payload = {
    identifier: input.identifier,
    type: input.type,
    agent: input.agent,
    status: input.status ?? "success",
    statuslabel: input.statusLabel ?? "Active",
    closingdate: input.closingDate ?? "",
    missingdocs: 0,
    rejecteddocs: 0,
    lastactivity: input.lastActivity ?? "Just created",
    office: input.office ?? "Charlotte",
    isarchived: false,
    archivedat: null,
    archivedby: null,
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

  listAgent?: string | null;
  buyerAgent?: string | null;
  listCommissionPercent?: string | null;
  buyerCommissionPercent?: string | null;
  listCommissionAmount?: string | null;
  buyerCommissionAmount?: string | null;
};

export async function updateTransaction(
  id: string,
  input: UpdateTransactionInput
) {
  const { data, error } = await supabase
    .from("transactions")
    .update({
      type: input.type,
      office: input.office,
      status: input.status,
      assignedadmin: input.admin,
      contractdate: input.contractDate,
      closingdate: input.closingDate,

      sellernames: input.sellerNames,
      buyernames: input.buyerNames,
      saleprice: input.salePrice,
      checklisttype: input.checklistType,

      listagent: input.listAgent,
      buyeragent: input.buyerAgent,
      listcommissionpercent: input.listCommissionPercent,
      buyercommissionpercent: input.buyerCommissionPercent,
      listcommissionamount: input.listCommissionAmount,
      buyercommissionamount: input.buyerCommissionAmount,
    })
    .eq("id", id)
    .select()
    .single();

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