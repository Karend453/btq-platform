// src/services/transactions.ts

import { WorkItem, WorkItemStatus } from "../types/workItem";

type TransactionRow = {
  id: string;
  identifier: string;
  type: string;
  agent: string;
  status: string;
  statuslabel: string;
  closingdate: string;
  missingdocs: number;
  rejecteddocs: number;
  lastactivity: string;
  office: string;
  isarchived: boolean;
  archivedat: string | null;
  archivedby: { name: string; role: string } | null;
};


function toWorkItem(row: TransactionRow): WorkItem {
  const allowed: WorkItemStatus[] = ["error", "warning", "success", "pending", "info"];

  const status = allowed.includes(row.status as WorkItemStatus)
    ? (row.status as WorkItemStatus)
    : "info";

  return {
    id: row.id,
    identifier: row.identifier,
    type: row.type,
    owner: row.agent,
    status,
    statusLabel: row.statuslabel,
    dueDate: row.closingdate,
    missingCount: row.missingdocs,
    rejectedCount: row.rejecteddocs,
    lastActivity: row.lastactivity,
    organizationId: `org_${row.office.toLowerCase().replace(/\s+/g, "_")}`,
    organizationName: row.office,
    isArchived: row.isarchived,
    archivedAt: row.archivedat,
    archivedBy: row.archivedby,
  };
}
  
  import { supabase } from "../lib/supabaseClient";

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

export async function getTransaction(id: string): Promise<WorkItem | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load transaction", error);
    return null;
  }

  return data ? toWorkItem(data) : null;
}