// src/services/transactions.ts

import { WorkItem, WorkItemStatus } from "../types/workItem";

type TransactionRow = {
  id: string;
  identifier: string;
  type: string;
  agent: string;
  status: string;
  statusLabel: string;
  closingDate: string;
  missingDocs: number;
  rejectedDocs: number;
  lastActivity: string;
  office: string;
  isArchived: boolean;
  archivedAt: Date | null;
  archivedBy: { name: string; role: string } | null;
};

// Mock data
const mockTransactions: TransactionRow[] = [
  {
    id: "TXN-2401",
    identifier: "123 Oak Street, Chicago, IL 60601",
    type: "Sale",
    agent: "Sarah Johnson",
    status: "error",
    statusLabel: "Missing Docs",
    closingDate: "2026-03-15",
    missingDocs: 3,
    rejectedDocs: 0,
    lastActivity: "2 hours ago",
    office: "Downtown Office",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  },
  {
    id: "TXN-2402",
    identifier: "456 Maple Avenue, Chicago, IL 60614",
    type: "Purchase",
    agent: "Michael Chen",
    status: "warning",
    statusLabel: "Under Review",
    closingDate: "2026-03-20",
    missingDocs: 0,
    rejectedDocs: 2,
    lastActivity: "4 hours ago",
    office: "Northside Office",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  },
  {
    id: "TXN-2403",
    identifier: "789 Pine Road, Evanston, IL 60201",
    type: "Sale",
    agent: "Emily Rodriguez",
    status: "success",
    statusLabel: "Complete",
    closingDate: "2026-03-10",
    missingDocs: 0,
    rejectedDocs: 0,
    lastActivity: "1 hour ago",
    office: "Downtown Office",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  },
  {
    id: "TXN-2404",
    identifier: "321 Birch Lane, Oak Park, IL 60302",
    type: "Lease",
    agent: "David Kim",
    status: "pending",
    statusLabel: "Pending",
    closingDate: "2026-03-08",
    missingDocs: 1,
    rejectedDocs: 0,
    lastActivity: "30 min ago",
    office: "West End Office",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  },
  {
    id: "TXN-2405",
    identifier: "654 Cedar Court, Naperville, IL 60540",
    type: "Sale",
    agent: "Jessica Martinez",
    status: "error",
    statusLabel: "Rejected",
    closingDate: "2026-03-25",
    missingDocs: 2,
    rejectedDocs: 3,
    lastActivity: "3 hours ago",
    office: "West End Office",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  },
  {
    id: "TXN-2406",
    identifier: "987 Elm Drive, Schaumburg, IL 60173",
    type: "Purchase",
    agent: "Robert Taylor",
    status: "info",
    statusLabel: "Under Contract",
    closingDate: "2026-04-01",
    missingDocs: 0,
    rejectedDocs: 0,
    lastActivity: "1 day ago",
    office: "Northside Office",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  },
  {
    id: "TXN-2407",
    identifier: "246 Willow Street, Arlington Heights, IL 60004",
    type: "Sale",
    agent: "Sarah Johnson",
    status: "warning",
    statusLabel: "Docs Pending",
    closingDate: "2026-03-28",
    missingDocs: 1,
    rejectedDocs: 1,
    lastActivity: "5 hours ago",
    office: "Downtown Office",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  },
  {
    id: "TXN-2408",
    identifier: "135 Spruce Avenue, Des Plaines, IL 60016",
    type: "Lease",
    agent: "Michael Chen",
    status: "success",
    statusLabel: "Complete",
    closingDate: "2026-03-05",
    missingDocs: 0,
    rejectedDocs: 0,
    lastActivity: "2 days ago",
    office: "Northside Office",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  },
  {
    id: "TXN-2409",
    identifier: "468 Ash Boulevard, Park Ridge, IL 60068",
    type: "Purchase",
    agent: "Emily Rodriguez",
    status: "info",
    statusLabel: "Pre-Contract",
    closingDate: "2026-04-10",
    missingDocs: 0,
    rejectedDocs: 0,
    lastActivity: "6 hours ago",
    office: "Downtown Office",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  },
  {
    id: "TXN-2410",
    identifier: "579 Poplar Lane, Skokie, IL 60076",
    type: "Sale",
    agent: "David Kim",
    status: "pending",
    statusLabel: "Pending Review",
    closingDate: "2026-03-30",
    missingDocs: 0,
    rejectedDocs: 1,
    lastActivity: "8 hours ago",
    office: "West End Office",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  },
  {
    id: "TXN-2411",
    identifier: "890 Valley Road, Wilmette, IL 60091",
    type: "Sale",
    agent: "Sarah Johnson",
    status: "success",
    statusLabel: "Closed",
    closingDate: "2026-02-28",
    missingDocs: 0,
    rejectedDocs: 0,
    lastActivity: "3 days ago",
    office: "Downtown Office",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  },
  {
    id: "TXN-2301",
    identifier: "111 Commerce Street, Chicago, IL 60602",
    type: "Sale",
    agent: "Sarah Johnson",
    status: "success",
    statusLabel: "Closed",
    closingDate: "2026-02-15",
    missingDocs: 0,
    rejectedDocs: 0,
    lastActivity: "15 days ago",
    office: "Downtown Office",
    isArchived: true,
    archivedAt: new Date("2026-02-20T14:30:00"),
    archivedBy: { name: "Admin User", role: "Admin" },
  },
  {
    id: "TXN-2302",
    identifier: "222 Market Avenue, Evanston, IL 60201",
    type: "Purchase",
    agent: "Michael Chen",
    status: "success",
    statusLabel: "Closed",
    closingDate: "2026-01-28",
    missingDocs: 0,
    rejectedDocs: 0,
    lastActivity: "1 month ago",
    office: "Northside Office",
    isArchived: true,
    archivedAt: new Date("2026-02-02T10:15:00"),
    archivedBy: { name: "Karen Admin", role: "Admin" },
  },
];

function toWorkItem(row: TransactionRow): WorkItem {
    const allowed: WorkItemStatus[] = ["error", "warning", "success", "pending", "info"];
  
    const status = allowed.includes(row.status as WorkItemStatus)
      ? (row.status as WorkItemStatus)
      : "info";
  
    return {
      id: row.id,
      identifier: row.identifier,
      type: row.type,
      owner: row.agent,
      status,
      statusLabel: row.statusLabel,
      dueDate: row.closingDate,
      missingCount: row.missingDocs,
      rejectedCount: row.rejectedDocs,
      lastActivity: row.lastActivity,
      organizationId: `org_${row.office.toLowerCase().replace(/\s+/g, "_")}`,
      organizationName: row.office,
      isArchived: row.isArchived,
      archivedAt: row.archivedAt,
      archivedBy: row.archivedBy,
    };
  }
  
  export async function listTransactions(): Promise<WorkItem[]> {
    return mockTransactions.map(toWorkItem);
  }
  
  export async function getTransaction(id: string): Promise<WorkItem | null> {
    const found = mockTransactions.find((t) => t.id === id);
    return found ? toWorkItem(found) : null;
  }