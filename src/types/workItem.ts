// src/types/workItem.ts

export type WorkItemStatus = "error" | "warning" | "success" | "pending" | "info";

export type WorkItem = {
  id: string;

  // Generic label/identifier for ANY industry:
  // "123 Oak St" (real estate), "Case #22" (billing), "Job #1041" (service company)
  identifier: string;

  // Generic classification:
  // "Sale", "Lease", "Claim", "Invoice", "Service Call"
  type: string;

  // Optional owner/assignee label. Could be agent, account manager, tech, etc.
  owner: string;

  /** Display name for the agent side (list/buyer); for sorting and admin context. */
  agentDisplayName?: string;

  // Generic status + display label
  status: WorkItemStatus;
  statusLabel: string;

  /** Raw `transactions.status` for workflow (e.g. Closed). */
  rawTransactionStatus?: string;

  // Keep dates generic — not "closingDate"
  dueDate: string;

  // Generic “quality/compliance flags”
  missingCount: number;
  rejectedCount: number;

  /** Compliance checklist rows awaiting admin review (is_compliance_document, review pending). */
  compliancePendingReviewCount?: number;
  /** Compliance checklist rows rejected. */
  complianceRejectedCount?: number;

  lastActivity: string;

  // Tenant context
  organizationId: string;
  organizationName: string;

  isArchived: boolean;
  archivedBy: { name: string; role: string } | null;
};