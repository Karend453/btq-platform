// src/types/workItem.ts

/** Mutually exclusive compliance queue per transaction (document engine dominant state). */
export type ComplianceDominantState =
  | "rejected"
  | "missing"
  | "pending_review"
  | "complete";

export type WorkItemStatus = "error" | "warning" | "success" | "pending" | "info";

export type WorkItem = {
  id: string;

  // Generic label/identifier for ANY industry:
  // "123 Oak St" (real estate), "Case #22" (billing), "Job #1041" (service company)
  identifier: string;

  // Normalized for list display: Listing | Purchase | Lease | Other
  type: string;

  // Optional owner/assignee label. Could be agent, account manager, tech, etc.
  owner: string;

  /** Display name for the agent side (list/buyer); for sorting and admin context. */
  agentDisplayName?: string;

  /** Workflow / compliance status label (who needs to act next). */
  status: string;
  /** Same as `status` — kept for search/back-compat. */
  statusLabel: string;
  /** Badge color for workflow status (filter on this, not lifecycle). */
  statusType: WorkItemStatus;

  /** Lifecycle stage from `transactions.status` (e.g. Pre-Contract, Closed). */
  stage: string;

  /** Raw `transactions.status` (same as stage source). */
  rawTransactionStatus?: string;

  /** ISO date string from `closing_date` (sort + display formatting). */
  closingDate: string;

  /** Kept in sync with `closingDate` for older call sites. */
  dueDate: string;

  /** Compact issue summary, e.g. "2 missing, 1 rejected". */
  risk: string;

  // Generic “quality/compliance flags”
  missingCount: number;
  rejectedCount: number;

  /** Compliance checklist rows awaiting admin review (is_compliance_document, review pending). */
  compliancePendingReviewCount?: number;
  /** Compliance checklist rows rejected. */
  complianceRejectedCount?: number;

  /** Dominant compliance status from checklist + document engine (aligned with Compliance Overview). */
  complianceDominant?: ComplianceDominantState;

  /** Document-engine counts (required compliance items) — same basis as dashboard finalize rules. */
  missingRequiredCount?: number;
  pendingReviewRequiredCount?: number;
  rejectedRequiredCount?: number;
  /** Workflow `transactions.status` is Closed. */
  workflowClosed?: boolean;
  /** `client_portfolio.portfolio_stage === "final"`. */
  closingFinalized?: boolean;

  lastActivity: string;

  // Tenant context
  organizationId: string;
  organizationName: string;

  isArchived: boolean;
  archivedBy: { name: string; role: string } | null;
};