import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Search,
  Plus,
  AlertCircle,
  FileX,
  Archive,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { StatusBadge, StatusType } from "../components/dashboard/StatusBadge";

interface TransactionRow {
  id: string;
  identifier: string;
  type: string;
  agent: string;
  status: StatusType;
  statusLabel: string;
  closingDate: string;
  missingDocs: number;
  rejectedDocs: number;
  lastActivity: string;
  office: string;
  isArchived: boolean;
  archivedAt: Date | null;
  archivedBy: { name: string; role: string } | null;
}

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

interface TransactionsListProps {
  userRole?: "broker" | "agent";
  initialFilter?: string | null;
}

export function TransactionsList({ userRole = "broker", initialFilter = null }: TransactionsListProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialFilter || "all");
  const [officeFilter, setOfficeFilter] = useState("all");

  // Update filter when initialFilter changes (e.g., from URL)
  useEffect(() => {
    if (initialFilter) {
      setStatusFilter(initialFilter);
    }
  }, [initialFilter]);

  // Helper to check if transaction is eligible for archive
  const isEligibleForArchive = (transaction: TransactionRow) => {
    // Must be Closed status
    if (transaction.statusLabel !== "Closed") return false;
    
    // Must not already be archived
    if (transaction.isArchived) return false;
    
    // Must have no document issues (simplified check using display data)
    if (transaction.missingDocs > 0 || transaction.rejectedDocs > 0) return false;
    
    return true;
  };

  // Filter transactions based on search and filters
  const filteredTransactions = mockTransactions.filter((transaction) => {
    const matchesSearch =
      searchQuery === "" ||
      transaction.identifier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      transaction.agent.toLowerCase().includes(searchQuery.toLowerCase());

    // Special handling for archived filter
    let matchesStatus = false;
    if (statusFilter === "archived") {
      matchesStatus = transaction.isArchived;
    } else if (statusFilter === "all") {
      // "All" shows only non-archived transactions
      matchesStatus = !transaction.isArchived;
    } else {
      // Other filters show non-archived matching the status label
      matchesStatus = !transaction.isArchived && 
        transaction.statusLabel.toLowerCase().includes(statusFilter.toLowerCase());
    }

    const matchesOffice =
      officeFilter === "all" || transaction.office === officeFilter;

    return matchesSearch && matchesStatus && matchesOffice;
  });

  const handleRowClick = (transactionId: string) => {
    navigate(`/transactions/${transactionId}`);
  };

  const handleNewTransaction = () => {
    navigate("/transactions/new");
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Transactions</h1>
          <p className="text-slate-600 mt-1">
            Manage and track all real estate transactions
          </p>
        </div>
        <Button onClick={handleNewTransaction}>
          <Plus className="h-4 w-4 mr-2" />
          Start Transaction
        </Button>
      </div>

      {/* Filters Row */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by address or client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Status Dropdown */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pre-contract">Pre-Contract</SelectItem>
                <SelectItem value="under contract">Under Contract</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>

            {/* Office Dropdown - Only for brokers */}
            {userRole === "broker" && (
              <Select value={officeFilter} onValueChange={setOfficeFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="All Offices" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Offices</SelectItem>
                  <SelectItem value="Downtown Office">Downtown Office</SelectItem>
                  <SelectItem value="Northside Office">Northside Office</SelectItem>
                  <SelectItem value="West End Office">West End Office</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-6 py-4 text-sm font-medium text-slate-700">
                    Identifier
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-slate-700">
                    Type
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-slate-700">
                    Agent
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-slate-700">
                    Status
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-slate-700">
                    Closing Date
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-slate-700">
                    Risk
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-slate-700">
                    Last Activity
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-500">
                        {statusFilter === "archived" ? (
                          <>
                            <Archive className="h-12 w-12 mb-3 text-slate-300" />
                            <p className="font-medium">No Archived Transactions</p>
                            <p className="text-sm mt-1 max-w-md">
                              Archived transactions appear here after closeout. When you archive a transaction, 
                              it becomes read-only and a closeout package is created.
                            </p>
                          </>
                        ) : (
                          <>
                            <FileX className="h-12 w-12 mb-3 text-slate-300" />
                            <p className="font-medium">No transactions found</p>
                            <p className="text-sm mt-1">
                              Try adjusting your search or filters
                            </p>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((transaction) => {
                    const totalRisk = transaction.missingDocs + transaction.rejectedDocs;
                    
                    return (
                      <tr
                        key={transaction.id}
                        onClick={() => handleRowClick(transaction.id)}
                        className="border-b border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-slate-900">
                            {transaction.identifier}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {transaction.id}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-slate-900">
                            {transaction.type}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-slate-900">
                            {transaction.agent}
                          </div>
                          {userRole === "broker" && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {transaction.office}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {transaction.isArchived ? (
                            <Badge className="bg-slate-600 text-white border-0">
                              <Archive className="h-3 w-3 mr-1" />
                              Archived
                            </Badge>
                          ) : (
                            <StatusBadge
                              status={transaction.status}
                              label={transaction.statusLabel}
                            />
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {transaction.isArchived && transaction.archivedAt ? (
                            <div>
                              <div className="text-sm text-slate-900">
                                {new Date(transaction.closingDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                Archived: {new Date(transaction.archivedAt).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-slate-900">
                              {new Date(transaction.closingDate).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {totalRisk > 0 ? (
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-red-600" />
                              <div className="text-sm">
                                <span className="font-medium text-red-700">
                                  {totalRisk}
                                </span>
                                <span className="text-slate-600 ml-1">
                                  {transaction.missingDocs > 0 &&
                                    `${transaction.missingDocs} missing`}
                                  {transaction.missingDocs > 0 &&
                                    transaction.rejectedDocs > 0 &&
                                    ", "}
                                  {transaction.rejectedDocs > 0 &&
                                    `${transaction.rejectedDocs} rejected`}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-slate-500">—</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-slate-600">
                            {transaction.lastActivity}
                          </div>
                          {isEligibleForArchive(transaction) && (
                            <div className="text-xs text-blue-600 mt-0.5 italic">
                              Eligible to archive (open for details)
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Results count */}
      {filteredTransactions.length > 0 && (
        <div className="text-sm text-slate-600 text-center">
          Showing {filteredTransactions.length} of {mockTransactions.filter(t => statusFilter === "archived" ? t.isArchived : !t.isArchived).length} {statusFilter === "archived" ? "archived" : ""} transactions
        </div>
      )}
    </div>
  );
}