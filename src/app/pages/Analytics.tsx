import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import {
  ClientPortfolioRow,
  listClientPortfolio,
  summarizeClientPortfolio,
} from "../../services/clientPortfolio";

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

function gciDisplayClass(row: ClientPortfolioRow) {
  const finalized = row.portfolio_stage === "final";
  const gci = Number(row.revenue_amount) || 0;
  if (finalized && gci === 0) {
    return "font-medium text-amber-900 bg-amber-50";
  }
  return "text-slate-900";
}

export function Analytics() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ClientPortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedYear, setSelectedYear] = useState<number>(currentYear());
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");

  // Hardcode for now until goal table is wired
  const [gciGoal] = useState<number>(3000000);

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

  const summary = useMemo(() => summarizeClientPortfolio(rows), [rows]);

  const tableSections = useMemo(() => {
    const finalized: ClientPortfolioRow[] = [];
    const needsFinal: ClientPortfolioRow[] = [];
    const pipeline: ClientPortfolioRow[] = [];
    for (const row of rows) {
      if (row.portfolio_stage === "final") finalized.push(row);
      else if (row.workflowClosed === true) needsFinal.push(row);
      else pipeline.push(row);
    }
    return { finalized, needsFinal, pipeline };
  }, [rows]);

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

  function renderRealizedCell(row: ClientPortfolioRow) {
    const tid = row.transaction_id?.trim();

    if (row.portfolio_stage === "final") {
      return (
        <span
          className="inline-flex items-center justify-center"
          title="Realized — included in analytics"
        >
          <Lock
            className="h-4 w-4 shrink-0 text-slate-400"
            strokeWidth={1.75}
            aria-label="Realized — included in analytics"
          />
        </span>
      );
    }

    if (row.workflowClosed === true) {
      return (
        <button
          type="button"
          className="text-sm font-medium text-slate-900 underline-offset-2 hover:text-slate-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 rounded-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
          title="Potential — finalize to include in analytics"
          aria-label="Potential — finalize to include in analytics"
          disabled={!tid}
          onClick={() => {
            if (!tid) return;
            navigate(`/transactions/${encodeURIComponent(tid)}?finalize=1`);
          }}
        >
          Finalize
        </button>
      );
    }

    return <span className="text-slate-400">—</span>;
  }

  const renderRow = (row: ClientPortfolioRow, highlight: "none" | "needs-final") => (
    <tr
      key={row.id}
      className={
        highlight === "needs-final"
          ? "border-t bg-amber-50/80"
          : "border-t"
      }
    >
      <td className="px-5 py-4 text-slate-900">{row.client_name || "—"}</td>
      <td className="px-5 py-4 text-slate-700">
        {row.property_address_primary || "—"}
      </td>
      <td className="px-5 py-4 text-slate-700">{row.transaction_type || "—"}</td>
      <td className="px-5 py-4 text-slate-700">{row.agent_name || "—"}</td>
      <td className="px-5 py-4 text-slate-700">{formatDate(row.event_date)}</td>
      <td className={`px-5 py-4 ${gciDisplayClass(row)}`}>
        {formatCurrency(row.revenue_amount)}
      </td>
      <td className="px-5 py-4 text-slate-700">{renderRealizedCell(row)}</td>
    </tr>
  );

  return (
    <div className="p-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Client Portfolio</h1>
        <p className="mt-1 text-sm text-slate-500">
          Production ledger and client portfolio for real business activity.
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
            <div className="text-sm text-slate-500">GCI Goal</div>
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
          Actual GCI (finalized):{" "}
          <span className="font-semibold text-slate-900 tabular-nums">
            {formatCurrency(summary.totalGciActual)}
          </span>
        </p>
      </div>

      {/* KPI row — below goal */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">GCI (Closed)</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">
              {formatCurrency(summary.totalGciActual)}
            </div>
            <p className="mt-1 text-xs text-slate-400">Finalized portfolio only</p>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 shadow-sm">
            <div className="text-sm text-slate-500">GCI (Pipeline)</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">
              {formatCurrency(summary.potentialGci)}
            </div>
            <p className="mt-1 text-xs text-slate-400">Non-finalized revenue</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Total Volume (Actual)</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">
              {formatCurrency(summary.totalVolumeActual)}
            </div>
            <p className="mt-1 text-xs text-slate-400">Close price, finalized</p>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 shadow-sm">
            <div className="text-sm text-slate-500">Potential Volume</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">
              {formatCurrency(summary.potentialVolume)}
            </div>
            <p className="mt-1 text-xs text-slate-400">Close price, non-finalized</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Closings</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">
              {summary.closingsCount}
            </div>
            <p className="mt-1 text-xs text-slate-400">Finalized count</p>
          </div>
      </div>

      <div className="mt-10 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Portfolio Records</h2>
          <p className="mt-1 text-sm text-slate-500">
            Finalized production first; deals awaiting portfolio finalization are highlighted.
          </p>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading portfolio...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No records found for this filter set.</div>
        ) : (
          <>
            <div
              className="flex border-b border-slate-200 bg-slate-50"
              aria-label={`Row counts by group: ${tableSections.finalized.length} finalized, ${tableSections.needsFinal.length} needs final, ${tableSections.pipeline.length} pipeline`}
            >
              {(
                [
                  ["Finalized", tableSections.finalized.length],
                  ["Needs Final", tableSections.needsFinal.length],
                  ["Pipeline", tableSections.pipeline.length],
                ] as const
              ).map(([label, count], i) => (
                <div
                  key={label}
                  className={`min-w-0 flex-1 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 sm:px-4 ${
                    i < 2 ? "border-r border-slate-200" : ""
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
                    <th className="px-5 py-3 font-medium">Client</th>
                    <th className="px-5 py-3 font-medium">Address</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Agent</th>
                    <th className="px-5 py-3 font-medium">Close Date</th>
                    <th className="px-5 py-3 font-medium">GCI</th>
                    <th className="px-5 py-3 font-medium">Realized</th>
                  </tr>
                </thead>
                <tbody>
                  {tableSections.finalized.map((row) => renderRow(row, "none"))}
                  {tableSections.needsFinal.map((row) => renderRow(row, "needs-final"))}
                  {tableSections.pipeline.map((row) => renderRow(row, "none"))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
