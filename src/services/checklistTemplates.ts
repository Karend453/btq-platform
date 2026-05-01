// src/services/checklistTemplates.ts

import {
  getBtqAdminActiveOfficeScopeId,
  getCurrentUser,
  getCurrentUserProfileOfficeId,
  getUserProfileRoleKey,
} from "./auth";
import {
  normalizeOfficeIdKey,
  pickActiveOfficeFromMembershipRows,
  type MembershipPickRow,
} from "./officeMembershipOfficePick";
import { supabase } from "../lib/supabaseClient";

/**
 * Non–`btq_admin`: `office_memberships` first (same pick rule as billing/offices); then
 * `user_profiles.office_id`; then the UI-provided office id — each downgrade is logged.
 *
 * `btq_admin`: same validation idea as {@link getBtqAdminActiveOfficeScopeId} — UI/passed office id
 * when it matches session scope or a readable `public.offices` row; never replaced by membership/profile.
 */
async function resolveOfficeIdForChecklistRpc(uiOfficeIdArg: string): Promise<{
  resolvedOfficeId: string;
  authUserId: string | null;
}> {
  const oid = uiOfficeIdArg.trim();
  const user = await getCurrentUser();
  const authUserId = user?.id ?? null;
  if (!authUserId) {
    console.warn(
      "[checklistTemplates] resolveOfficeIdForChecklistRpc: no auth user; using UI office id only"
    );
    return { resolvedOfficeId: oid, authUserId: null };
  }

  const roleKey = await getUserProfileRoleKey();
  if (roleKey === "btq_admin") {
    if (oid) {
      const sessionScopeId = await getBtqAdminActiveOfficeScopeId();
      if (
        sessionScopeId &&
        normalizeOfficeIdKey(sessionScopeId) === normalizeOfficeIdKey(oid)
      ) {
        return { resolvedOfficeId: oid, authUserId };
      }

      if (supabase) {
        const { data: officeRow, error: officeErr } = await supabase
          .from("offices")
          .select("id")
          .eq("id", oid)
          .maybeSingle();

        if (officeErr) {
          console.warn(
            "[checklistTemplates] resolveOfficeIdForChecklistRpc btq_admin offices:",
            officeErr.message
          );
        } else if (officeRow) {
          return { resolvedOfficeId: oid, authUserId };
        }
      }

      console.warn(
        "[checklistTemplates] resolveOfficeIdForChecklistRpc btq_admin: office id not session-scoped and not readable on public.offices; passing UI id through (RPC may fail)",
        { uiOfficeId: oid }
      );
      return { resolvedOfficeId: oid, authUserId };
    }

    const sessionOnly = await getBtqAdminActiveOfficeScopeId();
    if (sessionOnly) {
      return { resolvedOfficeId: sessionOnly, authUserId };
    }

    console.warn(
      "[checklistTemplates] resolveOfficeIdForChecklistRpc btq_admin: missing office id and no active session scope"
    );
    return { resolvedOfficeId: "", authUserId };
  }

  const [{ data: rows, error: mErr }, profileOfficeId] = await Promise.all([
    supabase
      .from("office_memberships")
      .select("office_id, role, created_at")
      .eq("user_id", authUserId)
      .eq("status", "active"),
    getCurrentUserProfileOfficeId(),
  ]);

  if (mErr) {
    console.warn("[checklistTemplates] office_memberships:", mErr.message);
  }

  const membershipOfficeId =
    !mErr && rows
      ? pickActiveOfficeFromMembershipRows((rows ?? []) as MembershipPickRow[])
      : null;

  if (membershipOfficeId) {
    if (
      profileOfficeId &&
      normalizeOfficeIdKey(profileOfficeId) !== normalizeOfficeIdKey(membershipOfficeId)
    ) {
      console.warn("⚠️ profile.office_id mismatch with membership — ignoring profile fallback");
    }
    if (normalizeOfficeIdKey(oid) !== normalizeOfficeIdKey(membershipOfficeId)) {
      console.warn(
        "[checklistTemplates] UI office id differs from membership-resolved office; using membership for RPC",
        { uiOfficeId: oid, membershipOfficeId }
      );
    }
    return { resolvedOfficeId: membershipOfficeId, authUserId };
  }

  const fromProfile = profileOfficeId?.trim() ?? "";
  if (fromProfile) {
    console.warn(
      "[checklistTemplates] Legacy fallback: user_profiles.office_id (no active office_memberships) for checklist RPC"
    );
    if (normalizeOfficeIdKey(fromProfile) !== normalizeOfficeIdKey(oid)) {
      console.warn("[checklistTemplates] UI office id differs from profile office_id; using profile for RPC", {
        uiOfficeId: oid,
        profileOfficeId: fromProfile,
      });
    }
    return { resolvedOfficeId: fromProfile, authUserId };
  }

  console.warn(
    "[checklistTemplates] Last-resort fallback: UI-provided office id (no membership or profile office)"
  );
  return { resolvedOfficeId: oid, authUserId };
}

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
  created_at?: string | null;
};
export type ChecklistTemplateItemRow = {
  id: string;
  template_id: string;
  section_id: string | null;
  name: string;
  requirement: string | null;
  sort_order: number | null;
  is_compliance_document?: boolean | null;
  created_at?: string | null;
};

/** sort_order ASC, then created_at ASC, then id — never alphabetize by name. */
export function compareChecklistTemplateSections(
  a: Pick<ChecklistTemplateSectionRow, "id" | "sort_order"> & { created_at?: string | null },
  b: Pick<ChecklistTemplateSectionRow, "id" | "sort_order"> & { created_at?: string | null }
): number {
  const d = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  if (d !== 0) return d;
  const ta = a.created_at ?? "";
  const tb = b.created_at ?? "";
  if (ta !== tb) return ta < tb ? -1 : ta > tb ? 1 : 0;
  return a.id.localeCompare(b.id);
}

export function compareChecklistTemplateItems(
  a: Pick<ChecklistTemplateItemRow, "id" | "sort_order"> & { created_at?: string | null },
  b: Pick<ChecklistTemplateItemRow, "id" | "sort_order"> & { created_at?: string | null }
): number {
  const d = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  if (d !== 0) return d;
  const ta = a.created_at ?? "";
  const tb = b.created_at ?? "";
  if (ta !== tb) return ta < tb ? -1 : ta > tb ? 1 : 0;
  return a.id.localeCompare(b.id);
}

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

export type ChecklistTemplateCreatedFrom = "btq" | "btq_starter" | "duplicate" | "manual";

export type OfficeChecklistTemplateRow = ChecklistTemplate & {
  office_id: string;
  created_from: ChecklistTemplateCreatedFrom;
  source_template_id: string | null;
};

/** Aligns `transactions.type` / wizard values to `checklist_templates.checklist_type` (lowercase in DB). */
export function normalizeChecklistType(transactionType: string): string {
  const t = transactionType.trim().toLowerCase();
  if (t.includes("lease")) return "lease";
  if (t.includes("purchase") || t.includes("buy")) return "purchase";
  if (t.includes("list") || t.includes("listing")) return "listing";
  return "other";
}

/**
 * Active office templates compatible with the wizard transaction type (normalized checklist_type).
 */
export async function fetchActiveOfficeTemplatesForTransactionType(
  officeId: string,
  transactionType: string
): Promise<ChecklistTemplate[]> {
  const oid = officeId.trim();
  const tt = transactionType.trim();
  if (!oid || !tt) return [];

  const checklistType = normalizeChecklistType(transactionType);

  const { data, error } = await supabase
    .from("checklist_templates")
    .select("id, name, checklist_type, is_default_for_type, archived_at, created_at")
    .eq("office_id", oid)
    .eq("checklist_type", checklistType)
    .eq("is_active", true)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[fetchActiveOfficeTemplatesForTransactionType]", error);
    return [];
  }

  return (data ?? []) as ChecklistTemplate[];
}

type ChecklistTemplateValidateRow = ChecklistTemplate & {
  office_id: string;
  is_active: boolean;
};

/**
 * Loads a template if it exists and satisfies create-transaction rules for the given office and transaction type.
 */
export async function fetchChecklistTemplateForCreateValidation(
  officeId: string,
  transactionType: string,
  templateId: string
): Promise<ChecklistTemplate | null> {
  const oid = officeId.trim();
  const tid = templateId.trim();
  if (!oid || !tid) return null;

  const expectedType = normalizeChecklistType(transactionType);

  const { data, error } = await supabase
    .from("checklist_templates")
    .select(
      "id, name, checklist_type, is_default_for_type, archived_at, created_at, office_id, is_active"
    )
    .eq("id", tid)
    .maybeSingle();

  if (error) {
    console.error("[fetchChecklistTemplateForCreateValidation]", error);
    return null;
  }

  const row = data as ChecklistTemplateValidateRow | null;
  if (!row) return null;
  if (row.office_id !== oid) return null;
  if (!row.is_active) return null;
  if (row.archived_at != null) return null;
  if (normalizeChecklistType(row.checklist_type ?? "") !== expectedType) return null;

  return {
    id: row.id,
    name: row.name,
    checklist_type: row.checklist_type,
    is_default_for_type: row.is_default_for_type,
    archived_at: row.archived_at,
    created_at: row.created_at,
  };
}

/**
 * Resolves the office-owned checklist template for a new transaction.
 * Prefers explicit default for (office + checklist_type), else oldest active template of that type (created_at ASC).
 * Throws if none exist — never falls back to BTQ/global templates.
 * @deprecated Prefer explicit template selection in the UI plus {@link fetchChecklistTemplateForCreateValidation}.
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
    .eq("is_active", true)
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
    .eq("is_active", true)
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
 * Server-side: ensures an active office template exists for the type (clone from global BTQ master if missing),
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

  const { resolvedOfficeId, authUserId } = await resolveOfficeIdForChecklistRpc(oid);

  if (import.meta.env.DEV) {
    console.log("[checklist RPC] ensure_office_checklist_template_from_btq (client)", {
      authUserId,
      p_office_id_arg: oid,
      p_office_id_resolved: resolvedOfficeId,
    });
  }

  const { data, error } = await supabase.rpc("ensure_office_checklist_template_from_btq", {
    p_office_id: resolvedOfficeId,
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

/** Global BTQ master templates (office_id null) for broker settings dropdown (RLS-safe via RPC). */
export type BtqMasterChecklistTemplateRow = {
  id: string;
  name: string;
  checklist_type: string;
};

export async function listBtqMasterChecklistTemplates(): Promise<BtqMasterChecklistTemplateRow[]> {
  const { data, error } = await supabase.rpc("list_btq_checklist_starters");
  if (error) {
    console.error("[listBtqMasterChecklistTemplates]", error);
    return [];
  }
  return (data ?? []) as BtqMasterChecklistTemplateRow[];
}

/** Clone a global BTQ master template into an office-owned template (RLS-safe via RPC). */
export async function cloneBtqMasterTemplateToOffice(
  officeId: string,
  btqTemplateId: string
): Promise<{ templateId: string | null; error: Error | null }> {
  const oid = officeId.trim();
  const bid = btqTemplateId.trim();
  if (!oid || !bid) {
    return { templateId: null, error: new Error("Office and BTQ template id are required") };
  }

  const { resolvedOfficeId, authUserId } = await resolveOfficeIdForChecklistRpc(oid);

  if (import.meta.env.DEV) {
    console.log("[checklist RPC] clone_btq_starter_to_office (client)", {
      authUserId,
      p_office_id_ui: oid,
      p_office_id_resolved: resolvedOfficeId,
    });
  }

  const { data, error } = await supabase.rpc("clone_btq_starter_to_office", {
    p_office_id: resolvedOfficeId,
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

export async function updateChecklistTemplateSection(params: {
  sectionId: string;
  name?: string;
  sortOrder?: number;
}): Promise<{ error: Error | null }> {
  const patch: Record<string, unknown> = {};
  if (params.name !== undefined) {
    const trimmed = params.name.trim();
    if (!trimmed) return { error: new Error("Section name is required") };
    patch.name = trimmed;
  }
  if (params.sortOrder !== undefined) patch.sort_order = params.sortOrder;
  if (Object.keys(patch).length === 0) return { error: null };

  const { error } = await supabase
    .from("checklist_template_sections")
    .update(patch)
    .eq("id", params.sectionId);

  return { error: error ? new Error(error.message) : null };
}

export async function renameChecklistTemplateSection(
  sectionId: string,
  name: string
): Promise<{ error: Error | null }> {
  return updateChecklistTemplateSection({ sectionId, name });
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

  const sectionsSorted = [...raw.sections].sort(compareChecklistTemplateSections);

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

  const itemsSorted = [...raw.items].sort(compareChecklistTemplateItems);

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
  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  const sectionOrFallback = (sectionId: string | null): DbSection =>
    sectionId && sectionMap.has(sectionId)
      ? sectionMap.get(sectionId)!
      : ({
          id: "__unsectioned__",
          template_id: "",
          name: "Other",
          sort_order: 999999,
          created_at: null,
        } as DbSection);

  const sorted = [...items].sort((a, b) => {
    const secCmp = compareChecklistTemplateSections(
      sectionOrFallback(a.section_id),
      sectionOrFallback(b.section_id)
    );
    if (secCmp !== 0) return secCmp;
    return compareChecklistTemplateItems(a, b);
  });

  return sorted.map((item) => {
    const sectionRow = item.section_id ? sectionMap.get(item.section_id) : undefined;
    const section = sectionRow
      ? { name: sectionRow.name ?? "", sortOrder: sectionRow.sort_order ?? 999 }
      : undefined;
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
      .select("id, template_id, name, sort_order, created_at")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("checklist_template_items")
      .select(
        "id, template_id, section_id, name, requirement, sort_order, is_compliance_document, created_at"
      )
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
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
