// src/services/transactions.ts

import {
  WorkItem,
  WorkItemStatus,
  type ComplianceDominantState,
  type ExportPackageListState,
} from "../types/workItem";
import { supabase } from "../lib/supabaseClient";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  getCurrentUser,
  getTransactionRuntimeRole,
  getUserProfileRoleKey,
  resolveOfficeScopedDataAccess,
} from "./auth";
import { fetchChecklistTemplateForCreateValidation } from "./checklistTemplates";
import { fetchComplianceDocCountsByTransactionIds } from "./checklistItems";
import { checklistItemToEngineDocument } from "../lib/documents/adapter";
import type { ChecklistItemShape } from "../lib/documents/adapter";
import {
  getTransactionClosingReadiness,
  isComplianceWorkflowDocument,
} from "../lib/documents/documentEngine";
import type { DocumentEngineDocument } from "../lib/documents/types";
import { syncClientPortfolioFromTransaction } from "./clientPortfolio";

/** Set to `true` only while diagnosing save/RLS issues. */
const EDIT_TX_SAVE_DEBUG = false;

function logEditTxSave(stage: string, payload: Record<string, unknown>) {
  if (!EDIT_TX_SAVE_DEBUG) return;
  console.info("[EDIT_TX_SAVE]", stage, payload);
}

function compactDefined<T extends Record<string, unknown>>(row: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(row).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

/** Aligns client-side office filter with RLS (`transactions.office_id`), with legacy `office` fallback. */
function rowOfficeIdForProfileScope(row: {
  office?: string | null;
  office_id?: string | null;
}): string {
  const oid = row.office_id;
  if (oid != null && String(oid).trim() !== "") return String(oid).trim();
  return (row.office ?? "").trim();
}

/** Stable compare for UUID / office strings (Postgres may return UUIDs with different casing). */
function normalizeOfficeScopeKey(value: string): string {
  return value.trim().toLowerCase();
}

function transactionOfficeMatchesScope(
  row: { office?: string | null; office_id?: string | null },
  scopeOfficeId: string
): boolean {
  return (
    normalizeOfficeScopeKey(rowOfficeIdForProfileScope(row)) ===
    normalizeOfficeScopeKey(scopeOfficeId)
  );
}


export type TransactionRow = {
  id: string;
  identifier: string | null;
  clientname: string | null;
  type: string | null;
  office: string | null;
  /** UUID; RLS and profile scope use this. Legacy rows may rely on `office` only. */
  office_id?: string | null;
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
  /** Unique address for signed-doc intake (e.g. ZipForms); format txn-{id}@docs.btqrlt.com */
  intake_email: string | null;
  /** Legacy denormalized agent display; DB triggers/RPCs read `t.agent` for client_portfolio.agent_name. */
  agent?: string | null;
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
 * Which DB column pair (list_* vs buyer_*) holds this transaction's agent commission for
 * unified display and edit (same rules as Edit Transaction Details).
 */
export function getActiveCommissionSide(row: TransactionRow): "list" | "buyer" {
  const { buyerSide, sellerSide } = transactionSideFlags(row.transaction_side);
  if (buyerSide && !sellerSide) return "buyer";
  if (sellerSide && !buyerSide) return "list";
  const listHas =
    (row.listcommissionpercent ?? "").trim() !== "" ||
    (row.listcommissionamount ?? "").trim() !== "";
  const buyerHas =
    (row.buyercommissionpercent ?? "").trim() !== "" ||
    (row.buyercommissionamount ?? "").trim() !== "";
  if (listHas && !buyerHas) return "list";
  if (buyerHas && !listHas) return "buyer";
  return "list";
}

/** One commission % string for summary cards (active side only; empty → "—"). */
export function formatUnifiedCommissionPercentDisplay(row: TransactionRow): string {
  const side = getActiveCommissionSide(row);
  const raw =
    side === "list"
      ? (row.listcommissionpercent ?? "")
      : (row.buyercommissionpercent ?? "");
  const t = raw.trim();
  if (!t) return "—";
  return t.endsWith("%") ? t : `${t}%`;
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
 * Label from `user_profiles` for a transaction’s `agent_user_id` (list/dashboard batch path).
 * Order: display_name → email → "Unassigned". Omits list/buyer/session email so viewers never
 * infer the wrong person when `agent_user_id` is set.
 */
export function agentDisplayLabelFromProfileFields(
  display_name: string | null | undefined,
  email: string | null | undefined
): string {
  const dn = (display_name ?? "").trim();
  if (dn) return dn;
  const em = (email ?? "").trim();
  if (em) return em;
  return "Unassigned";
}

const PROFILE_BATCH_SIZE = 100;

/** Batch-load `user_profiles.display_name` + `email` for agent labels (single source for transaction UI). */
export async function fetchUserProfileLabelsByIds(
  ids: string[]
): Promise<Map<string, { display_name: string | null; email: string | null }>> {
  const unique = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
  const out = new Map<string, { display_name: string | null; email: string | null }>();
  for (let i = 0; i < unique.length; i += PROFILE_BATCH_SIZE) {
    const chunk = unique.slice(i, i + PROFILE_BATCH_SIZE);
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, display_name, email")
      .in("id", chunk);
    if (error) {
      console.error("[fetchUserProfileLabelsByIds]", error);
      continue;
    }
    for (const row of data ?? []) {
      const id = row.id as string;
      out.set(id, {
        display_name: (row.display_name as string | null) ?? null,
        email: (row.email as string | null) ?? null,
      });
    }
  }
  return out;
}

/**
 * Agent column for list / compliance when `agent_user_id` is set: uses batched `user_profiles` only.
 * Legacy rows without `agent_user_id` still use list/buyer hints (see {@link getAssignedAgentDisplayNameFromRow}).
 */
function resolveAgentLabelForListRow(
  row: TransactionRow,
  profileById: Map<string, { display_name: string | null; email: string | null }>
): string {
  const uid = row.agent_user_id?.trim();
  if (!uid) {
    return formatAgentLabelForList(getAssignedAgentDisplayNameFromRow(row));
  }
  const p = profileById.get(uid);
  if (p) {
    return formatAgentLabelForList(
      agentDisplayLabelFromProfileFields(p.display_name, p.email)
    );
  }
  return formatAgentLabelForList(getAssignedAgentDisplayNameFromRow(row));
}

/**
 * Agent label for transaction detail/edit pages: `user_profiles` by `agent_user_id`, never list/buyer email strings.
 */
export async function resolveAgentDisplayLabelForTransaction(
  row: TransactionRow
): Promise<string> {
  const uid = row.agent_user_id?.trim();
  if (!uid) {
    return (
      formatAgentLabelForList(getAssignedAgentDisplayNameFromRow(row)).trim() ||
      "Unassigned"
    );
  }
  const map = await fetchUserProfileLabelsByIds([uid]);
  return resolveAgentLabelForListRow(row, map).trim() || "Unassigned";
}

/**
 * Display label for the transaction agent when `agent_user_id` is unset: list/buyer hints by
 * `transaction_side`. When `agent_user_id` is set, list/buyer are not authoritative — prefer
 * {@link resolveAgentLabelForListRow} with {@link fetchUserProfileLabelsByIds} on list/dashboard.
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
 * Normalize legacy list/buyer display strings. If the value is an email, show the full address
 * (never the local-part only). Prefer {@link resolveAgentDisplayLabelForTransaction} when `agent_user_id` is set.
 */
export function formatAgentLabelForList(raw: string): string {
  const s = raw.trim();
  if (!s || s === "Unassigned") return raw;
  if (s.includes("@")) return s;
  return s;
}

/** List column: Listing / Purchase / Lease / Other (non-matching → Other). */
function normalizeTransactionTypeForList(type: string | null): string {
  const t = (type ?? "").toLowerCase();
  if (t.includes("lease")) return "Lease";
  if (t.includes("purchase") || t.includes("buy")) return "Purchase";
  if (t.includes("listing") || t.includes("list")) return "Listing";
  return "Other";
}

/** Collapse profile/runtime roles to list/dashboard rollup: only agents get the "rejected" badge; everyone else uses the review queue badge. */
export type TransactionListRollupViewer = "agent" | "admin";

export function resolveTransactionListRollupViewer(
  role:
    | "agent"
    | "admin"
    | "broker"
    | "btq_admin"
    | null
    | undefined
): TransactionListRollupViewer {
  return role === "agent" ? "agent" : "admin";
}

/** Search text aligned with the same viewer-specific rollup as the status badge. */
function formatActionRisk(
  docs: DocumentEngineDocument[],
  rollupViewer: TransactionListRollupViewer
): string {
  const compliance = docs.filter(isComplianceWorkflowDocument);
  if (rollupViewer === "agent") {
    const rej = compliance.filter((d) => d.status === "REJECTED").length;
    return rej > 0 ? `${rej} rejected` : "—";
  }
  const pend = compliance.filter((d) => d.status === "SUBMITTED").length;
  return pend > 0 ? `${pend} pending review` : "—";
}

/**
 * Transaction list / dashboard rollup only (not document-level).
 * - Agent: badge only if any compliance doc is rejected (never "Pending Review" here).
 * - Admin/broker: badge only if any compliance doc is pending review (never "Rejected" here).
 */
export function getTransactionRollupActionStatus(
  docs: DocumentEngineDocument[],
  rollupViewer: TransactionListRollupViewer
): ComplianceDominantState {
  const compliance = docs.filter(isComplianceWorkflowDocument);
  const hasRejected = compliance.some((d) => d.status === "REJECTED");
  const hasPendingReview = compliance.some((d) => d.status === "SUBMITTED");
  if (rollupViewer === "agent") {
    if (hasRejected) return "rejected";
    return "none";
  }
  if (hasPendingReview) return "pending_review";
  return "none";
}

function toWorkItem(
  row: TransactionRow,
  rollupViewer: TransactionListRollupViewer,
  profileById: Map<string, { display_name: string | null; email: string | null }>
): WorkItem {
  const agentDisplayName = resolveAgentLabelForListRow(row, profileById);
  const { readiness, dominant, docs } = getComplianceReadinessAndDominant(row, [], rollupViewer);
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
    statusType: wf.status as WorkItemStatus,
    stage: (row.status ?? "").trim() || "—",
    rawTransactionStatus: row.status ?? undefined,
    closingDate: closing,
    dueDate: closing,
    risk: formatActionRisk(docs, rollupViewer),
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

  const row = data as TransactionRow;
  const { scopeOfficeId, denyAll } = await resolveOfficeScopedDataAccess();
  if (denyAll) return null;
  if (scopeOfficeId && !transactionOfficeMatchesScope(row, scopeOfficeId)) return null;

  return row;
}

export type CreateTransactionInput = {
  identifier: string;
  type: string;
  clientName: string;
  officeId: string;
  /** When set, validated and stored; omit or empty to choose a checklist later on the transaction page. */
  checklistTemplateId?: string | null;
  /** Stored on `transaction_side`; drives which of listagent/buyeragent gets session email. */
  transactionSide?: string | null;
};

const INTAKE_EMAIL_DOMAIN = "docs.btqrlt.com";

/** Stable unique intake address derived from the transaction id (single insert with client UUID). */
function intakeEmailForTransactionId(transactionId: string): string {
  const compact = transactionId.replace(/-/g, "").toLowerCase();
  return `txn-${compact}@${INTAKE_EMAIL_DOMAIN}`;
}

export async function createTransaction(input: CreateTransactionInput): Promise<TransactionRow | null> {
  const user = await getCurrentUser();
  if (!user?.id) {
    console.error("[createTransaction] no authenticated user; cannot set agent_user_id");
    return null;
  }

  const { scopeOfficeId, denyAll } = await resolveOfficeScopedDataAccess();
  if (denyAll) {
    console.error("[createTransaction] broker has no office_id on profile");
    return null;
  }
  if (scopeOfficeId && input.officeId.trim() !== scopeOfficeId) {
    console.error("[createTransaction] office_id must match user_profiles.office_id");
    return null;
  }

  const templateId = (input.checklistTemplateId ?? "").trim();
  let checklist_template_id: string | null = null;
  let checklisttype: string | null = null;

  if (templateId) {
    const checklistTemplate = await fetchChecklistTemplateForCreateValidation(
      input.officeId,
      input.type,
      templateId
    );
    if (!checklistTemplate) {
      throw new Error(
        "Invalid checklist template. It may be inactive, archived, or not match this office and transaction type."
      );
    }
    checklist_template_id = checklistTemplate.id;
    checklisttype = checklistTemplate.name;
  }

  const transactionSide = input.transactionSide ?? null;
  const sessionEmail = user.email?.trim() ?? "";
  const agentFields = sessionAgentNameFieldsForTransactionSide(transactionSide, sessionEmail);
  const agent =
    (agentFields.listagent ?? "").trim() ||
    (agentFields.buyeragent ?? "").trim() ||
    sessionEmail ||
    null;

  const id = crypto.randomUUID();
  const intake_email = intakeEmailForTransactionId(id);

  const payload = {
    id,
    identifier: input.identifier,
    type: input.type,
    clientname: input.clientName,
    office: input.officeId,      // legacy, keep for now
    office_id: input.officeId,   // required for new RLS / newer queries
    status: "Pre-Contract",
    isarchived: false,
    archivedat: null,
    agent_user_id: user.id,
    agent,
    transaction_side: transactionSide,
    listagent: agentFields.listagent,
    buyeragent: agentFields.buyeragent,
    checklist_template_id,
    checklisttype,
    intake_email,
  };

  console.log(
    "[createTransaction] public.transactions insert payload:",
    JSON.stringify(payload, null, 2)
  );

  const { data, error } = await supabase
    .from("transactions")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    console.error("[createTransaction] supabase insert error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    console.error("Failed to create transaction", error);
    return null;
  }
  if (data?.id) {
    await syncClientPortfolioFromTransaction(data.id);
  }
  
  return data ? (data as TransactionRow) : null;
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
  const user = await getCurrentUser();
  const roleKey = await getUserProfileRoleKey();
  const { scopeOfficeId, denyAll } = await resolveOfficeScopedDataAccess();

  logEditTxSave("ENTRY", {
    branch: "ENTRY",
    transactionId: id,
    authUserId: user?.id ?? null,
    profileRoleKey: roleKey,
    scopeOfficeId,
    denyAll,
    brokerSession:
      roleKey === "broker"
        ? {
            note: "Broker with profile office_id uses scopeOfficeId for client pre-check; RLS SELECT allows same-office rows but UPDATE required separate broker policy.",
            hasScopeOfficeId: scopeOfficeId != null && String(scopeOfficeId).trim() !== "",
          }
        : null,
  });

  if (denyAll) {
    logEditTxSave("EXIT", { branch: "DENY_ALL_NO_OFFICE", transactionId: id });
    return {
      data: null,
      error: {
        message: "No office linked to your profile.",
        details: "",
        hint: "",
        code: "42501",
        name: "PostgrestError",
      } as PostgrestError,
    };
  }
  if (scopeOfficeId) {
    const { data: cur, error: curErr } = await supabase
      .from("transactions")
      .select("office, office_id")
      .eq("id", id)
      .maybeSingle();

    const rowOfficeRaw = rowOfficeIdForProfileScope(cur ?? {});
    const scopeMatch = transactionOfficeMatchesScope(cur ?? {}, scopeOfficeId);

    logEditTxSave("PRE_CHECK_SCOPE", {
      branch: "PRE_CHECK_SCOPE",
      transactionId: id,
      preCheckQueryError: curErr
        ? { code: curErr.code, message: curErr.message, details: curErr.details }
        : null,
      rowPresent: cur != null,
      rowOfficeResolvedForCompare: rowOfficeRaw,
      rowOfficeId: cur && "office_id" in cur ? (cur as { office_id?: unknown }).office_id : undefined,
      rowOfficeLegacy: cur && "office" in cur ? (cur as { office?: unknown }).office : undefined,
      scopeOfficeId,
      normalizedRowKey: normalizeOfficeScopeKey(rowOfficeRaw),
      normalizedScopeKey: normalizeOfficeScopeKey(scopeOfficeId),
      scopeMatch,
    });

    if (curErr || !scopeMatch) {
      logEditTxSave("EXIT", {
        branch: "PRE_CHECK_SCOPE_FAIL",
        transactionId: id,
        authUserId: user?.id ?? null,
        profileRoleKey: roleKey,
        userFacingToast: "Transaction not found or access denied.",
        reason: curErr ? "pre_check_supabase_error" : "office_scope_mismatch_or_missing_row",
      });
      return {
        data: null,
        error: {
          message: "Transaction not found or access denied.",
          details: "",
          hint: "",
          code: "PGRST116",
          name: "PostgrestError",
        } as PostgrestError,
      };
    }
  } else {
    logEditTxSave("PRE_CHECK_SCOPE", {
      branch: "PRE_CHECK_SCOPE",
      transactionId: id,
      skipped: true,
      reason: "scopeOfficeId_null_btq_admin_or_unscoped_agent",
    });
  }

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

  logEditTxSave("PATCH", {
    branch: "PATCH_REQUEST",
    transactionId: id,
    patchKeyCount: Object.keys(patch).length,
    patchKeys: Object.keys(patch),
  });

  // Use `.select("id")` without `.single()`: PostgREST + `.single()` sends
  // `Accept: application/vnd.pgrst.object+json` and returns 406 PGRST116 when the
  // response is not exactly one row (e.g. zero rows updated under RLS, or no row
  // in RETURNING). An array response avoids that coercion error.
  const patchResult = await supabase
    .from("transactions")
    .update(patch)
    .eq("id", id)
    .select("id");

  const { data: updatedRows, error } = patchResult;
  const httpStatus =
    patchResult && typeof patchResult === "object" && "status" in patchResult
      ? (patchResult as { status?: number }).status
      : undefined;

  logEditTxSave("PATCH", {
    branch: "PATCH_RESPONSE",
    transactionId: id,
    profileRoleKey: roleKey,
    httpStatus: httpStatus ?? null,
    updatedRowCount: updatedRows?.length ?? 0,
    updatedRowsIds: updatedRows?.map((r) => (r as { id?: string }).id) ?? [],
    patchError: error
      ? { code: error.code, message: error.message, details: error.details, hint: error.hint }
      : null,
    patchErrorJson: error ? JSON.stringify(error) : null,
  });

  if (error) {
    logEditTxSave("EXIT", {
      branch: "PATCH_SUPABASE_ERROR",
      transactionId: id,
      profileRoleKey: roleKey,
      messageMatchingToast: error.message,
    });
    console.error("[updateTransaction] Supabase error:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { data: null, error };
  }

  if (!updatedRows?.length) {
    logEditTxSave("EXIT", {
      branch: "PATCH_RETURNED_ZERO_ROWS",
      transactionId: id,
      authUserId: user?.id ?? null,
      profileRoleKey: roleKey,
      httpStatus: httpStatus ?? null,
      updatedRowsLength: updatedRows?.length ?? 0,
      userFacingToast: "Transaction not found or access denied.",
      diagnosisForBroker:
        roleKey === "broker"
          ? "Broker: Postgres updated 0 rows. SELECT RLS allows brokers for same office_id; UPDATE policies had no broker office-scoped rule — apply brokers_can_update_office_transactions migration."
          : null,
      diagnosisGeneric:
        roleKey !== "broker"
          ? "Zero rows from UPDATE+RETURNING: RLS denied UPDATE (wrong role policies) or id not found."
          : null,
    });
    return {
      data: null,
      error: {
        message: "Transaction not found or access denied.",
        details: "",
        hint: "",
        code: "PGRST116",
        name: "PostgrestError",
      } as PostgrestError,
    };
  }

  logEditTxSave("SYNC", { branch: "CLIENT_PORTFOLIO_SYNC_START", transactionId: id });
  await syncClientPortfolioFromTransaction(id);

  const reloaded = await getTransaction(id);
  logEditTxSave("RELOAD", {
    branch: "POST_UPDATE_GET_TRANSACTION",
    transactionId: id,
    reloadReturnedRow: reloaded != null,
  });
  if (!reloaded) {
    logEditTxSave("EXIT", {
      branch: "RELOAD_AFTER_UPDATE_NULL",
      transactionId: id,
      note: "PATCH succeeded but getTransaction returned null (office scope after reload or RLS)",
    });
  }

  logEditTxSave("EXIT", { branch: "SUCCESS", transactionId: id, reloadReturnedRow: reloaded != null });
  return { data: reloaded, error: null };
}

// ─── Compliance Overview (dashboard): batched checklist + document engine ───

const CHECKLIST_BATCH_SIZE = 120;

export type PortfolioSnapshotListFlags = {
  closingFinalized: boolean;
  /** True only when finalized, export_status is ready, and export_storage_path is non-empty. */
  exportPackageReady: boolean;
  exportListState: ExportPackageListState;
};

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
  missingRequired: number;
  pendingReview: number;
  rejected: number;
  /** Workflow status is Closed (case-insensitive). */
  workflowClosed: boolean;
  /** `client_portfolio.portfolio_stage === "final"` — locked closing snapshot. */
  closingFinalized: boolean;
  /** True when finalized and export ZIP is ready (ready + storage path). Mirrors list rules. */
  exportPackageReady?: boolean;
  exportPackageListState?: ExportPackageListState;
};

export type ComplianceOverviewLegend = {
  rejected: number;
  pendingReview: number;
  /** No status badge (nothing rejected or awaiting review). */
  noAction: number;
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
  /** Per-row workflow status (rejected / pending review / none). */
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

type ClientPortfolioListRow = {
  transaction_id?: string | null;
  portfolio_stage?: string | null;
  export_status?: string | null;
  export_storage_path?: string | null;
};

function derivePortfolioSnapshotListFlags(row: ClientPortfolioListRow): PortfolioSnapshotListFlags {
  const closingFinalized = row.portfolio_stage === "final";
  if (!closingFinalized) {
    return { closingFinalized: false, exportPackageReady: false, exportListState: "unknown" };
  }
  const st = (row.export_status ?? "").trim().toLowerCase();
  const path = (row.export_storage_path ?? "").trim();
  if (st === "failed") {
    return { closingFinalized: true, exportPackageReady: false, exportListState: "failed" };
  }
  if (st === "ready" && path !== "") {
    return { closingFinalized: true, exportPackageReady: true, exportListState: "ready" };
  }
  if (st === "pending") {
    return { closingFinalized: true, exportPackageReady: false, exportListState: "pending" };
  }
  if (st === "ready" && !path) {
    return { closingFinalized: true, exportPackageReady: false, exportListState: "unknown" };
  }
  if (!st) {
    return { closingFinalized: true, exportPackageReady: false, exportListState: "not_created" };
  }
  return { closingFinalized: true, exportPackageReady: false, exportListState: "unknown" };
}

/**
 * Batch-load `client_portfolio` closing + export flags for list/dashboard rows.
 * Does not filter by office_id so results align with per-transaction portfolio reads (RLS still applies).
 */
async function fetchPortfolioSnapshotFlagsForTransactionIds(
  transactionIds: string[]
): Promise<Map<string, PortfolioSnapshotListFlags>> {
  const map = new Map<string, PortfolioSnapshotListFlags>();
  if (transactionIds.length === 0 || !supabase) return map;
  for (let i = 0; i < transactionIds.length; i += CHECKLIST_BATCH_SIZE) {
    const chunk = transactionIds.slice(i, i + CHECKLIST_BATCH_SIZE);
    const { data, error } = await supabase
      .from("client_portfolio")
      .select("transaction_id, portfolio_stage, export_status, export_storage_path")
      .in("transaction_id", chunk);
    if (error) {
      console.error("[fetchPortfolioSnapshotFlagsForTransactionIds]", error);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as ClientPortfolioListRow;
      const tid = r.transaction_id?.trim();
      if (!tid) continue;
      map.set(tid, derivePortfolioSnapshotListFlags(r));
    }
  }
  return map;
}

/** Pipeline / “active deal” for KPI counts: not archived and not terminal workflow status. */
function isActivePipelineTransaction(row: TransactionRow): boolean {
  if (row.isarchived) return false;
  const s = (row.status ?? "").trim().toLowerCase();
  if (s === "closed" || s === "archived") return false;
  return true;
}

function dominantStateToTableFields(
  dominant: ComplianceDominantState,
  readiness: ReturnType<typeof getTransactionClosingReadiness>
): Pick<ComplianceOverviewTableRow, "status" | "statusLabel" | "documents" | "missingDocs"> {
  const accepted = readiness.acceptedRequiredCount;
  switch (dominant) {
    case "rejected":
      return {
        status: "error",
        statusLabel: "Rejected",
        missingDocs: undefined,
        documents: accepted,
      };
    case "pending_review":
      return {
        status: "warning",
        statusLabel: "Pending Review",
        missingDocs: undefined,
        documents: accepted,
      };
    case "none":
      return {
        status: "pending",
        statusLabel: "",
        missingDocs: undefined,
        documents: accepted,
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
  checklistRowsForTx: ChecklistItemDbRow[],
  rollupViewer: TransactionListRollupViewer
): {
  readiness: ReturnType<typeof getTransactionClosingReadiness>;
  dominant: ComplianceDominantState;
  docs: DocumentEngineDocument[];
} {
  const docs = engineDocumentsForTransaction(tx, checklistRowsForTx);
  const readiness = getTransactionClosingReadiness(docs);
  const dominant = getTransactionRollupActionStatus(docs, rollupViewer);
  return { readiness, dominant, docs };
}

/** Viewer-specific list/dashboard rollup (same rules as listTransactions). */
export function getComplianceDominantStateForTransaction(
  tx: TransactionRow,
  checklistRowsForTx: ChecklistItemDbRow[],
  rollupViewer: TransactionListRollupViewer = "admin"
): ComplianceDominantState {
  return getComplianceReadinessAndDominant(tx, checklistRowsForTx, rollupViewer).dominant;
}

export type FetchComplianceOverviewOptions = {
  /**
   * Dashboard-only: filters the primary `transactions` query by `transactions.office` when non-empty.
   * For `btq_admin`, pass the selected office to narrow tenant-wide RLS results to one office.
   * For profile-scoped users, values should match their allowed office; profile scope still wins when set.
   */
  dashboardOfficeId?: string | null;
};

/**
 * Compliance Overview: two queries (transactions + batched checklist_items), then
 * checklistItemToEngineDocument + getTransactionClosingReadiness per transaction in memory.
 * Agent scope: only that agent's transactions. Office: `transactions.office` when `scopeOfficeId` or dashboard selection applies.
 */
export async function fetchComplianceOverviewData(
  options?: FetchComplianceOverviewOptions,
): Promise<ComplianceOverviewData | null> {
  const user = await getCurrentUser();
  const role = await getTransactionRuntimeRole();

  const { scopeOfficeId, denyAll } = await resolveOfficeScopedDataAccess();
  const roleKey = await getUserProfileRoleKey();
  const dash = (options?.dashboardOfficeId ?? "").trim();

  /** Effective office filter on `transactions.office` (client-side, aligned with RLS). */
  let officeFilter: string | null = scopeOfficeId;
  if (dash) {
    if (roleKey === "btq_admin") {
      officeFilter = dash;
    } else if (scopeOfficeId) {
      officeFilter = scopeOfficeId;
    } else {
      officeFilter = dash;
    }
  }

  const emptyKpis: DashboardKpis = {
    activeTransactionCount: 0,
    distinctAgentsOnActiveDeals: 0,
    distinctOfficesOnActiveDeals: 0,
    complianceDocsPendingReviewCount: 0,
    activePipelineSalePriceSum: 0,
  };

  if (denyAll) {
    return {
      legend: { rejected: 0, pendingReview: 0, noAction: 0 },
      tableRows: [],
      kpis: emptyKpis,
    };
  }

  let txQuery = supabase.from("transactions").select("*");
  if (officeFilter) {
    txQuery = txQuery.eq("office", officeFilter);
  }
  const { data: txData, error: txErr } = await txQuery;

  if (txErr) {
    console.error("fetchComplianceOverviewData: transactions", txErr);
    return null;
  }

  let rows = (txData ?? []) as TransactionRow[];
  rows = rows.filter((r) => !r.isarchived);

  if (role === "agent") {
    if (!user?.id) {
      return {
        legend: { rejected: 0, pendingReview: 0, noAction: 0 },
        tableRows: [],
        kpis: emptyKpis,
      };
    }
    rows = rows.filter((r) => r.agent_user_id === user.id);
  }
  // role === "admin" | "broker": keep full RLS-scoped set; do not collapse broker identity into admin.

  const rollupViewer = resolveTransactionListRollupViewer(role);

  const profileById = await fetchUserProfileLabelsByIds(
    rows.map((r) => r.agent_user_id).filter((x): x is string => !!x?.trim())
  );

  const ids = rows.map((r) => r.id);
  const [checklistRows, portfolioFlagsByTxId] = await Promise.all([
    fetchChecklistRowsForTransactions(ids),
    fetchPortfolioSnapshotFlagsForTransactionIds(ids),
  ]);
  const byTx = new Map<string, ChecklistItemDbRow[]>();
  for (const cr of checklistRows) {
    const tid = cr.transaction_id;
    const list = byTx.get(tid);
    if (list) list.push(cr);
    else byTx.set(tid, [cr]);
  }

  const legend: ComplianceOverviewLegend = {
    rejected: 0,
    pendingReview: 0,
    noAction: 0,
  };

  const tableRows: ComplianceOverviewTableRow[] = [];
  const kpis: DashboardKpis = { ...emptyKpis };
  const agentIdsOnActive = new Set<string>();
  const officesOnActive = new Set<string>();

  for (const tx of rows) {
    const { readiness, dominant } = getComplianceReadinessAndDominant(
      tx,
      byTx.get(tx.id) ?? [],
      rollupViewer
    );

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
      case "pending_review":
        legend.pendingReview += 1;
        break;
      case "none":
        legend.noAction += 1;
        break;
    }

    const fields = dominantStateToTableFields(dominant, readiness);
    const agentName = resolveAgentLabelForListRow(tx, profileById);
    const wf = (tx.status ?? "").trim().toLowerCase();
    const pf = portfolioFlagsByTxId.get(tx.id);

    tableRows.push({
      id: tx.id,
      address: (tx.identifier ?? "").trim() || "—",
      agent: agentName || "—",
      type: mapTransactionType(tx.type),
      ...fields,
      amount: formatCurrencyUsd(tx.saleprice),
      closingDate: formatClosingDate(tx.closing_date),
      missingRequired: readiness.missingRequiredCount,
      pendingReview: readiness.submittedRequiredCount,
      rejected: readiness.rejectedRequiredCount,
      workflowClosed: wf === "closed",
      closingFinalized: pf?.closingFinalized === true,
      exportPackageReady: pf?.exportPackageReady,
      exportPackageListState: pf?.exportListState,
    });
  }

  const closingById = new Map(rows.map((r) => [r.id, r.closing_date] as const));
  tableRows.sort((a, b) => {
    const fa = a.closingFinalized ? 1 : 0;
    const fb = b.closingFinalized ? 1 : 0;
    if (fa !== fb) return fa - fb;
    return (
      closingSortKey(closingById.get(a.id) ?? null) -
      closingSortKey(closingById.get(b.id) ?? null)
    );
  });

  kpis.distinctAgentsOnActiveDeals = agentIdsOnActive.size;
  kpis.distinctOfficesOnActiveDeals = officesOnActive.size;

  return { legend, tableRows, kpis };
}

export async function listTransactions(
  viewerRoleKey?: "admin" | "agent" | "broker" | null
): Promise<WorkItem[]> {
  const role =
    viewerRoleKey !== undefined ? viewerRoleKey : await getUserProfileRoleKey();

  const { scopeOfficeId, denyAll } = await resolveOfficeScopedDataAccess();

  if (denyAll) {
    return [];
  }

  let txQuery = supabase.from("transactions").select("*");
  if (scopeOfficeId) {
    txQuery = txQuery.eq("office", scopeOfficeId);
  }
  const { data, error } = await txQuery;

  if (error) {
    console.error("Failed to load transactions", error);
    return [];
  }

  const rollupViewer = resolveTransactionListRollupViewer(role);

  const rows = (data ?? []) as TransactionRow[];
  const profileById = await fetchUserProfileLabelsByIds(
    rows.map((r) => r.agent_user_id).filter((x): x is string => !!x?.trim())
  );
  const items = rows.map((row) => toWorkItem(row, rollupViewer, profileById));
  const ids = items.map((i) => i.id);
  const [counts, checklistRows, portfolioFlagsByTxId] = await Promise.all([
    fetchComplianceDocCountsByTransactionIds(ids),
    fetchChecklistRowsForTransactions(ids),
    fetchPortfolioSnapshotFlagsForTransactionIds(ids),
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
    const { readiness, dominant, docs } = getComplianceReadinessAndDominant(
      tx,
      checklistForTx,
      rollupViewer
    );
    const wf = dominantStateToTableFields(dominant, readiness);

    const wfStatus = (tx.status ?? "").trim().toLowerCase();
    const pf = portfolioFlagsByTxId.get(tx.id);

    return {
      ...item,
      status: wf.statusLabel,
      statusLabel: wf.statusLabel,
      statusType: wf.status as WorkItemStatus,
      risk: formatActionRisk(docs, rollupViewer),
      compliancePendingReviewCount: pending,
      complianceRejectedCount: rejected,
      missingCount: pending,
      rejectedCount: rejected,
      complianceDominant: dominant,
      missingRequiredCount: readiness.missingRequiredCount,
      pendingReviewRequiredCount: readiness.submittedRequiredCount,
      rejectedRequiredCount: readiness.rejectedRequiredCount,
      workflowClosed: wfStatus === "closed",
      closingFinalized: pf?.closingFinalized === true,
      exportPackageReady: pf?.exportPackageReady === true,
      exportPackageListState: pf?.exportListState,
    };
  });
}

/** Re-export for consumers that import compliance types from the service layer. */
export type { ComplianceDominantState };