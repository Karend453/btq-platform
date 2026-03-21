/**
 * BTQ Document Engine — Canonical types for transaction health, compliance, and closing readiness.
 * One shared logic engine; outcomes vary by permission, scope, and active view.
 */

// ─── Canonical Document Statuses ───────────────────────────────────────────
// Do NOT create RESUBMITTED. Re-uploads after rejection become SUBMITTED again.
// History/comments/audit trail track repeat cycles.
export type DocumentStatus =
  | "NOT_SUBMITTED"
  | "SUBMITTED"
  | "REJECTED"
  | "ACCEPTED";

// Waived is a special case: treated as non-blocking for closing (like ACCEPTED).
// Kept separate for audit/reporting; existing UI uses "waived".
export type WaivedStatus = boolean;

// ─── Current Action Owner (derived from status) ─────────────────────────────
// Dashboard counts should depend on this, not raw status alone.
export type CurrentActionOwner = "AGENT" | "ADMIN" | "NONE";

// ─── Roles & Scope ──────────────────────────────────────────────────────────
export type UserRole = "AGENT" | "ADMIN" | "BROKER";

export type ScopeType =
  | "self_only"
  | "assigned_items"
  | "one_office"
  | "multiple_offices"
  | "all_offices";

export type ActiveView = "AGENT_VIEW" | "ADMIN_VIEW" | "BROKER_VIEW";

// ─── Urgency (for queue prioritization) ──────────────────────────────────────
export type DocumentUrgency = "NORMAL" | "WARNING" | "CRITICAL";

// ─── User (permission model) ────────────────────────────────────────────────
/** User.id MUST be stable auth UID. Display names are for UI only. */
export type DocumentEngineUser = {
  /** Stable auth user ID / UID. Use for all identity checks. */
  id: string;
  roles: UserRole[];
  officeIds: string[];
  canSelfReview?: boolean;
  assignedTransactionIds?: string[];
  assignedDocumentIds?: string[];
  /** Display name for UI labels only. Never use as identifier. */
  displayName?: string;
};

// ─── Transaction (minimal context for engine) ─────────────────────────────────
export type DocumentEngineTransaction = {
  id: string;
  officeId: string;
  /** Stable auth UID of the agent. Use for identity checks. Do NOT use display names. */
  agentUserId?: string | null;
  /** Display name for UI only. Never use in engine logic. */
  agentDisplayName?: string | null;
  /** Stable auth UID of assigned admin. Use for identity checks. Do NOT use display names. */
  assignedAdminUserId?: string | null;
  /** Display name for UI only. Never use in engine logic. */
  assignedAdminDisplayName?: string | null;
  closingDate?: string | null;
  dueDate?: string | null;
  status?: string | null;
};

// ─── Document / Checklist Item (engine shape) ─────────────────────────────────
export type DocumentEngineDocument = {
  id: string;
  transactionId: string;
  officeId: string;
  status: DocumentStatus;
  required: boolean;
  /** When false, item is reference/supplemental only — excluded from compliance review and health. */
  isComplianceDocument?: boolean;
  waived?: boolean;
  /** File attachment presence. Separate from status; used for blocking/closing-readiness only. */
  hasAttachment?: boolean;
  /** Stable auth UID of assigned admin. Use for identity checks. Do NOT use display names. */
  assignedAdminUserId?: string | null;
  /** Display name for UI only. Never use in engine logic. */
  assignedAdminDisplayName?: string | null;
  lastComment?: string | null;
  rejectionCount?: number;
  updatedAt?: string | Date | null;
  createdAt?: string | Date | null;
  /** For urgency: when doc was submitted (if applicable) */
  submittedAt?: string | Date | null;
};

// ─── Document State (derived helper output) ───────────────────────────────────
export type DocumentState = {
  status: DocumentStatus;
  currentActionOwner: CurrentActionOwner;
  isRequired: boolean;
  isBlocking: boolean;
  canReview: boolean;
  canMarkAccepted: boolean;
  isVisible: boolean;
  urgency: DocumentUrgency;
};

// ─── Closing Readiness ───────────────────────────────────────────────────────
export type ClosingReadiness = {
  isReadyToClose: boolean;
  blockingRequiredCount: number;
  missingRequiredCount: number;
  rejectedRequiredCount: number;
  submittedRequiredCount: number;
  acceptedRequiredCount: number;
  waivedRequiredCount?: number;
};

// ─── Transaction Health (dashboard summary) ───────────────────────────────────
export type TransactionHealth = {
  closingReadiness: ClosingReadiness;
  urgency: DocumentUrgency;
  itemsWaitingOnAgent: number;
  itemsWaitingOnAdmin: number;
  blockingCount: number;
};

// ─── Queue Item (for agent/admin/broker queues) ────────────────────────────────
export type QueueDocumentItem = {
  document: DocumentEngineDocument;
  state: DocumentState;
  transaction?: DocumentEngineTransaction;
  /** For sorting: days until closing (negative = past) */
  daysUntilClosing?: number | null;
};
