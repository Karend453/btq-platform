import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getUserDisplayName } from "../contexts/AuthContext";
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  BarChart3,
  Building2,
  Database,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquare,
} from "lucide-react";
import { DashboardHeader } from "../components/dashboard/DashboardHeader";
import { DataCard } from "../components/dashboard/DataCard";
import { SSOTile } from "../components/dashboard/SSOTile";
import { TransactionTable, Transaction } from "../components/dashboard/TransactionTable";
import { AlertBanner } from "../components/dashboard/AlertBanner";
import { StatusBadge } from "../components/dashboard/StatusBadge";
import { DashboardModal } from "../components/dashboard/DashboardModal";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";

const offices = [
  { id: "all", name: "All Offices" },
  { id: "downtown", name: "Downtown Office" },
  { id: "northside", name: "Northside Office" },
  { id: "westend", name: "West End Office" },
];

const sampleTransactions: Transaction[] = [
  {
    id: "1",
    address: "123 Oak Street, Chicago, IL",
    agent: "Sarah Johnson",
    type: "Sale",
    status: "error",
    statusLabel: "Missing Docs",
    amount: "$485,000",
    closingDate: "2026-03-15",
    missingDocs: 3,
  },
  {
    id: "2",
    address: "456 Maple Ave, Chicago, IL",
    agent: "Michael Chen",
    type: "Purchase",
    status: "warning",
    statusLabel: "Under Review",
    amount: "$625,000",
    closingDate: "2026-03-20",
    documents: 8,
  },
  {
    id: "3",
    address: "789 Pine Road, Evanston, IL",
    agent: "Emily Rodriguez",
    type: "Sale",
    status: "success",
    statusLabel: "Complete",
    amount: "$750,000",
    closingDate: "2026-03-10",
    documents: 12,
  },
  {
    id: "4",
    address: "321 Birch Lane, Oak Park, IL",
    agent: "David Kim",
    type: "Lease",
    status: "pending",
    statusLabel: "Pending",
    amount: "$3,200/mo",
    closingDate: "2026-03-08",
    missingDocs: 1,
  },
  {
    id: "5",
    address: "654 Cedar Court, Naperville, IL",
    agent: "Jessica Martinez",
    type: "Sale",
    status: "error",
    statusLabel: "Rejected",
    amount: "$890,000",
    closingDate: "2026-03-25",
    missingDocs: 5,
  },
];

const agentActivity = [
  { name: "Sarah Johnson", tasks: 8, leads: 12, lastContact: "2 hours ago" },
  { name: "Michael Chen", tasks: 5, leads: 8, lastContact: "4 hours ago" },
  { name: "Emily Rodriguez", tasks: 3, leads: 15, lastContact: "1 hour ago" },
  { name: "David Kim", tasks: 12, leads: 6, lastContact: "30 min ago" },
  { name: "Jessica Martinez", tasks: 6, leads: 9, lastContact: "3 hours ago" },
];

export function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedOffice, setSelectedOffice] = useState("all");
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const displayName = getUserDisplayName(user);

  const handleSSOClick = (platform: string) => {
    console.log(`Opening ${platform}...`);
    // In a real app, this would handle SSO authentication
  };

  const handleViewFullDetails = () => {
    if (selectedTransaction) {
      const transactionId = `TXN-240${selectedTransaction.id}`;
      setSelectedTransaction(null);
      navigate(`/transactions/${transactionId}`);
    }
  };

  const handleRowClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
  };

  const handleRowDoubleClick = (transaction: Transaction) => {
    const transactionId = `TXN-240${transaction.id}`;
    navigate(`/transactions/${transactionId}`);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <DashboardHeader
        offices={offices}
        selectedOffice={selectedOffice}
        onOfficeChange={setSelectedOffice}
        userName={displayName}
        userEmail={user?.email ?? undefined}
        notificationCount={3}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Page Header */}
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">
              Dashboard Overview
            </h1>
            <p className="text-slate-600 mt-1">
              Welcome back, {displayName || "there"}. Here's what's happening today.
            </p>
          </div>

          {/* Needs Attention Alert */}
          <AlertBanner
            type="warning"
            title="Action Required"
            message="You have 8 transactions with missing or rejected documents that need immediate attention."
          />

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <DataCard
              title="Active Transactions"
              value="47"
              icon={FileText}
              trend={{ value: "12% from last month", isPositive: true }}
            />
            <DataCard
              title="Active Agents"
              value="23"
              icon={Users}
              subtitle="Across 3 offices"
            />
            <DataCard
              title="Pending Tasks"
              value="34"
              icon={Clock}
              trend={{ value: "8 overdue", isPositive: false }}
            />
            <DataCard
              title="Total Volume"
              value="$12.4M"
              icon={DollarSign}
              trend={{ value: "18% from last month", isPositive: true }}
            />
          </div>

          {/* Platform SSO Tiles */}
          <div>
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              Quick Access
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SSOTile
                title="CRM Platform"
                description="Manage contacts, leads, and customer relationships"
                icon={Database}
                iconColor="bg-blue-600"
                onClick={() => handleSSOClick("CRM")}
              />
              <SSOTile
                title="Transaction Management"
                description="Track and manage real estate transactions"
                icon={FileText}
                iconColor="bg-emerald-600"
                onClick={() => handleSSOClick("Transaction")}
              />
              <SSOTile
                title="Accounting"
                description="Financial reports, invoicing, and payments"
                icon={DollarSign}
                iconColor="bg-violet-600"
                onClick={() => handleSSOClick("Accounting")}
              />
            </div>
          </div>

          {/* Compliance Overview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Compliance Overview</CardTitle>
                  <p className="text-sm text-slate-600 mt-1">
                    Transactions requiring document attention
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-slate-600">Missing (4)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-slate-600">Rejected (4)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-slate-600">Complete (39)</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <TransactionTable
                transactions={sampleTransactions}
                onRowClick={handleRowClick}
                onRowDoubleClick={handleRowDoubleClick}
              />
            </CardContent>
          </Card>

          {/* Agent Activity Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Agent Activity</CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  Recent activity across your team
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {agentActivity.map((agent, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between pb-4 border-b last:border-0 last:pb-0"
                    >
                      <div>
                        <div className="font-medium text-slate-900">
                          {agent.name}
                        </div>
                        <div className="text-sm text-slate-600 mt-1">
                          <MessageSquare className="inline h-3 w-3 mr-1" />
                          Last contact: {agent.lastContact}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-center">
                          <div className="font-semibold text-slate-900">
                            {agent.tasks}
                          </div>
                          <div className="text-slate-500">Tasks</div>
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-slate-900">
                            {agent.leads}
                          </div>
                          <div className="text-slate-500">Leads</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Needs Attention</CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  Items requiring immediate action
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">
                        8 Transactions Missing Documents
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        Critical documents needed before closing dates
                      </div>
                      <Button size="sm" variant="outline" className="mt-2">
                        Review Now
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <Clock className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">
                        12 Overdue Agent Tasks
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        Tasks past their due date across 5 agents
                      </div>
                      <Button size="sm" variant="outline" className="mt-2">
                        View Tasks
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">
                        3 Transactions Closing This Week
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        Final reviews and preparations needed
                      </div>
                      <Button size="sm" variant="outline" className="mt-2">
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <DashboardModal
          open={!!selectedTransaction}
          onOpenChange={() => setSelectedTransaction(null)}
          title="Transaction Details"
          description={selectedTransaction.address}
          size="lg"
        >
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-slate-600">Agent</div>
                <div className="font-medium mt-1">{selectedTransaction.agent}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Type</div>
                <div className="font-medium mt-1">{selectedTransaction.type}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Amount</div>
                <div className="font-medium mt-1">{selectedTransaction.amount}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Closing Date</div>
                <div className="font-medium mt-1">
                  {selectedTransaction.closingDate}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Status</div>
                <div className="mt-1">
                  <StatusBadge
                    status={selectedTransaction.status}
                    label={selectedTransaction.statusLabel}
                  />
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Documents</div>
                <div className="font-medium mt-1">
                  {selectedTransaction.missingDocs
                    ? `${selectedTransaction.missingDocs} missing`
                    : `${selectedTransaction.documents} complete`}
                </div>
              </div>
            </div>

            {selectedTransaction.missingDocs && (
              <AlertBanner
                type="error"
                title="Missing Documents"
                message={`This transaction is missing ${selectedTransaction.missingDocs} required documents. Please upload them as soon as possible.`}
              />
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedTransaction(null)}>
                Close
              </Button>
              <Button onClick={handleViewFullDetails}>View Full Details</Button>
            </div>
          </div>
        </DashboardModal>
      )}
    </div>
  );
}