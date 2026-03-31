/**
 * Adapter: maps existing UI/data shapes to Document Engine types.
 * Use this to integrate the engine with ChecklistItem, TransactionRow, etc.
 */

import type {
  DocumentEngineDocument,
  DocumentEngineTransaction,
  DocumentEngineUser,
  DocumentStatus,
} from "./types";
import { toCanonicalStatus } from "./documentEngine";

/** ChecklistItem shape from TransactionInbox / Checklist */
export type ChecklistItemShape = {
  id: string;
  requirement: "required" | "optional";
  /** false = reference file only; excluded from compliance (default true). */
  isComplianceDocument?: boolean;
  reviewStatus: "pending" | "rejected" | "complete" | "waived";
  /** Persisted `checklist_items.document_id` — treat as attached when inbox merge has not hydrated `attachedDocument`. */
  documentId?: string | null;
  attachedDocument?: {
    id: string;
    filename: string;
    storage_path: string;
    version?: number;
    updatedAt?: Date;
  };
  comments?: unknown[];
  updatedAt?: string;
};

function checklistHasAttachment(item: {
  /** Truthy when a file is linked (full shape varies by call site). */
  attachedDocument?: unknown;
  documentId?: string | null;
}): boolean {
  if (item.attachedDocument) return true;
  const id = item.documentId;
  return id != null && String(id).trim() !== "";
}

/** TransactionRow from transactions service */
export type TransactionRowShape = {
  id: string;
  office?: string | null;
  /** Stable auth UID of list agent. Prefer over display names when available. */
  agent_user_id?: string | null;
  /** Stable auth UID of assigned admin. Prefer over display names when available. */
  assigned_admin_user_id?: string | null;
  /** Display names — use for UI labels only. Do NOT use as identifiers in engine. */
  listagent?: string | null;
  buyeragent?: string | null;
  assignedadmin?: string | null;
  closingDate?: string | null;
  /** Supabase `transactions.closing_date` when passing a raw row */
  closing_date?: string | null;
  closingdate?: string | null;
  contractdate?: string | null;
  status?: string | null;
};

/**
 * Convert ChecklistItem + transaction context to DocumentEngineDocument.
 * Status from workflow only. hasAttachment is separate fact for blocking logic.
 */
export function checklistItemToEngineDocument(
  item: ChecklistItemShape,
  transactionId: string,
  officeId: string,
  options?: {
    rejectionCount?: number;
    lastComment?: string | null;
    /** Stable auth UID. Do NOT pass display names. */
    assignedAdminUserId?: string | null;
    assignedAdminDisplayName?: string | null;
    submittedAt?: string | Date | null;
  }
): DocumentEngineDocument {
  const waived = item.reviewStatus === "waived";
  const hasAttachment = checklistHasAttachment(item);
  const isCompliance = item.isComplianceDocument !== false;

  let status: DocumentStatus;
  if (waived) {
    status = toCanonicalStatus(item.reviewStatus);
  } else if (!hasAttachment) {
    status = "NOT_SUBMITTED";
  } else if (!isCompliance) {
    // Reference / supplemental: file linked only — no compliance queue (not SUBMITTED / not ACCEPTED from attach).
    status = "NOT_SUBMITTED";
  } else {
    status = toCanonicalStatus(item.reviewStatus);
  }

  return {
    id: item.id,
    transactionId,
    officeId,
    status,
    required: item.requirement === "required",
    isComplianceDocument: item.isComplianceDocument !== false,
    waived,
    hasAttachment,
    assignedAdminUserId: options?.assignedAdminUserId ?? null,
    assignedAdminDisplayName: options?.assignedAdminDisplayName ?? null,
    lastComment: options?.lastComment ?? null,
    rejectionCount: options?.rejectionCount ?? 0,
    updatedAt: item.updatedAt ?? null,
    submittedAt: options?.submittedAt ?? null,
  };
}

/**
 * Convert TransactionRow to DocumentEngineTransaction.
 * Uses agent_user_id and assigned_admin_user_id only for identity. Display names for UI only.
 * TODO: When agent_user_id is null (legacy data), do NOT fall back to listagent/buyeragent as ID.
 * Source must provide true UID; listagent/buyeragent are display-only.
 */
export function transactionRowToEngineTransaction(
  row: TransactionRowShape
): DocumentEngineTransaction {
  const officeId = row.office ?? "";
  const closingDate = row.closingDate ?? row.closing_date ?? row.closingdate ?? null;
  // Prefer assigned_admin_user_id; some DBs store the stable admin UID only in assignedadmin.
  const assignedAdminUserId = row.assigned_admin_user_id ?? row.assignedadmin ?? null;
  const assignedAdminDisplayName =
    row.assignedadmin && row.assignedadmin !== assignedAdminUserId ? row.assignedadmin : null;

  return {
    id: row.id,
    officeId,
    agentUserId: row.agent_user_id ?? null,
    agentDisplayName: row.listagent ?? row.buyeragent ?? null,
    assignedAdminUserId,
    assignedAdminDisplayName,
    closingDate,
    dueDate: row.contractdate ?? closingDate ?? null,
    status: row.status ?? null,
  };
}

/**
 * Build a minimal DocumentEngineUser from current session.
 * id MUST be the stable auth UID. displayName is for UI labels only.
 * Default role is AGENT when roles unspecified (do NOT default to ADMIN).
 *
 * TODO: Wire to real auth/profile when user roles/offices are persisted.
 */
export function buildEngineUser(options: {
  /** Stable auth user ID / UID. Required for identity checks. */
  id: string;
  roles?: UserRoleInput[];
  officeIds?: string[];
  canSelfReview?: boolean;
  assignedTransactionIds?: string[];
  assignedDocumentIds?: string[];
  /** Display name for UI only. Never use as identifier. */
  displayName?: string;
}): DocumentEngineUser {
  const roles = (options.roles ?? ["AGENT"]).filter(
    (r): r is "AGENT" | "ADMIN" | "BROKER" =>
      r === "AGENT" || r === "ADMIN" || r === "BROKER"
  );
  return {
    id: options.id,
    roles: roles.length > 0 ? roles : ["AGENT"],
    officeIds: options.officeIds ?? [],
    canSelfReview: options.canSelfReview,
    assignedTransactionIds: options.assignedTransactionIds,
    assignedDocumentIds: options.assignedDocumentIds,
    displayName: options.displayName,
  };
}

type UserRoleInput = "AGENT" | "ADMIN" | "BROKER" | string;

/** ChecklistItemForControls from TransactionControls (minimal shape) */
export type ChecklistItemForControlsShape = {
  id: string;
  requirement: "required" | "optional";
  isComplianceDocument?: boolean;
  reviewStatus: "pending" | "rejected" | "complete" | "waived";
  documentId?: string | null;
  attachedDocument?: { updatedAt?: Date };
};

/**
 * Convert ChecklistItemForControls to DocumentEngineDocument for closing readiness.
 * Status from workflow only. hasAttachment is separate fact for blocking logic.
 */
export function checklistItemForControlsToEngineDocument(
  item: ChecklistItemForControlsShape,
  transactionId = "",
  officeId = ""
): DocumentEngineDocument {
  const waived = item.reviewStatus === "waived";
  const hasAttachment = checklistHasAttachment(item);
  const isCompliance = item.isComplianceDocument !== false;

  let status: DocumentStatus;
  if (waived) {
    status = toCanonicalStatus(item.reviewStatus);
  } else if (!hasAttachment) {
    status = "NOT_SUBMITTED";
  } else if (!isCompliance) {
    status = "NOT_SUBMITTED";
  } else {
    status = toCanonicalStatus(item.reviewStatus);
  }

  return {
    id: item.id,
    transactionId,
    officeId,
    status,
    required: item.requirement === "required",
    isComplianceDocument: item.isComplianceDocument !== false,
    waived,
    hasAttachment,
  };
}
