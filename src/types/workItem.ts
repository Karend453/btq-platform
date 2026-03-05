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

  // Generic status + display label
  status: WorkItemStatus;
  statusLabel: string;

  // Keep dates generic — not "closingDate"
  dueDate: string;

  // Generic “quality/compliance flags”
  missingCount: number;
  rejectedCount: number;

  lastActivity: string;

  // Tenant context
  organizationId: string;
  organizationName: string;

  isArchived: boolean;
  archivedAt: Date | null;
  archivedBy: { name: string; role: string } | null;
};