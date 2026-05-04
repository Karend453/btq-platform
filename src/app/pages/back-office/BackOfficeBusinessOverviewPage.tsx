import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import {
  listOfficesForBackOfficeV2,
  type BackOfficeListOfficeRow,
} from "../../../services/offices";
import {
  fetchMonthlyPayoutsSummary,
  type MonthlyPayoutsApiResponse,
} from "../../../services/backOfficeMonthlyPayouts";
import {
  fetchBtqBackofficeSettings,
  upsertBtqBackofficeFinancialSettings,
} from "../../../services/btqBackofficeSettings";
import {
  buildBackOfficeRevenueModel,
  type RevenueModelRowView,
} from "../../../lib/backOfficeExpectedMonthlyIncome";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

type RevenueSortKey =
  | "office"
  | "broker"
  | "plan"
  | "billingCycle"
  | "subAgents"
  | "expected";

function isMissingCellText(s: string): boolean {
  return s.trim() === "" || s === "—";
}

function compareStringsMissingLast(a: string, b: string, dir: 1 | -1): number {
  const am = isMissingCellText(a);
  const bm = isMissingCellText(b);
  if (am && bm) return 0;
  if (am) return 1;
  if (bm) return -1;
  return a.localeCompare(b, undefined, { sensitivity: "base" }) * dir;
}

function compareNullableNumbersMissingLast(
  a: number | null,
  b: number | null,
  dir: 1 | -1
): number {
  const am = a == null || !Number.isFinite(a);
  const bm = b == null || !Number.isFinite(b);
  if (am && bm) return 0;
  if (am) return 1;
  if (bm) return -1;
  return (a - b) * dir;
}

function sortRevenueRows(
  rows: RevenueModelRowView[],
  sortKey: RevenueSortKey,
  sortDir: "asc" | "desc"
): RevenueModelRowView[] {
  const dir: 1 | -1 = sortDir === "asc" ? 1 : -1;
  const out = [...rows];
  out.sort((ra, rb) => {
    switch (sortKey) {
      case "office":
        return compareStringsMissingLast(ra.officeLabel, rb.officeLabel, dir);
      case "broker":
        return compareStringsMissingLast(ra.brokerPrimaryLabel, rb.brokerPrimaryLabel, dir);
      case "plan":
        return compareStringsMissingLast(ra.planLabel, rb.planLabel, dir);
      case "billingCycle":
        return compareStringsMissingLast(ra.billingCycleLabel, rb.billingCycleLabel, dir);
      case "subAgents":
        return compareNullableNumbersMissingLast(ra.subAgentsSortValue, rb.subAgentsSortValue, dir);
      case "expected":
        return compareNullableNumbersMissingLast(
          ra.monthlyEquivalentUsd,
          rb.monthlyEquivalentUsd,
          dir
        );
      default:
        return 0;
    }
  });
  return out;
}

function SortCaret({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) {
    return <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />;
  }
  return dir === "asc" ? (
    <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-700" aria-hidden />
  ) : (
    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-700" aria-hidden />
  );
}

function currentCalendarYear(): number {
  return new Date().getFullYear();
}

function currentCalendarMonth(): number {
  return new Date().getMonth() + 1;
}

function formatUsdFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatUsd0Whole(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function monthOptionLabel(month: number): string {
  const d = new Date(Date.UTC(2000, month - 1, 1));
  return d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

function KpiCard({
  title,
  hint,
  editSlot,
  children,
}: {
  title: string;
  hint?: string;
  editSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-700">{title}</div>
          {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
        </div>
        {editSlot}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function BackOfficeBusinessOverviewPage() {
  const [year, setYear] = useState<number>(currentCalendarYear());
  const [month, setMonth] = useState<number>(currentCalendarMonth());

  const [ytdPayoutsLoading, setYtdPayoutsLoading] = useState(false);
  const [ytdPayoutsError, setYtdPayoutsError] = useState<string | null>(null);
  /** Index 0 = January … index month-1 = selected month; only set when Jan–selected month all loaded OK. */
  const [ytdPayoutsByMonth, setYtdPayoutsByMonth] = useState<MonthlyPayoutsApiResponse[] | null>(
    null
  );

  const [officesLoading, setOfficesLoading] = useState(true);
  const [officesError, setOfficesError] = useState<string | null>(null);
  const [offices, setOffices] = useState<BackOfficeListOfficeRow[]>([]);

  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [expenseEstimateCents, setExpenseEstimateCents] = useState(0);
  const [startingBalanceCents, setStartingBalanceCents] = useState(0);
  const [annualGoalCents, setAnnualGoalCents] = useState(0);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseDraftDollars, setExpenseDraftDollars] = useState("");
  const [expenseSaveError, setExpenseSaveError] = useState<string | null>(null);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [positionDialogOpen, setPositionDialogOpen] = useState(false);
  const [draftStartingDollars, setDraftStartingDollars] = useState("");
  const [draftGoalDollars, setDraftGoalDollars] = useState("");
  const [positionSaveError, setPositionSaveError] = useState<string | null>(null);
  const [positionSaving, setPositionSaving] = useState(false);

  const yearOptions = useMemo(() => {
    const y = currentCalendarYear();
    const out: number[] = [];
    for (let i = y - 5; i <= y + 1; i += 1) out.push(i);
    return out;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOfficesLoading(true);
    setOfficesError(null);
    listOfficesForBackOfficeV2().then(({ offices: rows, error: err }) => {
      if (cancelled) return;
      setOffices(rows);
      setOfficesError(err);
      setOfficesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSettingsLoading(true);
    setSettingsError(null);
    fetchBtqBackofficeSettings().then(({ row, error: err }) => {
      if (cancelled) return;
      if (err) {
        setSettingsError(err);
        setExpenseEstimateCents(0);
        setStartingBalanceCents(0);
        setAnnualGoalCents(0);
      } else {
        setExpenseEstimateCents(row?.monthly_expense_estimate_cents ?? 0);
        setStartingBalanceCents(row?.starting_balance_cents ?? 0);
        setAnnualGoalCents(row?.annual_goal_cents ?? 0);
      }
      setSettingsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setYtdPayoutsLoading(true);
    setYtdPayoutsError(null);
    setYtdPayoutsByMonth(null);

    const months = Array.from({ length: month }, (_, i) => i + 1);
    Promise.all(months.map((m) => fetchMonthlyPayoutsSummary(year, m))).then((results) => {
      if (cancelled) return;

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const expectMonth = i + 1;
        if (!r.ok) {
          setYtdPayoutsError(
            r.error ??
              `Could not load Stripe payouts for ${monthOptionLabel(expectMonth)} ${year}.`
          );
          setYtdPayoutsByMonth(null);
          setYtdPayoutsLoading(false);
          return;
        }
        if (r.data.year !== year || r.data.month !== expectMonth) {
          setYtdPayoutsError(
            `Stripe payout response did not match ${monthOptionLabel(expectMonth)} ${year}.`
          );
          setYtdPayoutsByMonth(null);
          setYtdPayoutsLoading(false);
          return;
        }
      }

      const rows: MonthlyPayoutsApiResponse[] = [];
      for (const r of results) {
        if (r.ok) rows.push(r.data);
      }
      setYtdPayoutsByMonth(rows);
      setYtdPayoutsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const revenueModel = useMemo(() => buildBackOfficeRevenueModel(offices), [offices]);

  const [revenueSortKey, setRevenueSortKey] = useState<RevenueSortKey>("office");
  const [revenueSortDir, setRevenueSortDir] = useState<"asc" | "desc">("asc");

  const sortedRevenueRows = useMemo(
    () => sortRevenueRows(revenueModel.rows, revenueSortKey, revenueSortDir),
    [revenueModel.rows, revenueSortKey, revenueSortDir]
  );

  /** Sum Expected Amount (monthly equivalent USD) for rows with a finite value; matches body rows regardless of sort order. */
  const revenueTableExpectedAmountTotal = useMemo(() => {
    let sumUsd = 0;
    let hasContributors = false;
    for (const row of revenueModel.rows) {
      const v = row.monthlyEquivalentUsd;
      if (v != null && Number.isFinite(v)) {
        sumUsd += v;
        hasContributors = true;
      }
    }
    return { sumUsd, hasContributors };
  }, [revenueModel.rows]);

  /** Revenue table footer: modeled P/L = sum of Expected Amount column − monthly expense estimate (USD). */
  const revenueModelPlUsd = useMemo((): number | null => {
    if (settingsLoading || settingsError) return null;
    return revenueTableExpectedAmountTotal.sumUsd - expenseEstimateCents / 100;
  }, [
    settingsLoading,
    settingsError,
    expenseEstimateCents,
    revenueTableExpectedAmountTotal.sumUsd,
  ]);

  function toggleRevenueSort(nextKey: RevenueSortKey) {
    if (nextKey === revenueSortKey) {
      setRevenueSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setRevenueSortKey(nextKey);
      setRevenueSortDir("asc");
    }
  }

  const resetExpenseDialogDraft = useCallback(() => {
    setExpenseDraftDollars((expenseEstimateCents / 100).toFixed(2));
    setExpenseSaveError(null);
  }, [expenseEstimateCents]);

  function openExpenseDialog() {
    resetExpenseDialogDraft();
    setExpenseDialogOpen(true);
  }

  async function saveExpenseEstimate() {
    setExpenseSaveError(null);
    const raw = expenseDraftDollars.trim();
    if (raw === "") {
      setExpenseSaveError("Enter a dollar amount (use 0 if none).");
      return;
    }
    const dollars = Number(raw);
    if (!Number.isFinite(dollars) || dollars < 0) {
      setExpenseSaveError("Enter a valid non-negative dollar amount.");
      return;
    }
    const cents = Math.round(dollars * 100);
    if (!Number.isFinite(cents)) {
      setExpenseSaveError("Amount is invalid.");
      return;
    }
    setExpenseSaving(true);
    const { ok, error: err } = await upsertBtqBackofficeFinancialSettings({
      monthly_expense_estimate_cents: cents,
      starting_balance_cents: startingBalanceCents,
      annual_goal_cents: annualGoalCents,
    });
    setExpenseSaving(false);
    if (!ok) {
      setExpenseSaveError(err ?? "Could not save.");
      return;
    }
    setExpenseEstimateCents(cents);
    setExpenseDialogOpen(false);
  }

  const resetPositionDialogDraft = useCallback(() => {
    setDraftStartingDollars((startingBalanceCents / 100).toFixed(2));
    setDraftGoalDollars((annualGoalCents / 100).toFixed(2));
    setPositionSaveError(null);
  }, [startingBalanceCents, annualGoalCents]);

  function openPositionDialog() {
    resetPositionDialogDraft();
    setPositionDialogOpen(true);
  }

  async function savePositionSettings() {
    setPositionSaveError(null);
    const rawStart = draftStartingDollars.trim();
    const rawGoal = draftGoalDollars.trim();
    if (rawStart === "") {
      setPositionSaveError("Enter starting cash balance (use 0 if none).");
      return;
    }
    if (rawGoal === "") {
      setPositionSaveError("Enter annual goal (use 0 if none).");
      return;
    }
    const startDollars = Number(rawStart);
    const goalDollars = Number(rawGoal);
    if (!Number.isFinite(startDollars)) {
      setPositionSaveError("Starting cash balance is invalid.");
      return;
    }
    if (!Number.isFinite(goalDollars) || goalDollars < 0) {
      setPositionSaveError("Annual goal must be zero or greater.");
      return;
    }
    const startCents = Math.round(startDollars * 100);
    const goalCents = Math.round(goalDollars * 100);
    if (!Number.isFinite(startCents) || !Number.isFinite(goalCents)) {
      setPositionSaveError("Amount is invalid.");
      return;
    }
    setPositionSaving(true);
    const { ok, error: err } = await upsertBtqBackofficeFinancialSettings({
      monthly_expense_estimate_cents: expenseEstimateCents,
      starting_balance_cents: startCents,
      annual_goal_cents: goalCents,
    });
    setPositionSaving(false);
    if (!ok) {
      setPositionSaveError(err ?? "Could not save.");
      return;
    }
    setStartingBalanceCents(startCents);
    setAnnualGoalCents(goalCents);
    setPositionDialogOpen(false);
  }

  const positionCashReady = useMemo(() => {
    if (settingsLoading || settingsError) return false;
    if (ytdPayoutsLoading || ytdPayoutsError) return false;
    if (!ytdPayoutsByMonth || ytdPayoutsByMonth.length !== month) return false;
    return true;
  }, [
    settingsLoading,
    settingsError,
    ytdPayoutsLoading,
    ytdPayoutsError,
    ytdPayoutsByMonth,
    month,
  ]);

  const positionDerived = useMemo(() => {
    if (!positionCashReady || !ytdPayoutsByMonth || ytdPayoutsByMonth.length !== month) {
      return null;
    }
    const payoutCentsSelected = ytdPayoutsByMonth[month - 1].amount_paid_out_cents;
    const netChangeCents = payoutCentsSelected - expenseEstimateCents;
    let sumNetChangeYtd = 0;
    for (let i = 0; i < month; i += 1) {
      sumNetChangeYtd += ytdPayoutsByMonth[i].amount_paid_out_cents - expenseEstimateCents;
    }
    const projectedBalanceCents = startingBalanceCents + sumNetChangeYtd;
    const goalProgressRatio =
      annualGoalCents > 0 ? projectedBalanceCents / annualGoalCents : null;
    return {
      payoutCents: payoutCentsSelected,
      netChangeCents,
      projectedBalanceCents,
      goalProgressRatio,
    };
  }, [
    positionCashReady,
    ytdPayoutsByMonth,
    month,
    expenseEstimateCents,
    startingBalanceCents,
    annualGoalCents,
  ]);

  return (
    <div className="p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-start gap-3">
          <Briefcase className="h-8 w-8 shrink-0 text-slate-600" aria-hidden />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Business Overview</h1>
            <p className="text-sm text-slate-500">Back Office · Read-only dashboard</p>
          </div>
        </div>

        <div className="-mx-6 mt-4 border-b border-slate-200 bg-slate-50 px-6 py-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
            <label className="space-y-1.5">
              <span className="text-sm text-slate-500">Year</span>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-sm text-slate-500">Month</span>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {monthOptionLabel(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {ytdPayoutsError && (
          <p
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            Stripe payouts ({year}, January–{monthOptionLabel(month)}): {ytdPayoutsError} Values that
            depend on Stripe payouts are unavailable; the revenue model table below still loads from
            offices.
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            title="Starting Cash"
            editSlot={
              <button
                type="button"
                className="shrink-0 text-xs font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                disabled={settingsLoading || Boolean(settingsError)}
                aria-label="Edit starting cash and annual goal"
                onClick={openPositionDialog}
              >
                Edit
              </button>
            }
          >
            <div className="text-xl font-semibold tracking-tight tabular-nums text-slate-900">
              {settingsLoading ? (
                <span className="text-sm font-normal text-slate-500">Loading…</span>
              ) : settingsError ? (
                <span className="text-sm font-normal text-slate-400">—</span>
              ) : startingBalanceCents === 0 ? (
                <span className="text-sm font-normal text-slate-500">Set starting cash balance</span>
              ) : (
                formatUsdFromCents(startingBalanceCents)
              )}
            </div>
          </KpiCard>

          <KpiCard
            title="Expenses"
            hint="Monthly estimate"
            editSlot={
              <button
                type="button"
                className="shrink-0 text-xs font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                disabled={settingsLoading || Boolean(settingsError)}
                aria-label="Edit monthly expenses"
                onClick={openExpenseDialog}
              >
                Edit
              </button>
            }
          >
            <div className="text-xl font-semibold tracking-tight tabular-nums text-slate-900">
              {settingsLoading ? (
                <span className="text-sm font-normal text-slate-500">Loading…</span>
              ) : settingsError ? (
                <span className="text-sm font-normal text-slate-400">—</span>
              ) : expenseEstimateCents === 0 ? (
                <span className="text-sm font-normal text-slate-500">Set expense estimate</span>
              ) : (
                formatUsdFromCents(expenseEstimateCents)
              )}
            </div>
          </KpiCard>

          <KpiCard title="Income" hint="Stripe · selected month">
            <div className="text-xl font-semibold tracking-tight tabular-nums text-slate-900">
              {ytdPayoutsLoading ? (
                <span className="text-sm font-normal text-slate-500">Loading…</span>
              ) : ytdPayoutsByMonth && ytdPayoutsByMonth[month - 1] ? (
                formatUsdFromCents(ytdPayoutsByMonth[month - 1].amount_paid_out_cents)
              ) : (
                <span className="text-sm font-normal text-slate-400">—</span>
              )}
            </div>
          </KpiCard>

          <KpiCard title="Monthly P/L" hint="Selected month">
            <div
              className={`text-xl font-semibold tracking-tight tabular-nums ${
                positionDerived && positionDerived.netChangeCents < 0
                  ? "text-red-600"
                  : "text-slate-900"
              }`}
            >
              {!positionDerived ? (
                <span className="text-sm font-normal text-slate-400">—</span>
              ) : (
                formatUsdFromCents(positionDerived.netChangeCents)
              )}
            </div>
          </KpiCard>

          <KpiCard title="Running Balance" hint="Through selected month">
            <div className="text-xl font-semibold tracking-tight tabular-nums text-slate-900">
              {!positionDerived ? (
                <span className="text-sm font-normal text-slate-400">—</span>
              ) : (
                formatUsdFromCents(positionDerived.projectedBalanceCents)
              )}
            </div>
          </KpiCard>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-medium text-slate-900">Annual goal progress</div>
          <p className="mt-0.5 text-xs text-slate-500">
            Running Balance ÷ Annual Goal (same period as KPI row).
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">
              {annualGoalCents <= 0 ? (
                <span className="font-medium text-slate-500">Set annual goal</span>
              ) : !positionDerived ? (
                <span className="text-slate-400">—</span>
              ) : (
                <span className="font-semibold tabular-nums text-slate-900">
                  {`${formatUsd0Whole(positionDerived.projectedBalanceCents / 100)} / ${formatUsd0Whole(annualGoalCents / 100)} (${Math.round((positionDerived.goalProgressRatio ?? 0) * 100)}%)`}
                </span>
              )}
            </div>
          </div>
          {annualGoalCents > 0 && positionDerived ? (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-600"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(0, (positionDerived.goalProgressRatio ?? 0) * 100)
                  )}%`,
                }}
              />
            </div>
          ) : null}
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900">Revenue model</h2>
          <p className="mt-1 text-sm text-slate-500">
            Active-access offices only ({revenueModel.rows.length} row
            {revenueModel.rows.length === 1 ? "" : "s"}).
          </p>
          <p className="mt-1 text-xs text-slate-500">
          </p>

          {officesLoading && <p className="mt-4 text-sm text-slate-500">Loading offices…</p>}
          {!officesLoading && officesError && (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Revenue table unavailable ({officesError}).
            </p>
          )}

          {!officesLoading && !officesError && revenueModel.rows.length === 0 && (
            <p className="mt-4 text-sm text-slate-600">No active-access offices to show.</p>
          )}

          {!officesLoading && !officesError && revenueModel.rows.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <tr>
                    <th className="px-4 py-3" aria-sort={revenueSortKey === "office" ? (revenueSortDir === "asc" ? "ascending" : "descending") : "none"}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-sm text-left hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                        onClick={() => toggleRevenueSort("office")}
                      >
                        Office
                        <SortCaret active={revenueSortKey === "office"} dir={revenueSortDir} />
                      </button>
                    </th>
                    <th className="px-4 py-3" aria-sort={revenueSortKey === "broker" ? (revenueSortDir === "asc" ? "ascending" : "descending") : "none"}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-sm text-left hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                        onClick={() => toggleRevenueSort("broker")}
                      >
                        Broker / Primary
                        <SortCaret active={revenueSortKey === "broker"} dir={revenueSortDir} />
                      </button>
                    </th>
                    <th className="px-4 py-3" aria-sort={revenueSortKey === "plan" ? (revenueSortDir === "asc" ? "ascending" : "descending") : "none"}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-sm text-left hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                        onClick={() => toggleRevenueSort("plan")}
                      >
                        Plan
                        <SortCaret active={revenueSortKey === "plan"} dir={revenueSortDir} />
                      </button>
                    </th>
                    <th className="px-4 py-3" aria-sort={revenueSortKey === "billingCycle" ? (revenueSortDir === "asc" ? "ascending" : "descending") : "none"}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-sm text-left hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                        onClick={() => toggleRevenueSort("billingCycle")}
                      >
                        Billing Cycle
                        <SortCaret active={revenueSortKey === "billingCycle"} dir={revenueSortDir} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right" aria-sort={revenueSortKey === "subAgents" ? (revenueSortDir === "asc" ? "ascending" : "descending") : "none"}>
                      <button
                        type="button"
                        className="inline-flex w-full items-center justify-end gap-1 rounded-sm hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                        onClick={() => toggleRevenueSort("subAgents")}
                      >
                        SubAgents
                        <SortCaret active={revenueSortKey === "subAgents"} dir={revenueSortDir} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right" aria-sort={revenueSortKey === "expected" ? (revenueSortDir === "asc" ? "ascending" : "descending") : "none"}>
                      <button
                        type="button"
                        className="inline-flex w-full items-center justify-end gap-1 rounded-sm hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                        onClick={() => toggleRevenueSort("expected")}
                      >
                        Expected Amount
                        <SortCaret active={revenueSortKey === "expected"} dir={revenueSortDir} />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedRevenueRows.map((row) => (
                    <tr key={row.officeId}>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.officeLabel}</td>
                      <td className="px-4 py-3 text-slate-700">{row.brokerPrimaryLabel}</td>
                      <td className="px-4 py-3 text-slate-700">{row.planLabel}</td>
                      <td className="px-4 py-3 text-slate-700">{row.billingCycleLabel}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-900">{row.subAgentsLabel}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                        {formatUsd0Whole(row.monthlyEquivalentUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">Total</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
                      {revenueTableExpectedAmountTotal.hasContributors ? (
                        formatUsd0Whole(revenueTableExpectedAmountTotal.sumUsd)
                      ) : (
                        <span className="font-normal text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-100 bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">Model P/L</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td
                      className={`px-4 py-3 text-right font-bold tabular-nums ${
                        revenueModelPlUsd != null && revenueModelPlUsd < 0
                          ? "text-red-600"
                          : "text-slate-900"
                      }`}
                    >
                      {revenueModelPlUsd == null ? (
                        <span className="font-normal text-slate-400">—</span>
                      ) : (
                        formatUsd0Whole(revenueModelPlUsd)
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <Dialog
          open={expenseDialogOpen}
          onOpenChange={(open) => {
            setExpenseDialogOpen(open);
            if (!open) {
              setExpenseSaveError(null);
              setExpenseDraftDollars((expenseEstimateCents / 100).toFixed(2));
            }
          }}
        >
          <DialogContent className="border-slate-200 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-slate-900">Monthly expense estimate</DialogTitle>
              <DialogDescription className="text-slate-600">
                Used for Business Overview KPIs (USD). Does not change Stripe or office billing data.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label htmlFor="expense-draft-usd" className="text-sm font-medium text-slate-700">
                Amount (USD)
              </label>
              <input
                id="expense-draft-usd"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm"
                value={expenseDraftDollars}
                onChange={(e) => setExpenseDraftDollars(e.target.value)}
                disabled={expenseSaving}
              />
              {expenseSaveError && (
                <p className="text-sm text-red-700" role="alert">
                  {expenseSaveError}
                </p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={expenseSaving}
                onClick={() => setExpenseDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" disabled={expenseSaving} onClick={() => void saveExpenseEstimate()}>
                {expenseSaving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={positionDialogOpen}
          onOpenChange={(open) => {
            setPositionDialogOpen(open);
            if (!open) {
              setPositionSaveError(null);
              setDraftStartingDollars((startingBalanceCents / 100).toFixed(2));
              setDraftGoalDollars((annualGoalCents / 100).toFixed(2));
            }
          }}
        >
          <DialogContent className="border-slate-200 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-slate-900">Edit Business Position</DialogTitle>
              <DialogDescription className="text-slate-600">
                Starting Cash Balance and Annual Goal feed KPIs on this page (USD). Stripe totals are
                unchanged.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="position-starting-usd" className="text-sm font-medium text-slate-700">
                  Starting Cash Balance
                </label>
                <input
                  id="position-starting-usd"
                  type="number"
                  inputMode="decimal"
                  step={0.01}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm"
                  value={draftStartingDollars}
                  onChange={(e) => setDraftStartingDollars(e.target.value)}
                  disabled={positionSaving}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="position-goal-usd" className="text-sm font-medium text-slate-700">
                  Annual Goal
                </label>
                <input
                  id="position-goal-usd"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm"
                  value={draftGoalDollars}
                  onChange={(e) => setDraftGoalDollars(e.target.value)}
                  disabled={positionSaving}
                />
              </div>
              {positionSaveError && (
                <p className="text-sm text-red-700" role="alert">
                  {positionSaveError}
                </p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={positionSaving}
                onClick={() => setPositionDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" disabled={positionSaving} onClick={() => void savePositionSettings()}>
                {positionSaving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
