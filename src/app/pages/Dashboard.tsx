import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getUserDisplayName } from "../contexts/AuthContext";
import {
  getUserProfileRoleKey,
  getAccountInfoReadonly,
  type AccountInfoReadonly,
} from "../../services/auth";
import {
  fetchComplianceOverviewData,
  type ComplianceOverviewData,
} from "../../services/transactions";
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
  Clock,
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

function formatUsdCompact(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

const offices = [
  { id: "all", name: "All Offices" },
  { id: "downtown", name: "Downtown Office" },
  { id: "northside", name: "Northside Office" },
  { id: "westend", name: "West End Office" },
];

export function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedOffice, setSelectedOffice] = useState("all");
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [complianceOverview, setComplianceOverview] = useState<ComplianceOverviewData | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(true);
  const [profileRoleKey, setProfileRoleKey] = useState<
    "admin" | "agent" | "broker" | null | undefined
  >(undefined);
  const [accountInfo, setAccountInfo] = useState<AccountInfoReadonly | null | undefined>(
    undefined
  );

  const displayName =
    accountInfo?.display_name?.trim() ||
    getUserDisplayName(user) ||
    "there";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setComplianceLoading(true);
      const [data, roleKey, accountRow] = await Promise.all([
        fetchComplianceOverviewData(),
        getUserProfileRoleKey(),
        getAccountInfoReadonly(),
      ]);
      if (!cancelled) {
        setComplianceOverview(data ?? null);
        setProfileRoleKey(roleKey);
        setAccountInfo(accountRow);
        setComplianceLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const isBroker = profileRoleKey === "broker";

  const handleSSOClick = (platform: string) => {
    console.log(`Opening ${platform}...`);
    // In a real app, this would handle SSO authentication
  };

  const handleViewFullDetails = () => {
    if (selectedTransaction) {
      const transactionId = selectedTransaction.id;
      setSelectedTransaction(null);
      navigate(`/transactions/${transactionId}`);
    }
  };

  const handleRowClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
  };

  const handleRowDoubleClick = (transaction: Transaction) => {
    navigate(`/transactions/${transaction.id}`);
  };

  let actionRequiredBanner: {
    type: "info" | "warning" | "success";
    title: string;
    message: string;
  };
  if (complianceLoading) {
    actionRequiredBanner = {
      type: "info",
      title: "Checking compliance",
      message: "Loading compliance status for your dashboard…",
    };
  } else if (!complianceOverview) {
    actionRequiredBanner = {
      type: "info",
      title: "Compliance status unavailable",
      message: "We couldn’t load compliance data. Refresh the page or try again shortly.",
    };
  } else {
    const n = complianceOverview.tableRows.length;
    if (n > 0) {
      const label = n === 1 ? "transaction" : "transactions";
      actionRequiredBanner = {
        type: "warning",
        title: "Action required",
        message: isBroker
          ? `Portfolio-wide: ${n} ${label} with compliance items that need attention. Review the Compliance Overview below.`
          : `You have ${n} ${label} with compliance items that need attention. Review the Compliance Overview below.`,
      };
    } else {
      actionRequiredBanner = {
        type: "success",
        title: "Compliance up to date",
        message: isBroker
          ? "No portfolio-wide compliance blockers are showing right now."
          : "No transactions in your current scope require compliance attention right now.",
      };
    }
  }

  const kpiLoading = complianceLoading;
  const kpis = complianceOverview?.kpis;
  const kpiPlaceholder = "—";
  const activeTxValue = kpiLoading ? kpiPlaceholder : kpis ? String(kpis.activeTransactionCount) : kpiPlaceholder;
  const activeAgentsValue = kpiLoading ? kpiPlaceholder : kpis ? String(kpis.distinctAgentsOnActiveDeals) : kpiPlaceholder;
  const complianceQueueValue = kpiLoading ? kpiPlaceholder : kpis ? String(kpis.complianceDocsPendingReviewCount) : kpiPlaceholder;
  const volumeValue =
    kpiLoading || !kpis
      ? kpiPlaceholder
      : kpis.activeTransactionCount === 0
        ? kpiPlaceholder
        : kpis.activePipelineSalePriceSum > 0
          ? formatUsdCompact(kpis.activePipelineSalePriceSum)
          : kpiPlaceholder;
  const agentsOfficesSubtitle =
    kpiLoading || !kpis
      ? undefined
      : kpis.distinctOfficesOnActiveDeals > 0
        ? `Across ${kpis.distinctOfficesOnActiveDeals} office${kpis.distinctOfficesOnActiveDeals === 1 ? "" : "es"}`
        : undefined;

  const brokerSnapshot =
    isBroker && complianceOverview && kpis
      ? (() => {
          const leg = complianceOverview.legend;
          const total =
            leg.rejected + leg.missing + leg.pendingReview + leg.complete;
          const attention = leg.rejected + leg.missing + leg.pendingReview;
          return {
            total,
            attention,
            attentionPct:
              total > 0 ? Math.round((attention / total) * 100) : 0,
            queueDocs: kpis.complianceDocsPendingReviewCount,
          };
        })()
      : null;

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
              {isBroker ? "Broker oversight" : "Dashboard Overview"}
            </h1>
            <p className="text-slate-600 mt-1">
            Welcome back, {displayName}! Here's what's happening today.
</p>
          </div>

          {/* Broker-only: real rollup from same compliance payload as KPIs / overview */}
          {isBroker && (
            <Card className="border-l-4 border-indigo-600 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Portfolio snapshot</CardTitle>
                <p className="text-sm text-slate-600 font-normal">
                </p>
              </CardHeader>
              <CardContent className="text-sm text-slate-700 space-y-2">
                {complianceLoading ? (
                  <p className="text-slate-600">Loading portfolio snapshot…</p>
                ) : !complianceOverview || !brokerSnapshot ? (
                  <p className="text-slate-600">Snapshot unavailable. Refresh to try again.</p>
                ) : (
                  <>
                    <p>
                      <span className="font-semibold text-slate-900">
                        {brokerSnapshot.attention}
                      </span>{" "}
                      of{" "}
                      <span className="font-semibold text-slate-900">
                        {brokerSnapshot.total}
                      </span>{" "}
                      deals in scope have a non-complete compliance posture (
                      {brokerSnapshot.attentionPct}%).
                    </p>
                    <p>
                      Compliance document queue:{" "}
                      <span className="font-semibold text-slate-900">
                        {brokerSnapshot.queueDocs}
                      </span>{" "}
                      required checklist item(s) awaiting review (submitted, pending compliance
                      review).
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Action required (scoped compliance — same payload as Compliance Overview) */}
          <AlertBanner
            type={actionRequiredBanner.type}
            title={actionRequiredBanner.title}
            message={actionRequiredBanner.message}
          />

          {/* Key Metrics — same scope as Compliance Overview (`fetchComplianceOverviewData` kpis) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <DataCard title="Active Transactions" value={activeTxValue} icon={FileText} />
            <DataCard
              title="Active Agents"
              value={activeAgentsValue}
              icon={Users}
              subtitle={agentsOfficesSubtitle}
            />
            <DataCard
              title="Compliance Queue"
              value={complianceQueueValue}
              icon={Clock}
              subtitle="Required checklist documents submitted and awaiting compliance review"
            />
            <DataCard
              title="Total Volume"
              value={volumeValue}
              icon={DollarSign}
              subtitle="Sale price on pipeline deals"
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
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-600" />
                    <span className="text-slate-600">
                      Rejected (
                      {complianceLoading ? "…" : complianceOverview?.legend.rejected ?? 0})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-slate-600">
                      Missing required (
                      {complianceLoading ? "…" : complianceOverview?.legend.missing ?? 0})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-slate-600">
                      Pending review (
                      {complianceLoading ? "…" : complianceOverview?.legend.pendingReview ?? 0})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-slate-600">
                      Complete (
                      {complianceLoading ? "…" : complianceOverview?.legend.complete ?? 0})
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {complianceLoading ? (
                <p className="text-sm text-slate-600 py-6">Loading compliance data…</p>
              ) : (
                <TransactionTable
                  transactions={complianceOverview?.tableRows ?? []}
                  onRowClick={handleRowClick}
                  onRowDoubleClick={handleRowDoubleClick}
                />
              )}
            </CardContent>
          </Card>

          {/* Agent Activity: only when user_profiles.role is broker (getUserProfileRoleKey); hidden for admin/agent */}
          <div
            className={`grid gap-6 ${isBroker ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}
          >
            {isBroker && (
              <Card>
                <CardContent className="py-6">
                  <p className="text-sm text-slate-600">
                    Agent Activity (Broker Insights) — coming soon
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Needs Attention</CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  Items requiring immediate action
                </p>
              </CardHeader>
              <CardContent>
                {complianceLoading ? (
                  <p className="text-sm text-slate-600 py-1">Loading alerts…</p>
                ) : !complianceOverview ? (
                  <p className="text-sm text-slate-600 py-1">
                    Compliance data could not be loaded. Refresh the page to try again.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900">
                          {complianceOverview.legend.rejected} Rejected Transactions
                        </div>
                        <div className="text-sm text-slate-600 mt-1">
                          Work with agents to fix or re-upload documents marked rejected on these
                          deals.
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => navigate("/transactions?filter=rejected")}
                        >
                          Open transactions
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <FileText className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900">
                          {complianceOverview.legend.missing} Transactions Missing Documents
                        </div>
                        <div className="text-sm text-slate-600 mt-1">
                          Required compliance documents still need to be attached or completed for
                          these transactions.
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => navigate("/transactions?filter=missing")}
                        >
                          Open transactions
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <Clock className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900">
                          {complianceOverview.legend.pendingReview} Awaiting Review
                        </div>
                        <div className="text-sm text-slate-600 mt-1">
                          Submitted documents are waiting on compliance review in these transactions.
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => navigate("/transactions?filter=pending_review")}
                        >
                          Open transactions
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
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

            {selectedTransaction.missingDocs != null && selectedTransaction.missingDocs > 0 && (
              <AlertBanner
                type={
                  selectedTransaction.statusLabel === "Rejected"
                    ? "error"
                    : selectedTransaction.statusLabel === "Pending review"
                      ? "info"
                      : "error"
                }
                title={
                  selectedTransaction.statusLabel === "Rejected"
                    ? "Rejected documents"
                    : selectedTransaction.statusLabel === "Pending review"
                      ? "Pending review"
                      : "Missing documents"
                }
                message={
                  selectedTransaction.statusLabel === "Rejected"
                    ? `${selectedTransaction.missingDocs} required document(s) are rejected and need to be addressed.`
                    : selectedTransaction.statusLabel === "Pending review"
                      ? `${selectedTransaction.missingDocs} required document(s) are awaiting compliance review.`
                      : `This transaction is missing ${selectedTransaction.missingDocs} required document(s). Please upload them as soon as possible.`
                }
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