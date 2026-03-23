import { supabase } from "../lib/supabaseClient";
import type { ChecklistItemFromTemplate } from "./checklistTemplates";
import {
  fetchChecklistTemplateSectionsAndItems,
  type ChecklistTemplateItemRow,
  type ChecklistTemplateSectionRow,
} from "./checklistTemplates";

/** Any row counts (archived, custom, rejected, etc.) — used for template-switch lock. */
export async function countChecklistItemsForTransaction(transactionId: string): Promise<number> {
  const { count, error } = await supabase
    .from("checklist_items")
    .select("*", { count: "exact", head: true })
    .eq("transaction_id", transactionId);

  if (error) {
    console.error("[countChecklistItemsForTransaction]", error);
    return 0;
  }

  return count ?? 0;
}

type DbChecklistItem = {
  id: string;
  transaction_id: string;
  template_item_id: string | null;
  template_section_id: string | null;
  sort_order: number;
  name: string;
  required: boolean;
  is_compliance_document?: boolean | null;
  status: string | null;
  reviewstatus: string | null;
  reviewnote: string | null;
  document_id: string | null;
  archived_at?: string | null;
  archive_group_id?: string | null;
  checklist_archive_groups?:
    | {
        id: string;
        label: string;
        note: string | null;
        created_at: string;
      }
    | {
        id: string;
        label: string;
        note: string | null;
        created_at: string;
      }[]
    | null;
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

function getTemplateItem(
  row: DbChecklistItem,
  itemById: Map<string, ChecklistTemplateItemRow>
): ChecklistTemplateItemRow | undefined {
  if (!row.template_item_id) return undefined;
  return itemById.get(row.template_item_id);
}

function resolveSectionId(
  row: DbChecklistItem,
  templateItem: ChecklistTemplateItemRow | undefined
): string | null {
  return row.template_section_id ?? templateItem?.section_id ?? null;
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

  const itemById = new Map(items.map((i) => [i.id, i]));

  return [...rows].sort((a, b) => {
    const ta = getTemplateItem(a, itemById);
    const tb = getTemplateItem(b, itemById);
    const secA = resolveSectionId(a, ta);
    const secB = resolveSectionId(b, tb);
    const orderA = getSectionSortOrder(secA);
    const orderB = getSectionSortOrder(secB);
    if (orderA !== orderB) return orderA - orderB;
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (so !== 0) return so;
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
    const templateItem = getTemplateItem(row, itemById);
    const sectionId = resolveSectionId(row, templateItem);
    const section = sectionId ? sectionMap.get(sectionId) : undefined;
    const reviewStatus = parseReviewStatus(row.reviewstatus);
    const grp = row.checklist_archive_groups;
    const groupRow = Array.isArray(grp) ? grp[0] : grp;

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
      section_id: sectionId,
      section: section
        ? { name: section.name ?? "Other", sort_order: section.sortOrder }
        : undefined,
      sort_order: row.sort_order ?? 0,
      documentId: row.document_id ?? null,
      reviewNote: row.reviewnote ?? null,
      isComplianceDocument: row.is_compliance_document !== false,
      template_item_id: row.template_item_id,
      archivedAt: row.archived_at ?? null,
      archiveGroupId: row.archive_group_id ?? null,
      archiveGroupLabel: groupRow?.label ?? null,
      archiveGroupNote: groupRow?.note ?? null,
      archiveGroupCreatedAt: groupRow?.created_at ?? null,
    };
  });
}

/**
 * Seed checklist_items from the template when a transaction has no template-backed rows yet.
 */
export async function ensureChecklistItemsForTransaction(
  transactionId: string,
  templateId: string
): Promise<boolean> {
  const { data: activeTemplateRows, error: activeErr } = await supabase
    .from("checklist_items")
    .select("id")
    .eq("transaction_id", transactionId)
    .not("template_item_id", "is", null)
    .is("archived_at", null)
    .limit(1);

  if (activeErr) {
    console.error("ensureChecklistItemsForTransaction", activeErr);
    return false;
  }

  if (activeTemplateRows && activeTemplateRows.length > 0) return false;

  const { data: items, error } = await supabase
    .from("checklist_template_items")
    .select("id, name, requirement, is_compliance_document, section_id, sort_order")
    .eq("template_id", templateId);

  if (error || !items?.length) {
    console.error("ensureChecklistItemsForTransaction: template items", error);
    return false;
  }

  const { data: existingRows, error: exErr } = await supabase
    .from("checklist_items")
    .select("template_item_id")
    .eq("transaction_id", transactionId)
    .not("template_item_id", "is", null);

  if (exErr) {
    console.error("ensureChecklistItemsForTransaction: existing rows", exErr);
    return false;
  }

  const existingTemplateIds = new Set(
    (existingRows ?? [])
      .map((r) => r.template_item_id as string | null)
      .filter((id): id is string => id != null && String(id).trim() !== "")
  );

  const rows = items
    .filter((ti) => !existingTemplateIds.has(ti.id))
    .map((ti) => ({
      transaction_id: transactionId,
      template_item_id: ti.id,
      template_section_id: ti.section_id,
      sort_order: ti.sort_order ?? 0,
      name: ti.name,
      required: ti.requirement !== "optional",
      is_compliance_document: (ti as { is_compliance_document?: boolean | null }).is_compliance_document !== false,
      status: "pending",
      reviewstatus: "pending",
      reviewnote: null as string | null,
    }));

  if (rows.length === 0) return false;

  const { error: insertError } = await supabase.from("checklist_items").insert(rows);

  if (insertError) {
    console.error("ensureChecklistItemsForTransaction insert", insertError);
    return false;
  }

  return true;
}

/**
 * Replace template-sourced checklist rows only; preserves transaction-only custom items (template_item_id IS NULL).
 */
export async function replaceChecklistItemsFromTemplate(
  transactionId: string,
  templateId: string
): Promise<void> {
  const { error: delErr } = await supabase
    .from("checklist_items")
    .delete()
    .eq("transaction_id", transactionId)
    .not("template_item_id", "is", null)
    .is("archived_at", null);

  if (delErr) {
    console.error("replaceChecklistItemsFromTemplate delete", delErr);
    return;
  }

  const { data: items, error } = await supabase
    .from("checklist_template_items")
    .select("id, name, requirement, is_compliance_document, section_id, sort_order")
    .eq("template_id", templateId);

  if (error || !items?.length) {
    console.error("replaceChecklistItemsFromTemplate template items", error);
    return;
  }

  const { data: existingAfterDelete, error: exErr } = await supabase
    .from("checklist_items")
    .select("template_item_id")
    .eq("transaction_id", transactionId)
    .not("template_item_id", "is", null);

  if (exErr) {
    console.error("replaceChecklistItemsFromTemplate existing template ids", exErr);
    return;
  }

  const existingTemplateIds = new Set(
    (existingAfterDelete ?? [])
      .map((r) => r.template_item_id as string | null)
      .filter((id): id is string => id != null && String(id).trim() !== "")
  );

  const rows = items
    .filter((ti) => !existingTemplateIds.has(ti.id))
    .map((ti) => ({
      transaction_id: transactionId,
      template_item_id: ti.id,
      template_section_id: ti.section_id,
      sort_order: ti.sort_order ?? 0,
      name: ti.name,
      required: ti.requirement !== "optional",
      is_compliance_document: (ti as { is_compliance_document?: boolean | null }).is_compliance_document !== false,
      status: "pending",
      reviewstatus: "pending",
      reviewnote: null as string | null,
    }));

  if (rows.length === 0) return;

  const { error: insertError } = await supabase.from("checklist_items").insert(rows);

  if (insertError) {
    console.error("replaceChecklistItemsFromTemplate insert", insertError);
  }
}

/**
 * Insert a transaction-only checklist item (no template item row).
 */
export async function insertCustomChecklistItem(params: {
  transactionId: string;
  templateId: string;
  templateSectionId: string;
  name: string;
  required: boolean;
}): Promise<DbChecklistItem> {
  const trimmed = params.name.trim();
  if (!trimmed) {
    const err = new Error("Checklist item name cannot be empty");
    console.error("[insertCustomChecklistItem]", err.message);
    throw err;
  }

  const { data: sectionRow, error: secErr } = await supabase
    .from("checklist_template_sections")
    .select("id, template_id")
    .eq("id", params.templateSectionId)
    .maybeSingle();

  if (secErr || !sectionRow || sectionRow.template_id !== params.templateId) {
    const err = new Error("Invalid checklist section for this template");
    console.error("[insertCustomChecklistItem]", err.message, secErr);
    throw err;
  }

  const { data: maxRows, error: maxErr } = await supabase
    .from("checklist_items")
    .select("sort_order")
    .eq("transaction_id", params.transactionId)
    .eq("template_section_id", params.templateSectionId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (maxErr) {
    console.error("[insertCustomChecklistItem] max sort_order", maxErr);
    throw maxErr;
  }

  const maxSort = maxRows?.[0]?.sort_order;
  const nextSort = (typeof maxSort === "number" ? maxSort : 0) + 1;

  const { data, error } = await supabase
    .from("checklist_items")
    .insert({
      transaction_id: params.transactionId,
      template_item_id: null,
      template_section_id: params.templateSectionId,
      sort_order: nextSort,
      name: trimmed,
      required: params.required,
      is_compliance_document: true,
      status: "pending",
      reviewstatus: "pending",
      reviewnote: null as string | null,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[insertCustomChecklistItem] insert", error);
    throw error ?? new Error("Insert failed");
  }

  return data as DbChecklistItem;
}

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
    .select("transaction_id, reviewstatus, is_compliance_document, document_id, archived_at")
    .in("transaction_id", transactionIds);

  if (error) {
    console.error("fetchComplianceDocCountsByTransactionIds", error);
    return empty;
  }

  for (const id of transactionIds) {
    empty[id] = { pending: 0, rejected: 0 };
  }

  for (const row of data ?? []) {
    if (row.archived_at != null) continue;
    const tid = row.transaction_id as string;
    if (!tid || !empty[tid]) continue;
    const isComp = row.is_compliance_document !== false;
    if (!isComp) continue;
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
      "id, transaction_id, template_item_id, template_section_id, sort_order, name, required, is_compliance_document, status, reviewstatus, reviewnote, document_id, archived_at, archive_group_id, checklist_archive_groups ( id, label, note, created_at )"
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
    name?: string;
  }
) {
  const { data: existing, error: loadErr } = await supabase
    .from("checklist_items")
    .select("archived_at")
    .eq("id", id)
    .maybeSingle();

  if (loadErr) {
    console.error("[updateChecklistItem] load archived_at", loadErr);
    throw loadErr;
  }

  const archivedAt = (existing as { archived_at?: string | null } | null)?.archived_at;
  if (archivedAt != null && String(archivedAt).trim() !== "") {
    const err = new Error("Cannot modify an archived checklist item");
    console.error("[updateChecklistItem]", err.message);
    throw err;
  }

  const patch: Record<string, unknown> = {};
  if (updates.reviewStatus !== undefined) patch.reviewstatus = updates.reviewStatus;
  if (updates.reviewNote !== undefined) patch.reviewnote = updates.reviewNote;
  if (updates.required !== undefined) patch.required = updates.required;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed) {
      const err = new Error("Checklist item name cannot be empty");
      console.error("[updateChecklistItem]", err.message);
      throw err;
    }
    patch.name = trimmed;
  }

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

/**
 * Create an archive group for the transaction and move the checklist item into archived state.
 */
export async function archiveChecklistItem(params: {
  transactionId: string;
  checklistItemId: string;
}): Promise<void> {
  const label = `Archive — ${new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
  const { data: group, error: gErr } = await supabase
    .from("checklist_archive_groups")
    .insert({ transaction_id: params.transactionId, label })
    .select("id")
    .single();

  if (gErr || !group) {
    console.error("[archiveChecklistItem] group", gErr);
    throw gErr ?? new Error("Failed to create archive group");
  }

  const { error: uErr } = await supabase
    .from("checklist_items")
    .update({
      archived_at: new Date().toISOString(),
      archive_group_id: group.id,
    })
    .eq("id", params.checklistItemId)
    .eq("transaction_id", params.transactionId);

  if (uErr) {
    console.error("[archiveChecklistItem] update", uErr);
    throw uErr;
  }
}

/**
 * Restore a checklist item to the active checklist (clears archive columns).
 */
export async function restoreChecklistItem(params: {
  transactionId: string;
  checklistItemId: string;
}): Promise<void> {
  const { error } = await supabase
    .from("checklist_items")
    .update({ archived_at: null, archive_group_id: null })
    .eq("id", params.checklistItemId)
    .eq("transaction_id", params.transactionId);

  if (error) {
    console.error("[restoreChecklistItem]", error);
    throw error;
  }
}
