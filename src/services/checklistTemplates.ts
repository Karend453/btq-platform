// src/services/checklistTemplates.ts

import { supabase } from "../lib/supabaseClient";

/** ChecklistItem shape used by the Checklist UI. */
export interface ChecklistItemFromTemplate {
  id: string;
  name: string;
  status: "complete" | "pending" | "rejected";
  updatedAt: string;
  requirement: "required" | "optional";
  reviewStatus: "pending" | "rejected" | "complete" | "waived";
  notes: unknown[];
  comments: unknown[];
  version: number;
  sectionname?: string;
  /** Section header for Checklist flat display. */
  sectionTitle?: string;
  /** For grouping by section (ChecklistPanel). */
  section_id?: string | null;
  section?: { name: string; sort_order: number };
  sort_order?: number;
  /** `checklist_items.document_id` — use to resolve attachment when inbox join misses (id type mismatch). */
  documentId?: string | null;
  reviewNote?: string | null;
  /** false = reference/supplemental only (not sent to compliance when attached). */
  isComplianceDocument?: boolean;
  /** Null = transaction-only custom item (no template line). */
  template_item_id?: string | null;
  /** ISO timestamp when archived; omitted/null = active in the main checklist. */
  archivedAt?: string | null;
  archiveGroupId?: string | null;
  archiveGroupLabel?: string | null;
  archiveGroupNote?: string | null;
  archiveGroupCreatedAt?: string | null;
}

export type ChecklistTemplateSectionRow = {
  id: string;
  template_id: string;
  name: string | null;
  sort_order: number | null;
};
export type ChecklistTemplateItemRow = {
  id: string;
  template_id: string;
  section_id: string | null;
  name: string;
  requirement: string | null;
  sort_order: number | null;
  is_compliance_document?: boolean | null;
};

type DbSection = ChecklistTemplateSectionRow;
type DbItem = ChecklistTemplateItemRow;

export type ChecklistTemplate = {
  id: string;
  name: string;
  checklist_type?: string;
  is_default_for_type?: boolean;
  archived_at?: string | null;
  created_at?: string;
};

export type ChecklistTemplateCreatedFrom = "btq_starter" | "duplicate" | "manual";

export type OfficeChecklistTemplateRow = ChecklistTemplate & {
  office_id: string;
  created_from: ChecklistTemplateCreatedFrom;
  source_template_id: string | null;
};

/** Aligns `transactions.type` / wizard values to `checklist_templates.checklist_type`. */
export function normalizeChecklistType(transactionType: string): string {
  const t = transactionType.trim().toLowerCase();
  if (t.includes("lease")) return "Lease";
  if (t.includes("purchase") || t.includes("buy")) return "Purchase";
  if (t.includes("list") || t.includes("listing")) return "Listing";
  return "Other";
}

/**
 * Resolves the office-owned checklist template for a new transaction.
 * Prefers explicit default for (office + checklist_type), else oldest active template of that type (created_at ASC).
 * Throws if none exist — never falls back to BTQ/global templates.
 */
export async function resolveChecklistTemplateForNewTransaction(
  officeId: string,
  transactionType: string
): Promise<ChecklistTemplate> {
  const checklistType = normalizeChecklistType(transactionType);
  const oid = officeId.trim();
  if (!oid) {
    throw new Error("Missing office: cannot resolve checklist template.");
  }

  const { data: defaultRow, error: defErr } = await supabase
    .from("checklist_templates")
    .select("id, name, checklist_type, is_default_for_type, archived_at, created_at")
    .eq("office_id", oid)
    .eq("checklist_type", checklistType)
    .is("archived_at", null)
    .eq("is_default_for_type", true)
    .limit(1)
    .maybeSingle();

  if (defErr) {
    console.error("[resolveChecklistTemplateForNewTransaction] default query", defErr);
    throw new Error(`Could not resolve checklist template: ${defErr.message}`);
  }

  if (defaultRow) {
    return defaultRow as ChecklistTemplate;
  }

  const { data: fallback, error: fbErr } = await supabase
    .from("checklist_templates")
    .select("id, name, checklist_type, is_default_for_type, archived_at, created_at")
    .eq("office_id", oid)
    .eq("checklist_type", checklistType)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fbErr) {
    console.error("[resolveChecklistTemplateForNewTransaction] fallback query", fbErr);
    throw new Error(`Could not resolve checklist template: ${fbErr.message}`);
  }

  if (!fallback) {
    throw new Error(
      `No active checklist template for this office and transaction type (${checklistType}). Ask your broker to add one in Settings.`
    );
  }

  return fallback as ChecklistTemplate;
}

/**
 * Active office-owned templates for transaction checklist dropdown (non-archived only).
 */
export async function fetchOfficeChecklistTemplatesForTransactionSelect(
  officeId: string
): Promise<ChecklistTemplate[]> {
  const oid = officeId.trim();
  if (!oid) return [];

  const { data, error } = await supabase
    .from("checklist_templates")
    .select("id, name, checklist_type, is_default_for_type, archived_at, created_at")
    .eq("office_id", oid)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load office checklist templates", error);
    return [];
  }

  return (data ?? []) as ChecklistTemplate[];
}

/** @deprecated Use fetchOfficeChecklistTemplatesForTransactionSelect with office id */
export async function fetchChecklistTemplates(): Promise<ChecklistTemplate[]> {
  console.warn("[fetchChecklistTemplates] deprecated: pass officeId via fetchOfficeChecklistTemplatesForTransactionSelect");
  return [];
}

export async function listOfficeChecklistTemplates(
  officeId: string
): Promise<OfficeChecklistTemplateRow[]> {
  const oid = officeId.trim();
  if (!oid) return [];

  const { data, error } = await supabase
    .from("checklist_templates")
    .select(
      "id, name, office_id, checklist_type, is_default_for_type, archived_at, created_at, created_from, source_template_id"
    )
    .eq("office_id", oid)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[listOfficeChecklistTemplates]", error);
    return [];
  }

  return (data ?? []) as OfficeChecklistTemplateRow[];
}

/**
 * Server-side: ensures an active office template exists for the type (clone from BTQ starter if missing),
 * ensures a default exists for that type, returns the template id. Required because global BTQ rows are not
 * readable under RLS from the browser.
 */
export async function ensureOfficeChecklistTemplateForType(
  officeId: string,
  checklistType: string
): Promise<{ templateId: string | null; error: Error | null }> {
  const oid = officeId.trim();
  const ct = checklistType.trim();
  if (!oid || !ct) {
    return { templateId: null, error: new Error("Office and checklist type are required") };
  }

  const { data, error } = await supabase.rpc("ensure_office_checklist_template_from_btq", {
    p_office_id: oid,
    p_checklist_type: ct,
  });

  if (error) {
    return { templateId: null, error: new Error(error.message) };
  }

  const id = data as string | null | undefined;
  if (!id) {
    return { templateId: null, error: new Error("No template id returned") };
  }

  return { templateId: id, error: null };
}

export async function fetchOfficeChecklistTemplateRow(
  templateId: string
): Promise<OfficeChecklistTemplateRow | null> {
  const { data, error } = await supabase
    .from("checklist_templates")
    .select(
      "id, name, office_id, checklist_type, is_default_for_type, archived_at, created_at, created_from, source_template_id"
    )
    .eq("id", templateId)
    .maybeSingle();

  if (error) {
    console.error("[fetchOfficeChecklistTemplateRow]", error);
    return null;
  }

  return (data ?? null) as OfficeChecklistTemplateRow | null;
}

/** Global BTQ starter rows for broker settings dropdown (RLS-safe via RPC). */
export type BtqChecklistStarterRow = {
  id: string;
  name: string;
  checklist_type: string;
};

export async function listBtqChecklistStarters(): Promise<BtqChecklistStarterRow[]> {
  const { data, error } = await supabase.rpc("list_btq_checklist_starters");
  if (error) {
    console.error("[listBtqChecklistStarters]", error);
    return [];
  }
  return (data ?? []) as BtqChecklistStarterRow[];
}

/** Clone a single BTQ starter into an office-owned template (RLS-safe via RPC). */
export async function cloneBtqStarterToOffice(
  officeId: string,
  btqTemplateId: string
): Promise<{ templateId: string | null; error: Error | null }> {
  const oid = officeId.trim();
  const bid = btqTemplateId.trim();
  if (!oid || !bid) {
    return { templateId: null, error: new Error("Office and BTQ template id are required") };
  }

  const { data, error } = await supabase.rpc("clone_btq_starter_to_office", {
    p_office_id: oid,
    p_btq_template_id: bid,
  });

  if (error) {
    return { templateId: null, error: new Error(error.message) };
  }

  const id = data as string | null | undefined;
  if (!id) {
    return { templateId: null, error: new Error("No template id returned") };
  }

  return { templateId: id, error: null };
}

export async function renameOfficeChecklistTemplate(templateId: string, name: string): Promise<{ error: Error | null }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: new Error("Name is required") };

  const { error } = await supabase
    .from("checklist_templates")
    .update({ name: trimmed })
    .eq("id", templateId);

  return { error: error ? new Error(error.message) : null };
}

export async function archiveOfficeChecklistTemplate(templateId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("checklist_templates")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", templateId);

  return { error: error ? new Error(error.message) : null };
}

export async function setDefaultOfficeChecklistTemplate(templateId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("set_default_office_checklist_template", {
    p_template_id: templateId,
  });

  return { error: error ? new Error(error.message) : null };
}

export async function renameChecklistTemplateSection(
  sectionId: string,
  name: string
): Promise<{ error: Error | null }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: new Error("Section name is required") };

  const { error } = await supabase
    .from("checklist_template_sections")
    .update({ name: trimmed })
    .eq("id", sectionId);

  return { error: error ? new Error(error.message) : null };
}

export async function insertChecklistTemplateSection(params: {
  templateId: string;
  name: string;
  sortOrder: number;
}): Promise<{ id: string | null; error: Error | null }> {
  const name = params.name.trim();
  if (!name) return { id: null, error: new Error("Section name is required") };

  const { data, error } = await supabase
    .from("checklist_template_sections")
    .insert({
      template_id: params.templateId,
      name,
      sort_order: params.sortOrder,
    })
    .select("id")
    .single();

  if (error) return { id: null, error: new Error(error.message) };
  return { id: data?.id ?? null, error: null };
}

export async function deleteChecklistTemplateSection(sectionId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("checklist_template_sections").delete().eq("id", sectionId);
  return { error: error ? new Error(error.message) : null };
}

/** Deletes template items in the section first, then the section row. */
export async function deleteChecklistTemplateSectionCascade(
  sectionId: string,
  templateId: string
): Promise<{ error: Error | null }> {
  const raw = await fetchChecklistTemplateSectionsAndItems(templateId);
  if (!raw) return { error: new Error("Could not load template") };

  for (const it of raw.items.filter((i) => i.section_id === sectionId)) {
    const { error } = await deleteChecklistTemplateItem(it.id);
    if (error) return { error };
  }

  return deleteChecklistTemplateSection(sectionId);
}

export async function insertChecklistTemplateItem(params: {
  templateId: string;
  sectionId: string | null;
  name: string;
  requirement: "required" | "optional";
  sortOrder: number;
  isComplianceDocument?: boolean;
}): Promise<{ id: string | null; error: Error | null }> {
  const name = params.name.trim();
  if (!name) return { id: null, error: new Error("Item name is required") };

  const { data, error } = await supabase
    .from("checklist_template_items")
    .insert({
      template_id: params.templateId,
      section_id: params.sectionId,
      name,
      requirement: params.requirement,
      sort_order: params.sortOrder,
      is_compliance_document: params.isComplianceDocument !== false,
    })
    .select("id")
    .single();

  if (error) return { id: null, error: new Error(error.message) };
  return { id: data?.id ?? null, error: null };
}

export async function updateChecklistTemplateItem(params: {
  itemId: string;
  name?: string;
  requirement?: "required" | "optional";
  sortOrder?: number;
  isComplianceDocument?: boolean;
}): Promise<{ error: Error | null }> {
  const patch: Record<string, unknown> = {};
  if (params.name !== undefined) patch.name = params.name.trim();
  if (params.requirement !== undefined) patch.requirement = params.requirement;
  if (params.sortOrder !== undefined) patch.sort_order = params.sortOrder;
  if (params.isComplianceDocument !== undefined) patch.is_compliance_document = params.isComplianceDocument;

  const { error } = await supabase.from("checklist_template_items").update(patch).eq("id", params.itemId);

  return { error: error ? new Error(error.message) : null };
}

export async function deleteChecklistTemplateItem(itemId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("checklist_template_items").delete().eq("id", itemId);
  return { error: error ? new Error(error.message) : null };
}

/**
 * Duplicates an office template (sections + items). Uses source_template_id for lineage.
 */
export async function duplicateOfficeChecklistTemplate(
  templateId: string,
  officeId: string
): Promise<{ newTemplateId: string | null; error: Error | null }> {
  const { data: src, error: srcErr } = await supabase
    .from("checklist_templates")
    .select("id, name, office_id, checklist_type, is_default_for_type, created_from")
    .eq("id", templateId)
    .maybeSingle();

  if (srcErr || !src) {
    return { newTemplateId: null, error: new Error(srcErr?.message ?? "Template not found") };
  }

  if (src.office_id !== officeId) {
    return { newTemplateId: null, error: new Error("Template does not belong to this office") };
  }

  const raw = await fetchChecklistTemplateSectionsAndItems(templateId);
  if (!raw) {
    return { newTemplateId: null, error: new Error("Could not load template structure") };
  }

  const newName = `${String(src.name).trim()} (copy)`;

  const { data: inserted, error: insErr } = await supabase
    .from("checklist_templates")
    .insert({
      name: newName,
      office_id: officeId,
      checklist_type: src.checklist_type,
      is_default_for_type: false,
      archived_at: null,
      source_template_id: templateId,
      created_from: "duplicate",
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    return { newTemplateId: null, error: new Error(insErr?.message ?? "Insert failed") };
  }

  const newTemplateId = inserted.id as string;
  const sectionMap = new Map<string, string>();

  const sectionsSorted = [...raw.sections].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  for (const sec of sectionsSorted) {
    const { data: secRow, error: secE } = await supabase
      .from("checklist_template_sections")
      .insert({
        template_id: newTemplateId,
        name: sec.name,
        sort_order: sec.sort_order ?? 0,
      })
      .select("id")
      .single();

    if (secE || !secRow?.id) {
      return { newTemplateId, error: new Error(secE?.message ?? "Failed to copy section") };
    }
    sectionMap.set(sec.id, secRow.id as string);
  }

  const itemsSorted = [...raw.items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  for (const it of itemsSorted) {
    const newSec = it.section_id ? sectionMap.get(it.section_id) ?? null : null;
    const { error: itE } = await supabase.from("checklist_template_items").insert({
      template_id: newTemplateId,
      section_id: newSec,
      name: it.name,
      requirement: it.requirement,
      sort_order: it.sort_order ?? 0,
      is_compliance_document: it.is_compliance_document !== false,
    });

    if (itE) {
      return { newTemplateId, error: new Error(itE.message) };
    }
  }

  return { newTemplateId, error: null };
}

export async function insertManualOfficeChecklistTemplate(params: {
  officeId: string;
  checklistType: string;
  name: string;
}): Promise<{ templateId: string | null; error: Error | null }> {
  const name = params.name.trim();
  if (!name) return { templateId: null, error: new Error("Name is required") };

  const { data, error } = await supabase
    .from("checklist_templates")
    .insert({
      name,
      office_id: params.officeId,
      checklist_type: params.checklistType,
      is_default_for_type: false,
      archived_at: null,
      created_from: "manual",
    })
    .select("id")
    .single();

  if (error) return { templateId: null, error: new Error(error.message) };

  const templateId = data?.id as string;

  const { data: sec, error: secE } = await supabase
    .from("checklist_template_sections")
    .insert({
      template_id: templateId,
      name: "General",
      sort_order: 0,
    })
    .select("id")
    .single();

  if (secE || !sec?.id) {
    return { templateId, error: new Error(secE?.message ?? "Failed to add default section") };
  }

  const { error: itE } = await supabase.from("checklist_template_items").insert({
    template_id: templateId,
    section_id: sec.id,
    name: "New item",
    requirement: "required",
    sort_order: 0,
    is_compliance_document: true,
  });

  if (itE) {
    return { templateId, error: new Error(itE.message) };
  }

  return { templateId, error: null };
}

function mapItemsToChecklist(
  sections: DbSection[],
  items: DbItem[]
): ChecklistItemFromTemplate[] {
  const sectionMap = new Map(sections.map((s) => [s.id, { name: s.name ?? "", sortOrder: s.sort_order ?? 999 }]));
  const getSectionSortOrder = (sectionId: string | null) =>
    sectionId ? (sectionMap.get(sectionId)?.sortOrder ?? 999) : 999;

  const sorted = [...items].sort((a, b) => {
    const orderA = getSectionSortOrder(a.section_id);
    const orderB = getSectionSortOrder(b.section_id);
    if (orderA !== orderB) return orderA - orderB;
    return (a.sort_order ?? 999) - (b.sort_order ?? 999);
  });

  return sorted.map((item) => {
    const section = item.section_id ? sectionMap.get(item.section_id) : undefined;
    return {
      id: item.id,
      name: item.name,
      status: "pending" as const,
      updatedAt: "Never",
      requirement: (item.requirement === "optional" ? "optional" : "required") as "required" | "optional",
      reviewStatus: "pending" as const,
      notes: [],
      comments: [],
      version: 1,
      sectionname: section?.name ?? undefined,
      sectionTitle: section?.name ?? "Other",
      section_id: item.section_id ?? null,
      section: section
        ? { name: section.name ?? "Other", sort_order: section.sortOrder }
        : undefined,
      sort_order: item.sort_order ?? 9999,
      isComplianceDocument: item.is_compliance_document !== false,
    };
  });
}

/**
 * Raw template sections + items (for ordering / section labels when merging transaction checklist rows).
 */
export async function fetchChecklistTemplateSectionsAndItems(
  templateId: string
): Promise<{ sections: DbSection[]; items: DbItem[] } | null> {
  const [sectionsRes, itemsRes] = await Promise.all([
    supabase
      .from("checklist_template_sections")
      .select("id, template_id, name, sort_order")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true, nullsFirst: false }),
    supabase
      .from("checklist_template_items")
      .select("id, template_id, section_id, name, requirement, sort_order, is_compliance_document")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true, nullsFirst: false }),
  ]);

  if (sectionsRes.error || itemsRes.error) {
    console.error("Failed to load checklist sections/items", sectionsRes.error ?? itemsRes.error);
    return null;
  }

  return {
    sections: (sectionsRes.data ?? []) as DbSection[],
    items: (itemsRes.data ?? []) as DbItem[],
  };
}

/**
 * Fetches a checklist template by ID and its sections/items from Supabase,
 * then maps them into the ChecklistItem UI shape.
 * Sections ordered by sort_order; items ordered by sort_order within each section.
 */
export async function fetchChecklistItemsByTemplateId(
  templateId: string
): Promise<ChecklistItemFromTemplate[]> {
  const raw = await fetchChecklistTemplateSectionsAndItems(templateId);
  if (!raw) return [];
  return mapItemsToChecklist(raw.sections, raw.items);
}
