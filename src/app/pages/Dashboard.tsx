import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  getUserProfileRoleKey,
  getAccountInfoReadonly,
  type AccountInfoReadonly,
} from "../../services/auth";
import { getCurrentOffice, listOfficesForBackOffice } from "../../services/offices";
import {
  fetchComplianceOverviewData,
  type ComplianceOverviewData,
} from "../../services/transactions";
import {
  readDashboardOfficeSelection,
  writeDashboardOfficeSelection,
} from "./dashboardOfficeStorage";
import type { DashboardOfficeOption } from "../components/dashboard/DashboardHeader";
import {
  Users,
  FileText,
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

/** Office switcher label: `offices.display_name` when set, else `offices.name` (see `getCurrentOffice` / list RPC). */
function officeSwitcherLabel(o: { display_name: string | null; name: string }): string {
  return o.display_name?.trim() || o.name;
}

async function loadDashboardOfficeOptions(): Promise<{
  options: DashboardOfficeOption[];
  roleKey: Awaited<ReturnType<typeof getUserProfileRoleKey>>;
}> {
  const roleKey = await getUserProfileRoleKey();
  if (roleKey === "btq_admin") {
    const { offices } = await listOfficesForBackOffice();
    const options = (offices ?? [])
      .map((o) => ({
        id: o.id,
        label: officeSwitcherLabel(o),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return { options, roleKey };
  }
  const o = await getCurrentOffice();
  if (!o) {
    return { options: [], roleKey };
  }
  return {
    options: [{ id: o.id, label: officeSwitcherLabel(o) }],
    roleKey,
  };
}

function pickInitialOfficeId(
  options: { id: string }[] | undefined,
  persisted: string | null,
): string | null {
  if (!options?.length) return null;
  if (persisted && options.some((o) => o.id === persisted)) return persisted;
  return options[0].id;
}

export function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [welcomeFromCheckout, setWelcomeFromCheckout] = useState(false);
  const { user } = useAuth();
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [complianceOverview, setComplianceOverview] = useState<ComplianceOverviewData | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(true);
  const [profileRoleKey, setProfileRoleKey] = useState<
    "admin" | "agent" | "broker" | "btq_admin" | null | undefined
  >(undefined);
  const [accountInfo, setAccountInfo] = useState<AccountInfoReadonly | null | undefined>(
    undefined
  );
  const [officeOptions, setOfficeOptions] = useState<DashboardOfficeOption[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null);
  const selectedOfficeIdRef = useRef<string | null>(null);
  selectedOfficeIdRef.current = selectedOfficeId;

  /**
   * Primary visible name (header + welcome): `user_profiles.display_name`, then `user_profiles.email`,
   * then Supabase session email (auth JWT only as last resort — not primary identity).
   */
  const displayName =
    accountInfo?.display_name?.trim() ||
    accountInfo?.email?.trim() ||
    user?.email?.trim() ||
    "there";

  /** Secondary line in header: prefer `user_profiles.email`, then session. */
  const headerEmail =
    accountInfo?.email?.trim() || user?.email || undefined;

  useEffect(() => {
    if (searchParams.get("welcome") !== "1") return;
    setWelcomeFromCheckout(true);
    const next = new URLSearchParams(searchParams);
    next.delete("welcome");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user?.id) {
        setComplianceLoading(false);
        setProfileRoleKey(undefined);
        return;
      }
      setComplianceLoading(true);
      try {
        const [accountRow, { options, roleKey }] = await Promise.all([
          getAccountInfoReadonly(),
          loadDashboardOfficeOptions(),
        ]);
        if (cancelled) return;
        const safeOptions = options ?? [];
        setOfficeOptions(safeOptions);
        setProfileRoleKey(roleKey);
        setAccountInfo(accountRow);
        const persisted = readDashboardOfficeSelection(user.id);
        const selected = pickInitialOfficeId(safeOptions, persisted);
        setSelectedOfficeId(selected);
        if (selected != null) {
          writeDashboardOfficeSelection(user.id, selected);
        }
        const data = await fetchComplianceOverviewData({ dashboardOfficeId: selected });
        if (cancelled) return;
        setComplianceOverview(data ?? null);
      } finally {
        if (!cancelled) setComplianceLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Refetch profile + office labels when the tab becomes visible so DB updates match the UI without a full reload.
  useEffect(() => {
    if (!user?.id) return;

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;

      void (async () => {
        try {
          const [accountRow, { options, roleKey }] = await Promise.all([
            getAccountInfoReadonly(),
            loadDashboardOfficeOptions(),
          ]);
          const safeOptions = options ?? [];
          setAccountInfo(accountRow);
          setOfficeOptions(safeOptions);
          setProfileRoleKey(roleKey);

          const prev = selectedOfficeIdRef.current;
          const resolved =
            prev && safeOptions.some((o) => o.id === prev)
              ? prev
              : pickInitialOfficeId(safeOptions, readDashboardOfficeSelection(user.id));
          if (resolved != null) {
            writeDashboardOfficeSelection(user.id, resolved);
          }
          setSelectedOfficeId(resolved);

          const data = await fetchComplianceOverviewData({ dashboardOfficeId: resolved });
          setComplianceOverview(data ?? null);
        } catch {
          /* ignore transient refresh errors */
        }
      })();
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [user?.id]);

  const handleDashboardOfficeChange = (officeId: string) => {
    if (!user?.id) return;
    setSelectedOfficeId(officeId);
    writeDashboardOfficeSelection(user.id, officeId);
    setComplianceLoading(true);
    void fetchComplianceOverviewData({ dashboardOfficeId: officeId }).then((data) => {
      setComplianceOverview(data ?? null);
      setComplianceLoading(false);
    });
  };

  const showWelcomeBanner =
    welcomeFromCheckout || searchParams.get("welcome") === "1";

  const isBroker = profileRoleKey === "broker";
  const profileTo = isBroker ? "/settings?tab=account" : "/settings";
  const settingsTo = "/settings";
  // One stable layout until compliance + profile load (same Promise.all); avoids broker chrome flashing as "agent" first.
  const dashboardDataReady = !complianceLoading;

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
    const n =
      complianceOverview.legend.rejected + complianceOverview.legend.pendingReview;
    if (n > 0) {
      actionRequiredBanner = {
        type: "warning",
        title: "Action required",
        message:
          n === 1
            ? "1 transaction needs attention. Review rejected or pending review items below."
            : `${n} transactions need attention. Review rejected or pending review items below.`,
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <DashboardHeader
        officeOptions={officeOptions}
        selectedOfficeId={selectedOfficeId}
        onOfficeChange={handleDashboardOfficeChange}
        officeLoading={complianceLoading}
        profileTo={profileTo}
        settingsTo={settingsTo}
        userName={displayName}
        userEmail={headerEmail}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-5">
          {showWelcomeBanner ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-emerald-950">Welcome to Brokerteq</h2>
              <p className="mt-1 text-sm text-emerald-900">Your account is active</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/settings">Complete setup</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/agents">Add your first agent</Link>
                </Button>
              </div>
            </div>
          ) : null}

          {/* Page Header */}
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">
              {!dashboardDataReady
                ? "Dashboard"
                : isBroker
                  ? "Broker oversight"
                  : "Dashboard Overview"}
            </h1>
            <p className="text-slate-600 mt-1">
            Welcome back, {displayName}! Here's what's happening today.
</p>
          </div>

          {/* Action required (scoped compliance — same payload as Compliance Overview) */}
          <AlertBanner
            type={actionRequiredBanner.type}
            title={actionRequiredBanner.title}
            message={actionRequiredBanner.message}
          />

          {/* Platform SSO Tiles */}
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SSOTile
                title="CRM Platform"
                description="Manage contacts, leads, and customer relationships"
                icon={Database}
                iconColor="bg-blue-600"
                onClick={() =>
                  window.open("https://lofty.com/", "_blank", "noopener,noreferrer")
                }
              />
              <SSOTile
                title="Transaction Management"
                description="Track and manage real estate transactions"
                icon={FileText}
                iconColor="bg-emerald-600"
              />
              <SSOTile
                title="Accounting"
                description="Financial reports, invoicing, and payments"
                icon={DollarSign}
                iconColor="bg-violet-600"
              />
            </div>
          </div>

          {/* Key Metrics — same scope as Compliance Overview (`fetchComplianceOverviewData` kpis) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
                      Pending Review (
                      {complianceLoading ? "…" : complianceOverview?.legend.pendingReview ?? 0})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-slate-400" />
                    <span className="text-slate-600">
                      No status (
                      {complianceLoading ? "…" : complianceOverview?.legend.noAction ?? 0})
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
                  onFinalizeClick={(tx) =>
                    navigate(`/transactions/${encodeURIComponent(tx.id)}?finalize=1`)
                  }
                />
              )}
            </CardContent>
          </Card>

          {/* Agent Activity: only when user_profiles.role is broker (getUserProfileRoleKey); hidden for admin/agent */}
          <div
            className={`grid gap-6 ${dashboardDataReady && isBroker ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}
          >
            {dashboardDataReady && isBroker && (
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
                      <Clock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
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
                  {selectedTransaction.statusLabel ? (
                    <StatusBadge
                      status={selectedTransaction.status}
                      label={selectedTransaction.statusLabel}
                    />
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Documents</div>
                <div className="font-medium mt-1">
                  {selectedTransaction.missingDocs
                    ? `${selectedTransaction.missingDocs} missing`
                    : `${selectedTransaction.documents ?? 0} accepted (required)`}
                </div>
              </div>
            </div>

            {selectedTransaction.statusLabel === "Rejected" && (
              <AlertBanner
                type="error"
                title="Rejected documents"
                message="At least one compliance document on this transaction is rejected. Open the transaction to fix or re-upload."
              />
            )}

            {selectedTransaction.statusLabel === "Pending Review" && (
              <AlertBanner
                type="warning"
                title="Pending review"
                message="At least one compliance document on this transaction is awaiting review."
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