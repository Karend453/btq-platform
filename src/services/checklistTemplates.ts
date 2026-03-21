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

export type ChecklistTemplate = { id: string; name: string };

/**
 * Fetches all checklist templates from Supabase for dropdown selection.
 */
export async function fetchChecklistTemplates(): Promise<ChecklistTemplate[]> {
  const { data, error } = await supabase
    .from("checklist_templates")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to load checklist templates", error);
    return [];
  }

  return (data ?? []) as ChecklistTemplate[];
}

/**
 * Resolves which checklist template to attach at transaction creation so
 * `TransactionDetailsPage` can seed/load rows (`checklist_template_id` must be set).
 * Prefers a template whose name contains the transaction type; otherwise the first template.
 */
export async function resolveChecklistTemplateForNewTransaction(
  transactionType: string
): Promise<ChecklistTemplate | null> {
  const templates = await fetchChecklistTemplates();
  if (templates.length === 0) return null;

  const needle = transactionType.trim().toLowerCase();
  if (needle) {
    const match = templates.find((t) => t.name.toLowerCase().includes(needle));
    if (match) return match;
  }

  return templates[0];
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
