import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from "lucide-react";
import {
  ClientPortfolioRow,
  getCommissionBreakdownForRow,
  listClientPortfolio,
  summarizeClientPortfolio,
} from "../../services/clientPortfolio";
import {
  DEFAULT_PERSONAL_GCI_GOAL,
  getCurrentUserProfileSnapshot,
  getUserProfileRoleKey,
  resolvePersonalGciGoalAmount,
} from "../../services/auth";
import { useAuth } from "../contexts/AuthContext";

function formatCurrency(value: number | null | undefined) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function currentYear() {
  return new Date().getFullYear();
}

/**
 * Sort keys for the Portfolio Records table. Only fields that have an
 * unambiguous natural order are sortable — commission/closed-price stay fixed
 * to the default closed-first ordering so brokers don't accidentally hide
 * realized rows behind giant pipeline numbers.
 */
type PortfolioSortKey = "client" | "address" | "type" | "agent" | "closeDate";

type PortfolioSortState = {
  key: PortfolioSortKey;
  direction: "asc" | "desc";
} | null;

const PORTFOLIO_SORT_LABELS: Record<PortfolioSortKey, string> = {
  client: "Client",
  address: "Address",
  type: "Type",
  agent: "Agent",
  closeDate: "Close Date",
};

/** Comparator value for a sortable column. Numeric for dates, lowercase strings otherwise. */
function portfolioSortValue(
  row: ClientPortfolioRow,
  key: PortfolioSortKey,
): string | number {
  switch (key) {
    case "client":
      return (row.client_name ?? "").trim().toLowerCase();
    case "address":
      return (row.property_address_primary ?? "").trim().toLowerCase();
    case "type":
      return (row.transaction_type ?? "").trim().toLowerCase();
    case "agent":
      return (row.agent_name ?? "").trim().toLowerCase();
    case "closeDate": {
      const raw = row.event_date;
      if (!raw) return 0;
      const t = new Date(raw).getTime();
      return Number.isFinite(t) ? t : 0;
    }
  }
}

function comparePortfolioRows(
  a: ClientPortfolioRow,
  b: ClientPortfolioRow,
  key: PortfolioSortKey,
  direction: "asc" | "desc",
): number {
  const va = portfolioSortValue(a, key);
  const vb = portfolioSortValue(b, key);
  if (va < vb) return direction === "asc" ? -1 : 1;
  if (va > vb) return direction === "asc" ? 1 : -1;
  return 0;
}

/**
 * Header cell with a 3-state sort cycle: inactive → ascending → descending →
 * inactive (clears back to default closed-first ordering). The indicator is
 * intentionally subtle (matches the slate-600 thead text) so it doesn't draw
 * attention away from the numbers.
 */
function SortableHeader({
  label,
  sortKey,
  currentSort,
  onClick,
}: {
  label: string;
  sortKey: PortfolioSortKey;
  currentSort: PortfolioSortState;
  onClick: (key: PortfolioSortKey) => void;
}) {
  const active = currentSort?.key === sortKey;
  const direction = active ? currentSort?.direction ?? null : null;
  const ariaSort = active
    ? direction === "asc"
      ? "ascending"
      : "descending"
    : "none";
  return (
    <th scope="col" className="px-5 py-3 font-medium" aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className="inline-flex items-center gap-1 rounded-sm text-slate-600 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
      >
        <span>{label}</span>
        {direction === "asc" ? (
          <ChevronUp className="h-3.5 w-3.5 text-slate-700" aria-hidden strokeWidth={2} />
        ) : direction === "desc" ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-700" aria-hidden strokeWidth={2} />
        ) : (
          <ChevronsUpDown
            className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-400"
            aria-hidden
            strokeWidth={2}
          />
        )}
      </button>
    </th>
  );
}

export function Analytics() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<ClientPortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedYear, setSelectedYear] = useState<number>(currentYear());
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");

  const [gciGoal, setGciGoal] = useState<number>(DEFAULT_PERSONAL_GCI_GOAL);
  /** Profile role key — drives whether broker/admin sees office net rows in addition to agent payout. */
  const [viewerRoleKey, setViewerRoleKey] = useState<
    "admin" | "agent" | "broker" | "btq_admin" | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void getUserProfileRoleKey().then((key) => {
      if (!cancelled) setViewerRoleKey(key);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** v1 commission split: agent views emphasize their net commission; broker/admin views see office net too. */
  const isAgentView = viewerRoleKey === "agent";

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    getCurrentUserProfileSnapshot()
      .then((p) => {
        if (cancelled) return;
        setGciGoal(resolvePersonalGciGoalAmount(p?.personal_gci_goal));
      })
      .catch(() => {
        if (!cancelled) setGciGoal(DEFAULT_PERSONAL_GCI_GOAL);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const data = await listClientPortfolio({
          year: selectedYear,
          agentId: selectedAgentId || undefined,
          transactionType: selectedType || undefined,
        });

        if (!isMounted) return;
        setRows(data);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Failed to load analytics.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [selectedYear, selectedAgentId, selectedType]);

  /**
   * Portfolio Records table — light client-side controls. The KPI cards above
   * always reflect the full filtered dataset (`rows`); only the table itself
   * narrows down by `searchQuery` so brokers don't lose context on their
   * actual totals while triaging a long list.
   */
  const [searchQuery, setSearchQuery] = useState("");
  const [portfolioSort, setPortfolioSort] = useState<PortfolioSortState>(null);

  const summary = useMemo(() => summarizeClientPortfolio(rows), [rows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q === "") return rows;
    return rows.filter((row) => {
      const haystack = [
        row.client_name,
        row.property_address_primary,
        row.transaction_type,
        row.agent_name,
      ];
      return haystack.some(
        (value) => (value ?? "").toLowerCase().includes(q),
      );
    });
  }, [rows, searchQuery]);

  /**
   * Section buckets reflect the *filtered* rows so the Closed/Pipeline count
   * pills always match the table body. Default render order (no active sort)
   * keeps closed/finalized production at the top, with workflow-closed rows
   * floating above pure pipeline so brokers see "almost there" deals first.
   */
  const tableSections = useMemo(() => {
    const finalized: ClientPortfolioRow[] = [];
    const needsFinal: ClientPortfolioRow[] = [];
    const pipeline: ClientPortfolioRow[] = [];
    for (const row of filteredRows) {
      if (row.portfolio_stage === "final") finalized.push(row);
      else if (row.workflowClosed === true) needsFinal.push(row);
      else pipeline.push(row);
    }
    return { finalized, needsFinal, pipeline };
  }, [filteredRows]);

  const sortedRowsForRender = useMemo(() => {
    if (portfolioSort == null) {
      // Default ordering = same group sequence as before any column sort: closed
      // first, then workflow-closed-but-not-finalized, then pure pipeline.
      return [
        ...tableSections.finalized,
        ...tableSections.needsFinal,
        ...tableSections.pipeline,
      ];
    }
    return [...filteredRows].sort((a, b) =>
      comparePortfolioRows(a, b, portfolioSort.key, portfolioSort.direction),
    );
  }, [portfolioSort, filteredRows, tableSections]);

  /** Cycle a header: inactive → asc → desc → inactive (back to default order). */
  function handlePortfolioSortClick(key: PortfolioSortKey) {
    setPortfolioSort((prev) => {
      if (prev?.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  }

  const progressPercent =
    gciGoal > 0
      ? Math.min((summary.totalGciActual / gciGoal) * 100, 100)
      : 0;

  const agentOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row) => {
      if (row.agent_id && row.agent_name) {
        map.set(row.agent_id, row.agent_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const typeOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => row.transaction_type)
          .filter((value): value is string => !!value),
      ),
    ).sort();
  }, [rows]);

  /**
   * Reporting-only row action. Closed/finalized rows are read-only (analytics
   * is settled); non-finalized workflow-closed rows expose a Finalize link so
   * brokers can lock them into reported production without leaving this page.
   * Pure pipeline rows have no action — they need workflow progress first.
   */
  function renderRowAction(row: ClientPortfolioRow) {
    if (row.portfolio_stage === "final") return null;
    if (row.workflowClosed !== true) return null;
    const tid = row.transaction_id?.trim();
    if (!tid) return null;
    return (
      <button
        type="button"
        className="text-sm font-medium text-slate-900 underline-offset-2 hover:text-slate-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 rounded-sm"
        title="Finalize to include in closed production"
        onClick={() =>
          navigate(`/transactions/${encodeURIComponent(tid)}?finalize=1`)
        }
      >
        Finalize
      </button>
    );
  }

  /**
   * One row per portfolio record. Reporting-only cleanup:
   *   - Closed rows are tinted soft amber so realized production is the visual
   *     focus of the page; pipeline/open rows stay white and visually quieter.
   *   - Commission cell drops the Gross line — brokers see Agent + Office, and
   *     agents see only "You" (current product rule keeps agents focused on
   *     their net here; transparency happens on Edit Transaction Details).
   *   - Closed Price comes from the existing portfolio snapshot (no new math).
   */
  const renderRow = (row: ClientPortfolioRow) => {
    const breakdown = getCommissionBreakdownForRow(row);
    const isClosed = row.portfolio_stage === "final";
    return (
      <tr
        key={row.id}
        className={isClosed ? "border-t bg-amber-50/60" : "border-t"}
      >
        <td className="px-5 py-4 text-slate-900">{row.client_name || "—"}</td>
        <td className="px-5 py-4 text-slate-700">
          {row.property_address_primary || "—"}
        </td>
        <td className="px-5 py-4 text-slate-700">{row.transaction_type || "—"}</td>
        <td className="px-5 py-4 text-slate-700">{row.agent_name || "—"}</td>
        <td className="px-5 py-4 text-slate-700">{formatDate(row.event_date)}</td>
        <td className="px-5 py-4 text-slate-900 tabular-nums">
          {formatCurrency(row.close_price)}
        </td>
        <td className="px-5 py-4 text-slate-700">
          <div className="flex flex-col gap-0.5 tabular-nums leading-tight">
            <div>
              <span className="text-xs text-slate-500">
                {isAgentView ? "You: " : "Agent: "}
              </span>
              <span className="text-slate-700">
                {formatCurrency(breakdown.agentNet)}
              </span>
            </div>
            {!isAgentView ? (
              <div>
                <span className="text-xs text-slate-500">Office: </span>
                <span className="text-slate-700">
                  {formatCurrency(breakdown.officeNet)}
                </span>
              </div>
            ) : null}
          </div>
        </td>
        <td className="px-5 py-4 text-right">{renderRowAction(row)}</td>
      </tr>
    );
  };

  return (
    <div className="p-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Production Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Production reporting and transaction performance across your office.
        </p>
      </div>

      <div className="-mx-6 mt-4 border-b border-slate-200 bg-slate-50 px-6 py-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
          <label className="space-y-1.5">
            <span className="text-sm text-slate-500">Year</span>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {[currentYear(), currentYear() - 1, currentYear() - 2].map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm text-slate-500">Agent</span>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
            >
              <option value="">All agents</option>
              {agentOptions.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm text-slate-500">Transaction Type</span>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="">All types</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Full-width goal panel — primary focal point below filters */}
      <div className="-mx-6 mt-8 border-b border-slate-200 bg-white px-6 py-6 md:py-7">
        <div className="flex w-full flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm text-slate-500">Gross Commission Goal</div>
            <div className="mt-1.5 text-4xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {formatCurrency(gciGoal)}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-sm text-slate-500">Progress</div>
            <div className="mt-1.5 text-4xl font-semibold text-slate-900 tabular-nums">
              {progressPercent.toFixed(0)}%
            </div>
          </div>
        </div>

        <div className="mt-5 w-full">
          <div className="h-5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-900 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          Gross Commission (closed):{" "}
          <span className="font-semibold text-slate-900 tabular-nums">
            {formatCurrency(summary.grossCommissionActual)}
          </span>
        </p>
      </div>

      {/*
        Closed/finalized actuals only — labels stay short ("Closed" is implicit
        for this row of cards). Agent views replace "Agent Payout" with "Your
        Net Commission" and drop the office card; office numbers still appear
        in the Pipeline Forecast section below.
      */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Gross Commission</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">
              {formatCurrency(summary.grossCommissionActual)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">
              {isAgentView ? "Your Net Commission" : "Agent Payout"}
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">
              {formatCurrency(summary.agentPayoutActual)}
            </div>
          </div>

          {!isAgentView ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm text-slate-500">Office Net Commission</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">
                {formatCurrency(summary.officeNetActual)}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Total Volume</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">
              {formatCurrency(summary.totalVolumeActual)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Closings</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">
              {summary.closingsCount}
            </div>
          </div>
      </div>

      {/*
        Pipeline Forecast — single yellow section replacing the previous row of
        per-metric pipeline cards. Same numbers from summarize(); no math
        changes. Title is enough — no helper subline.
      */}
      <section
        aria-label="Pipeline Forecast"
        className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 shadow-sm"
      >
        <h3 className="text-base font-semibold text-slate-900">Pipeline Forecast</h3>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <div>
            <div className="text-xs text-slate-500">Gross Commission</div>
            <div className="mt-0.5 text-xl font-semibold text-slate-900 tabular-nums">
              {formatCurrency(summary.grossCommissionPipeline)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">
              {isAgentView ? "Your Net Commission" : "Agent Payout"}
            </div>
            <div className="mt-0.5 text-xl font-semibold text-slate-900 tabular-nums">
              {formatCurrency(summary.agentPayoutPipeline)}
            </div>
          </div>
          {!isAgentView ? (
            <div>
              <div className="text-xs text-slate-500">Office Net Commission</div>
              <div className="mt-0.5 text-xl font-semibold text-slate-900 tabular-nums">
                {formatCurrency(summary.officeNetPipeline)}
              </div>
            </div>
          ) : null}
          <div>
            <div className="text-xs text-slate-500">Pipeline Volume</div>
            <div className="mt-0.5 text-xl font-semibold text-slate-900 tabular-nums">
              {formatCurrency(summary.potentialVolume)}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-10 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Portfolio Records</h2>
            <p className="mt-1 text-sm text-slate-500">
              Closed production is highlighted; pipeline rows stay quieter.
            </p>
          </div>
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Search portfolio records</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
              strokeWidth={1.75}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search portfolio records…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-400"
              aria-label="Search portfolio records by client, address, type, or agent"
            />
          </label>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading portfolio...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No records found for this filter set.</div>
        ) : (
          <>
            {/*
              Counts reflect the filtered dataset so the pill counts always
              match what's rendered in the table body below. The KPI cards
              above intentionally keep using the unfiltered totals.
            */}
            <div
              className="flex border-b border-slate-200 bg-slate-50"
              aria-label={`Row counts by group: ${tableSections.finalized.length} closed, ${tableSections.needsFinal.length + tableSections.pipeline.length} pipeline`}
            >
              {(
                [
                  ["Closed", tableSections.finalized.length],
                  [
                    "Pipeline",
                    tableSections.needsFinal.length + tableSections.pipeline.length,
                  ],
                ] as const
              ).map(([label, count], i) => (
                <div
                  key={label}
                  className={`min-w-0 flex-1 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 sm:px-4 ${
                    i < 1 ? "border-r border-slate-200" : ""
                  }`}
                >
                  {label}{" "}
                  <span className="font-medium text-slate-500">({count})</span>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <SortableHeader
                      label={PORTFOLIO_SORT_LABELS.client}
                      sortKey="client"
                      currentSort={portfolioSort}
                      onClick={handlePortfolioSortClick}
                    />
                    <SortableHeader
                      label={PORTFOLIO_SORT_LABELS.address}
                      sortKey="address"
                      currentSort={portfolioSort}
                      onClick={handlePortfolioSortClick}
                    />
                    <SortableHeader
                      label={PORTFOLIO_SORT_LABELS.type}
                      sortKey="type"
                      currentSort={portfolioSort}
                      onClick={handlePortfolioSortClick}
                    />
                    <SortableHeader
                      label={PORTFOLIO_SORT_LABELS.agent}
                      sortKey="agent"
                      currentSort={portfolioSort}
                      onClick={handlePortfolioSortClick}
                    />
                    <SortableHeader
                      label={PORTFOLIO_SORT_LABELS.closeDate}
                      sortKey="closeDate"
                      currentSort={portfolioSort}
                      onClick={handlePortfolioSortClick}
                    />
                    <th scope="col" className="px-5 py-3 font-medium">
                      Sale Price
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Commission
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRowsForRender.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-5 py-8 text-center text-sm text-slate-500"
                      >
                        No records match “{searchQuery.trim()}”.
                      </td>
                    </tr>
                  ) : (
                    sortedRowsForRender.map((row) => renderRow(row))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
