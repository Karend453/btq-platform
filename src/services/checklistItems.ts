import { supabase } from "../lib/supabaseClient";
import type { ChecklistItemFromTemplate } from "./checklistTemplates";
import {
  fetchChecklistTemplateSectionsAndItems,
  type ChecklistTemplateItemRow,
  type ChecklistTemplateSectionRow,
} from "./checklistTemplates";

type DbChecklistItem = {
  id: string;
  transaction_id: string;
  template_item_id: string;
  name: string;
  required: boolean;
  is_compliance_document?: boolean | null;
  status: string | null;
  reviewstatus: string | null;
  reviewnote: string | null;
  document_id: string | null;
};

function parseReviewStatus(
  s: string | null | undefined
): ChecklistItemFromTemplate["reviewStatus"] {
  const v = (s ?? "pending").toLowerCase();
  if (v === "pending" || v === "rejected" || v === "complete" || v === "waived") return v;
  return "pending";
}

function uiStatusFromReview(
  review: ChecklistItemFromTemplate["reviewStatus"]
): ChecklistItemFromTemplate["status"] {
  if (review === "rejected") return "rejected";
  if (review === "complete" || review === "waived") return "complete";
  return "pending";
}

function sortChecklistRowsByTemplate(
  rows: DbChecklistItem[],
  sections: ChecklistTemplateSectionRow[],
  items: ChecklistTemplateItemRow[]
): DbChecklistItem[] {
  const sectionMap = new Map(
    sections.map((s) => [s.id, { name: s.name ?? "", sortOrder: s.sort_order ?? 999 }])
  );
  const getSectionSortOrder = (sectionId: string | null) =>
    sectionId ? (sectionMap.get(sectionId)?.sortOrder ?? 999) : 999;

  const itemMeta = new Map(
    items.map((i) => [
      i.id,
      {
        sectionOrder: getSectionSortOrder(i.section_id),
        itemOrder: i.sort_order ?? 999,
      },
    ])
  );

  return [...rows].sort((a, b) => {
    const ma = itemMeta.get(a.template_item_id);
    const mb = itemMeta.get(b.template_item_id);
    if (ma && mb) {
      if (ma.sectionOrder !== mb.sectionOrder) return ma.sectionOrder - mb.sectionOrder;
      return ma.itemOrder - mb.itemOrder;
    }
    if (ma && !mb) return -1;
    if (!ma && mb) return 1;
    return a.name.localeCompare(b.name);
  });
}

function mapRowsToChecklist(
  rows: DbChecklistItem[],
  sections: ChecklistTemplateSectionRow[],
  items: ChecklistTemplateItemRow[]
): ChecklistItemFromTemplate[] {
  const sectionMap = new Map(
    sections.map((s) => [s.id, { name: s.name ?? "", sortOrder: s.sort_order ?? 999 }])
  );
  const itemById = new Map(items.map((i) => [i.id, i]));

  const sorted = sortChecklistRowsByTemplate(rows, sections, items);

  return sorted.map((row) => {
    const templateItem = itemById.get(row.template_item_id);
    const section = templateItem?.section_id ? sectionMap.get(templateItem.section_id) : undefined;
    const reviewStatus = parseReviewStatus(row.reviewstatus);

    return {
      id: row.id,
      name: row.name,
      status: uiStatusFromReview(reviewStatus),
      updatedAt: "Never",
      requirement: row.required ? "required" : "optional",
      reviewStatus,
      notes: [],
      comments: [],
      version: 1,
      sectionname: section?.name ?? undefined,
      sectionTitle: section?.name ?? "Other",
      section_id: templateItem?.section_id ?? null,
      section: section
        ? { name: section.name ?? "Other", sort_order: section.sortOrder }
        : undefined,
      sort_order: templateItem?.sort_order ?? 9999,
      documentId: row.document_id ?? null,
      reviewNote: row.reviewnote ?? null,
      isComplianceDocument: row.is_compliance_document !== false,
    };
  });
}

/**
 * Seed checklist_items from the template when a transaction has a template but no rows yet.
 */
export async function ensureChecklistItemsForTransaction(
  transactionId: string,
  templateId: string
): Promise<boolean> {
  const { data: existing, error: countErr } = await supabase
    .from("checklist_items")
    .select("id")
    .eq("transaction_id", transactionId)
    .limit(1);

  if (countErr) {
    console.error("ensureChecklistItemsForTransaction", countErr);
    return false;
  }

  if (existing && existing.length > 0) return false;

  const { data: items, error } = await supabase
    .from("checklist_template_items")
    .select("id, name, requirement, is_compliance_document")
    .eq("template_id", templateId);

  if (error || !items?.length) {
    console.error("ensureChecklistItemsForTransaction: template items", error);
    return false;
  }

  const rows = items.map((ti) => ({
    transaction_id: transactionId,
    template_item_id: ti.id,
    name: ti.name,
    required: ti.requirement !== "optional",
    is_compliance_document: (ti as { is_compliance_document?: boolean | null }).is_compliance_document !== false,
    status: "pending",
    reviewstatus: "pending",
    reviewnote: null as string | null,
  }));

  const { error: upsertError } = await supabase.from("checklist_items").upsert(rows, {
    onConflict: "transaction_id,template_item_id",
    ignoreDuplicates: true,
  });

  if (upsertError) {
    console.error("ensureChecklistItemsForTransaction upsert", upsertError);
    return false;
  }

  return true;
}

/**
 * Replace all checklist rows for a transaction (e.g. user picked a checklist type).
 */
export async function replaceChecklistItemsFromTemplate(
  transactionId: string,
  templateId: string
): Promise<void> {
  const { error: delErr } = await supabase
    .from("checklist_items")
    .delete()
    .eq("transaction_id", transactionId);

  if (delErr) {
    console.error("replaceChecklistItemsFromTemplate delete", delErr);
    return;
  }

  const { data: items, error } = await supabase
    .from("checklist_template_items")
    .select("id, name, requirement, is_compliance_document")
    .eq("template_id", templateId);

  if (error || !items?.length) {
    console.error("replaceChecklistItemsFromTemplate template items", error);
    return;
  }

  const rows = items.map((ti) => ({
    transaction_id: transactionId,
    template_item_id: ti.id,
    name: ti.name,
    required: ti.requirement !== "optional",
    is_compliance_document: (ti as { is_compliance_document?: boolean | null }).is_compliance_document !== false,
    status: "pending",
    reviewstatus: "pending",
    reviewnote: null as string | null,
  }));

  const { error: insertError } = await supabase.from("checklist_items").insert(rows);

  if (insertError) {
    console.error("replaceChecklistItemsFromTemplate insert", insertError);
  }
}

/**
 * Load persisted checklist rows for a transaction and merge template metadata for section order/labels.
 */
/**
 * Compliance-only counts per transaction (for transaction list indicators).
 */
export async function fetchComplianceDocCountsByTransactionIds(
  transactionIds: string[]
): Promise<Record<string, { pending: number; rejected: number }>> {
  const empty: Record<string, { pending: number; rejected: number }> = {};
  if (transactionIds.length === 0) return empty;

  const { data, error } = await supabase
    .from("checklist_items")
    .select("transaction_id, reviewstatus, is_compliance_document, document_id")
    .in("transaction_id", transactionIds);

  if (error) {
    console.error("fetchComplianceDocCountsByTransactionIds", error);
    return empty;
  }

  for (const id of transactionIds) {
    empty[id] = { pending: 0, rejected: 0 };
  }

  for (const row of data ?? []) {
    const tid = row.transaction_id as string;
    if (!tid || !empty[tid]) continue;
    const isComp = row.is_compliance_document !== false;
    if (!isComp) continue;
    // Match documentEngine/adapter: no attachment => NOT_SUBMITTED, not SUBMITTED/REJECTED.
    const hasDoc = row.document_id != null;
    if (!hasDoc) continue;
    const rs = String(row.reviewstatus ?? "").toLowerCase();
    if (rs === "pending") empty[tid].pending += 1;
    if (rs === "rejected") empty[tid].rejected += 1;
  }

  return empty;
}

export async function fetchChecklistItemsForTransaction(
  transactionId: string,
  templateId: string
): Promise<ChecklistItemFromTemplate[]> {
  const { data: rows, error } = await supabase
    .from("checklist_items")
    .select(
      "id, transaction_id, template_item_id, name, required, is_compliance_document, status, reviewstatus, reviewnote, document_id"
    )
    .eq("transaction_id", transactionId);

  if (error) {
    console.error("fetchChecklistItemsForTransaction", error);
    return [];
  }

  const structure = await fetchChecklistTemplateSectionsAndItems(templateId);
  if (!structure) return [];

  const dbRows = (rows ?? []) as DbChecklistItem[];
  if (dbRows.length === 0) return [];

  return mapRowsToChecklist(dbRows, structure.sections, structure.items);
}

export async function updateChecklistItem(
  id: string,
  updates: {
    reviewStatus?: string;
    reviewNote?: string | null;
    required?: boolean;
    status?: string;
  }
) {
  const patch: Record<string, unknown> = {};
  if (updates.reviewStatus !== undefined) patch.reviewstatus = updates.reviewStatus;
  if (updates.reviewNote !== undefined) patch.reviewnote = updates.reviewNote;
  if (updates.required !== undefined) patch.required = updates.required;
  if (updates.status !== undefined) patch.status = updates.status;

  const { data, error } = await supabase
    .from("checklist_items")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Failed to update checklist item", error);
    throw error;
  }

  return data;
}
