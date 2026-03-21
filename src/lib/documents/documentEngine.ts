/**
 * BTQ Document Engine — Shared logic for transaction health, compliance queues, closing readiness.
 * One engine; outcomes vary by permission, scope, and active view.
 *
 * V1 Product Rules:
 * - Canonical statuses: NOT_SUBMITTED, SUBMITTED, REJECTED, ACCEPTED (no RESUBMITTED)
 * - required + status != ACCEPTED => blocking; closing blocked until all required ACCEPTED
 * - currentActionOwner: NOT_SUBMITTED/REJECTED=>AGENT, SUBMITTED=>ADMIN, ACCEPTED=>NONE
 * - Mark Accepted: requires review authority or self-review permission
 * - Reject: status becomes REJECTED, currentActionOwner=AGENT, comment required
 * - Re-upload after reject: status becomes SUBMITTED

 * Urgency thresholds (tunable):
 * - CRITICAL: closing within 3 days + blocking
 * - WARNING: closing within 7 days + blocking
 * - NORMAL: else
 */

import type {
  DocumentEngineDocument,
  DocumentEngineTransaction,
  DocumentEngineUser,
  DocumentState,
  DocumentStatus,
  DocumentUrgency,
  CurrentActionOwner,
  ClosingReadiness,
  TransactionHealth,
  QueueDocumentItem,
  ActiveView,
  ScopeType,
} from "./types";

/** Reference/supplemental rows (not in compliance). Default true when unset (legacy rows). */
export function isComplianceWorkflowDocument(document: DocumentEngineDocument): boolean {
  return document.isComplianceDocument !== false;
}

// ─── Status mapping ──────────────────────────────────────────────────────────
/** Map workflow/review state to canonical DocumentStatus. Pure mapping; no attachment logic. */
export function toCanonicalStatus(
  reviewStatus: "not_submitted" | "pending" | "rejected" | "complete" | "waived"
): DocumentStatus {
  switch (reviewStatus) {
    case "complete":
      return "ACCEPTED";
    case "waived":
      return "ACCEPTED"; // waived satisfies closing; kept distinct via waived flag for audit
    case "rejected":
      return "REJECTED";
    case "pending":
      return "SUBMITTED";
    case "not_submitted":
    default:
      return "NOT_SUBMITTED";
  }
}

/** Check if document is waived (special case for closing) */
export function isWaived(document: DocumentEngineDocument): boolean {
  return !!document.waived;
}

// ─── Core helpers ────────────────────────────────────────────────────────────

/**
 * Returns current action owner from document status.
 * NOT_SUBMITTED/REJECTED => AGENT; SUBMITTED => ADMIN; ACCEPTED => NONE.
 */
export function getCurrentActionOwner(document: DocumentEngineDocument): CurrentActionOwner {
  if (!isComplianceWorkflowDocument(document)) return "NONE";
  if (document.waived) return "NONE";
  switch (document.status) {
    case "NOT_SUBMITTED":
    case "REJECTED":
      return "AGENT";
    case "SUBMITTED":
      return "ADMIN";
    case "ACCEPTED":
      return "NONE";
    default:
      return "AGENT";
  }
}

/**
 * Blocking = compliance + required AND not waived AND (no attachment OR status != ACCEPTED).
 * Optional docs are always non-blocking (including optional compliance).
 * Non-compliance reference docs never block.
 */
export function isBlockingDocument(document: DocumentEngineDocument): boolean {
  if (!isComplianceWorkflowDocument(document)) return false;
  if (!document.required) return false;
  if (document.waived) return false;
  const hasAttachment = document.hasAttachment ?? false;
  const notAccepted = document.status !== "ACCEPTED";
  return !hasAttachment || notAccepted;
}

/**
 * User has review authority for this document:
 * - BROKER: always has admin-level authority
 * - ADMIN: has authority for docs in their scope (office/assigned)
 * - AGENT: only if canSelfReview for their own transactions
 */
export function canUserReviewDocument(
  user: DocumentEngineUser,
  document: DocumentEngineDocument,
  transactionContext?: DocumentEngineTransaction | null
): boolean {
  if (!isComplianceWorkflowDocument(document)) return false;
  // Assigned admin (stable UID on transaction) can always review, even when UI role is AGENT
  // or office scope does not match (getCurrentUserRole / officeIds can be wrong).
  if (
    transactionContext?.assignedAdminUserId &&
    user.id &&
    transactionContext.assignedAdminUserId === user.id
  ) {
    return true;
  }
  if (user.roles.includes("BROKER")) return true;
  if (user.roles.includes("ADMIN")) {
    if (!transactionContext) return user.officeIds.includes(document.officeId);
    return (
      user.officeIds.includes(document.officeId) ||
      transactionContext.assignedAdminUserId === user.id ||
      (user.assignedTransactionIds?.includes(transactionContext.id) ?? false) ||
      (user.assignedDocumentIds?.includes(document.id) ?? false)
    );
  }
  if (user.roles.includes("AGENT") && user.canSelfReview) {
    if (!transactionContext) return false;
    return transactionContext.agentUserId === user.id;
  }
  return false;
}

/**
 * User can Mark Accepted: has review authority OR self-review applies.
 */
export function canUserMarkAccepted(
  user: DocumentEngineUser,
  document: DocumentEngineDocument,
  transactionContext?: DocumentEngineTransaction | null
): boolean {
  return canUserReviewDocument(user, document, transactionContext);
}

/**
 * Scope-aware visibility. User can see document if:
 * - self only: user is agent on transaction
 * - assigned: user is assigned to transaction or document
 * - one/multiple offices: document.officeId in user.officeIds
 * - all offices: all docs visible
 */
export function canUserSeeDocument(
  user: DocumentEngineUser,
  document: DocumentEngineDocument,
  transactionContext?: DocumentEngineTransaction | null,
  scopeType?: ScopeType | null,
  activeView?: ActiveView | null
): boolean {
  const scope = scopeType ?? "multiple_offices";
  if (scope === "all_offices") return true;
  if (scope === "self_only") {
    return transactionContext?.agentUserId === user.id;
  }
  if (scope === "assigned_items") {
    return (
      (transactionContext?.assignedAdminUserId === user.id) ||
      (user.assignedTransactionIds?.includes(document.transactionId) ?? false) ||
      (user.assignedDocumentIds?.includes(document.id) ?? false)
    );
  }
  return user.officeIds.includes(document.officeId);
}

/**
 * Urgency from closing date.
 * CRITICAL: closing within 3 days + blocking
 * WARNING: closing within 7 days + blocking
 * NORMAL: else
 */
export function getDocumentUrgency(
  document: DocumentEngineDocument,
  transactionContext?: DocumentEngineTransaction | null,
  isBlocking?: boolean
): DocumentUrgency {
  const blocking = isBlocking ?? isBlockingDocument(document);
  const closingDate = transactionContext?.closingDate ?? transactionContext?.dueDate;
  if (!closingDate) return "NORMAL";

  const closing = new Date(closingDate);
  const now = new Date();
  const daysUntil = Math.ceil((closing.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (blocking && daysUntil <= 3 && daysUntil >= 0) return "CRITICAL";
  if (blocking && daysUntil <= 7 && daysUntil >= 0) return "WARNING";
  return "NORMAL";
}

/**
 * Main derived helper. Returns full document state for UI/queue logic.
 */
export function getDocumentState(
  document: DocumentEngineDocument,
  user: DocumentEngineUser,
  transactionContext?: DocumentEngineTransaction | null,
  activeView?: ActiveView | null,
  scopeType?: ScopeType | null
): DocumentState {
  const currentActionOwner = getCurrentActionOwner(document);
  const isBlocking = isBlockingDocument(document);
  const canReview = canUserReviewDocument(user, document, transactionContext);
  const canMarkAccepted = canUserMarkAccepted(user, document, transactionContext);
  const isVisible = canUserSeeDocument(user, document, transactionContext, scopeType, activeView);
  const urgency = getDocumentUrgency(document, transactionContext, isBlocking);

  return {
    status: document.status,
    currentActionOwner,
    isRequired: document.required,
    isBlocking,
    canReview,
    canMarkAccepted,
    isVisible,
    urgency,
  };
}

// ─── Queue builders ─────────────────────────────────────────────────────────
//
// QUEUE RULES SUMMARY:
//
// buildAgentQueue:
//   Filter: isVisible (scope + permission)
//   Sort: 1) currentActionOwner === AGENT first, 2) required before optional, 3) urgency (CRITICAL → WARNING → NORMAL)
//   Focus: AGENT-owned work in visible scope (missing uploads, rejected docs, NOT_SUBMITTED)
//
// buildAdminQueue:
//   Filter: isVisible AND currentActionOwner === ADMIN
//   Sort: 1) urgency, 2) required before optional, 3) daysUntilClosing (earliest first)
//   Focus: ADMIN-owned work in visible scope (items awaiting review)
//
// buildBrokerQueue:
//   Filter: isVisible (scope + permission)
//   Sort: 1) blocking first, 2) urgency, 3) required before optional, 4) daysUntilClosing
//   Focus: blocking + urgency + backlog/risk (office oversight)

/**
 * Agent queue: visible docs in scope, prioritize currentActionOwner === AGENT.
 */
export function buildAgentQueue(
  documents: DocumentEngineDocument[],
  user: DocumentEngineUser,
  transactionMap?: Map<string, DocumentEngineTransaction> | null,
  scopeType?: ScopeType | null,
  activeView?: ActiveView | null
): QueueDocumentItem[] {
  const items: QueueDocumentItem[] = [];
  for (const doc of documents) {
    if (!isComplianceWorkflowDocument(doc)) continue;
    const txn = transactionMap?.get(doc.transactionId);
    const state = getDocumentState(doc, user, txn, activeView, scopeType);
    if (!state.isVisible) continue;

    const closingDate = txn?.closingDate ?? txn?.dueDate;
    const daysUntilClosing = closingDate
      ? Math.ceil(
          (new Date(closingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      : null;

    items.push({
      document: doc,
      state,
      transaction: txn,
      daysUntilClosing,
    });
  }

  return items.sort((a, b) => {
    const ownerA = a.state.currentActionOwner === "AGENT" ? 0 : 1;
    const ownerB = b.state.currentActionOwner === "AGENT" ? 0 : 1;
    if (ownerA !== ownerB) return ownerA - ownerB;
    const reqA = a.document.required ? 0 : 1;
    const reqB = b.document.required ? 0 : 1;
    if (reqA !== reqB) return reqA - reqB;
    const urgencyOrder = { CRITICAL: 0, WARNING: 1, NORMAL: 2 };
    return urgencyOrder[a.state.urgency] - urgencyOrder[b.state.urgency];
  });
}

/**
 * Admin queue: visible docs in scope, primarily currentActionOwner === ADMIN.
 * Sort: urgency, required first, oldest waiting.
 */
export function buildAdminQueue(
  documents: DocumentEngineDocument[],
  user: DocumentEngineUser,
  transactionMap?: Map<string, DocumentEngineTransaction> | null,
  scopeType?: ScopeType | null,
  activeView?: ActiveView | null
): QueueDocumentItem[] {
  const items = buildAgentQueue(
    documents,
    user,
    transactionMap,
    scopeType,
    activeView
  );

  return items
    .filter((i) => i.state.currentActionOwner === "ADMIN")
    .sort((a, b) => {
      const urgencyOrder = { CRITICAL: 0, WARNING: 1, NORMAL: 2 };
      const u = urgencyOrder[a.state.urgency] - urgencyOrder[b.state.urgency];
      if (u !== 0) return u;
      const reqA = a.document.required ? 0 : 1;
      const reqB = b.document.required ? 0 : 1;
      if (reqA !== reqB) return reqA - reqB;
      const daysA = a.daysUntilClosing ?? 9999;
      const daysB = b.daysUntilClosing ?? 9999;
      return daysA - daysB;
    });
}

/**
 * Broker queue: scoped office oversight.
 * Prioritize: blocking, urgency, required, earliest closing.
 */
export function buildBrokerQueue(
  documents: DocumentEngineDocument[],
  user: DocumentEngineUser,
  transactionMap?: Map<string, DocumentEngineTransaction> | null,
  scopeType?: ScopeType | null,
  activeView?: ActiveView | null
): QueueDocumentItem[] {
  const items = buildAgentQueue(
    documents,
    user,
    transactionMap,
    scopeType,
    activeView
  );

  return items.sort((a, b) => {
    const blockingA = a.state.isBlocking ? 0 : 1;
    const blockingB = b.state.isBlocking ? 0 : 1;
    if (blockingA !== blockingB) return blockingA - blockingB;
    const urgencyOrder = { CRITICAL: 0, WARNING: 1, NORMAL: 2 };
    const u = urgencyOrder[a.state.urgency] - urgencyOrder[b.state.urgency];
    if (u !== 0) return u;
    const reqA = a.document.required ? 0 : 1;
    const reqB = b.document.required ? 0 : 1;
    if (reqA !== reqB) return reqA - reqB;
    const daysA = a.daysUntilClosing ?? 9999;
    const daysB = b.daysUntilClosing ?? 9999;
    return daysA - daysB;
  });
}

// ─── Transaction-level helpers ──────────────────────────────────────────────

/**
 * Closing readiness for a transaction based on its documents.
 * Blocking uses both: no attachment blocks, not accepted blocks (unless waived).
 * Waived satisfies closing but is audit-distinct (waived flag preserved).
 */
export function getTransactionClosingReadiness(
  transactionDocuments: DocumentEngineDocument[]
): ClosingReadiness {
  const required = transactionDocuments.filter(
    (d) => isComplianceWorkflowDocument(d) && d.required
  );
  const blocking = required.filter((d) => isBlockingDocument(d));
  const submitted = required.filter((d) => d.status === "SUBMITTED");
  const rejected = required.filter((d) => d.status === "REJECTED");
  const missingAttachment = required.filter(
    (d) => !d.waived && !(d.hasAttachment ?? false)
  );
  const accepted = required.filter(
    (d) => d.waived || ((d.hasAttachment ?? false) && d.status === "ACCEPTED")
  );
  const waived = required.filter((d) => d.waived);

  const blockingRequiredCount = blocking.length;
  const isReadyToClose = blockingRequiredCount === 0;

  return {
    isReadyToClose,
    blockingRequiredCount,
    missingRequiredCount: missingAttachment.length,
    rejectedRequiredCount: rejected.length,
    submittedRequiredCount: submitted.length,
    acceptedRequiredCount: accepted.length,
    waivedRequiredCount: waived.length,
  };
}

/**
 * Derive human-readable close validation issues from ClosingReadiness.
 * For UI tooltips and "Not Ready to Close" messaging.
 */
export function getCloseValidationIssues(
  readiness: ClosingReadiness
): { allowed: boolean; issues: string[] } {
  const issues: string[] = [];
  if (readiness.missingRequiredCount > 0) {
    issues.push(
      `${readiness.missingRequiredCount} required document${readiness.missingRequiredCount > 1 ? "s" : ""} need${readiness.missingRequiredCount === 1 ? "s" : ""} attachment`
    );
  }
  if (readiness.rejectedRequiredCount > 0) {
    issues.push(
      `${readiness.rejectedRequiredCount} required document${readiness.rejectedRequiredCount > 1 ? "s are" : " is"} rejected`
    );
  }
  if (readiness.submittedRequiredCount > 0) {
    issues.push(
      `${readiness.submittedRequiredCount} required document${readiness.submittedRequiredCount > 1 ? "s are" : " is"} pending review`
    );
  }
  return {
    allowed: readiness.isReadyToClose,
    issues,
  };
}

/**
 * Compact metrics for Transaction Health UI (detail page + dashboard).
 * Pending/rejected = all compliance docs in SUBMITTED / REJECTED (includes optional when attached/in workflow).
 * Missing required stays on readiness (required-only, via getTransactionClosingReadiness).
 */
export function getTransactionHealthSectionMetrics(
  transactionDocuments: DocumentEngineDocument[]
): {
  isReadyToClose: boolean;
  missingRequiredCount: number;
  pendingReviewCount: number;
  rejectedComplianceCount: number;
} {
  const readiness = getTransactionClosingReadiness(transactionDocuments);
  const compliance = transactionDocuments.filter((d) => isComplianceWorkflowDocument(d));
  const pendingReviewCount = compliance.filter((d) => d.status === "SUBMITTED").length;
  const rejectedComplianceCount = compliance.filter((d) => d.status === "REJECTED").length;
  return {
    isReadyToClose: readiness.isReadyToClose,
    missingRequiredCount: readiness.missingRequiredCount,
    pendingReviewCount,
    rejectedComplianceCount,
  };
}

/**
 * Transaction health summary for dashboard.
 */
export function getTransactionHealth(
  transaction: DocumentEngineTransaction,
  documents: DocumentEngineDocument[],
  user: DocumentEngineUser,
  activeView?: ActiveView | null
): TransactionHealth {
  const closingReadiness = getTransactionClosingReadiness(documents);

  let maxUrgency: DocumentUrgency = "NORMAL";
  let itemsWaitingOnAgent = 0;
  let itemsWaitingOnAdmin = 0;
  let blockingCount = 0;

  for (const doc of documents) {
    if (!isComplianceWorkflowDocument(doc)) continue;
    const owner = getCurrentActionOwner(doc);
    if (owner === "AGENT") itemsWaitingOnAgent++;
    if (owner === "ADMIN") itemsWaitingOnAdmin++;
    if (isBlockingDocument(doc)) blockingCount++;
    const u = getDocumentUrgency(doc, transaction);
    if (u === "CRITICAL") maxUrgency = "CRITICAL";
    else if (u === "WARNING" && maxUrgency !== "CRITICAL") maxUrgency = "WARNING";
  }

  return {
    closingReadiness,
    urgency: maxUrgency,
    itemsWaitingOnAgent,
    itemsWaitingOnAdmin,
    blockingCount,
  };
}