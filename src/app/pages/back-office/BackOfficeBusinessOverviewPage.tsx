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

/** Runway in months (balance ÷ monthly expense); null when expense is zero or non-finite. */
function runwayMonthsFromCents(balanceCents: number, expenseCents: number): number | null {
  if (expenseCents <= 0) return null;
  const m = balanceCents / expenseCents;
  return Number.isFinite(m) ? m : null;
}

function monthOptionLabel(month: number): string {
  const d = new Date(Date.UTC(2000, month - 1, 1));
  return d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

function billingRiskCounts(rows: BackOfficeListOfficeRow[]): {
  pastDue: number;
  unpaid: number;
  canceled: number;
} {
  let pastDue = 0;
  let unpaid = 0;
  let canceled = 0;
  for (const o of rows) {
    const st = (o.billing_status ?? "").trim().toLowerCase();
    if (st === "past_due") pastDue += 1;
    else if (st === "unpaid") unpaid += 1;
    else if (st === "canceled") canceled += 1;
  }
  return { pastDue, unpaid, canceled };
}

/** Sum catalog normalized monthly revenue for offices in billing risk (same row math as revenue table). */
function monthlyRevenueAtRiskUsd(
  offices: BackOfficeListOfficeRow[],
  revenueRows: RevenueModelRowView[]
): number | null {
  const byOfficeId = new Map<string, number | null>();
  for (const r of revenueRows) {
    byOfficeId.set(r.officeId, r.monthlyEquivalentUsd);
  }

  let sum = 0;
  for (const o of offices) {
    const st = (o.billing_status ?? "").trim().toLowerCase();
    if (st !== "past_due" && st !== "unpaid" && st !== "canceled") continue;

    const monthlyEq = byOfficeId.get(o.id);
    if (monthlyEq === undefined) continue;
    if (monthlyEq == null || !Number.isFinite(monthlyEq)) return null;
    sum += monthlyEq;
  }

  return sum;
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

  const risk = useMemo(() => billingRiskCounts(offices), [offices]);
  const unpaidCanceledTotal = risk.unpaid + risk.canceled;

  const revenueModel = useMemo(() => buildBackOfficeRevenueModel(offices), [offices]);

  const revenueAtRiskUsd = useMemo(
    () => monthlyRevenueAtRiskUsd(offices, revenueModel.rows),
    [offices, revenueModel.rows]
  );

  const [revenueSortKey, setRevenueSortKey] = useState<RevenueSortKey>("office");
  const [revenueSortDir, setRevenueSortDir] = useState<"asc" | "desc">("asc");

  const sortedRevenueRows = useMemo(
    () => sortRevenueRows(revenueModel.rows, revenueSortKey, revenueSortDir),
    [revenueModel.rows, revenueSortKey, revenueSortDir]
  );

  function toggleRevenueSort(nextKey: RevenueSortKey) {
    if (nextKey === revenueSortKey) {
      setRevenueSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setRevenueSortKey(nextKey);
      setRevenueSortDir("asc");
    }
  }

  const expectedMonthlyIncomeUsd = useMemo(() => {
    if (officesLoading || officesError || revenueModel.rows.length === 0) return null;
    const v = revenueModel.totalMonthlyEquivalentUsd;
    return Number.isFinite(v) ? v : null;
  }, [
    officesLoading,
    officesError,
    revenueModel.rows.length,
    revenueModel.totalMonthlyEquivalentUsd,
  ]);

  const expectedMonthlyExpenseUsd = useMemo(() => {
    if (settingsLoading || settingsError) return null;
    return expenseEstimateCents / 100;
  }, [settingsLoading, settingsError, expenseEstimateCents]);

  const expectedPlUsd = useMemo(() => {
    if (expectedMonthlyIncomeUsd == null || expectedMonthlyExpenseUsd == null) return null;
    return expectedMonthlyIncomeUsd - expectedMonthlyExpenseUsd;
  }, [expectedMonthlyIncomeUsd, expectedMonthlyExpenseUsd]);

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
    const runwayMonths = runwayMonthsFromCents(projectedBalanceCents, expenseEstimateCents);
    const goalProgressRatio =
      annualGoalCents > 0 ? projectedBalanceCents / annualGoalCents : null;
    return {
      payoutCents: payoutCentsSelected,
      netChangeCents,
      projectedBalanceCents,
      runwayMonths,
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
            Business Position payouts (year-to-date): {ytdPayoutsError}
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-slate-900">Business Position</div>
                <p className="mt-0.5 text-xs text-slate-400">Selected month</p>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                disabled={settingsLoading || Boolean(settingsError)}
                aria-label="Edit starting cash balance and annual goal"
                onClick={openPositionDialog}
              >
                Edit
              </button>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="shrink-0 text-slate-500">Starting Cash Balance</dt>
                <dd className="text-right font-semibold tabular-nums text-slate-900">
                  {settingsLoading ? (
                    <span className="font-normal text-slate-500">Loading…</span>
                  ) : settingsError ? (
                    <span className="font-normal text-slate-400">—</span>
                  ) : startingBalanceCents === 0 ? (
                    <span className="font-normal text-slate-500">Set starting cash balance</span>
                  ) : (
                    formatUsdFromCents(startingBalanceCents)
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-slate-500">Stripe Payouts This Month</dt>
                <dd className="text-right font-semibold tabular-nums text-slate-900">
                  {ytdPayoutsLoading ? (
                    <span className="font-normal text-slate-500">Loading…</span>
                  ) : ytdPayoutsByMonth && ytdPayoutsByMonth[month - 1] ? (
                    formatUsdFromCents(ytdPayoutsByMonth[month - 1].amount_paid_out_cents)
                  ) : (
                    <span className="font-normal text-slate-400">—</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-slate-500">Monthly Expenses</dt>
                <dd className="text-right font-semibold tabular-nums text-slate-900">
                  {settingsLoading ? (
                    <span className="font-normal text-slate-500">Loading…</span>
                  ) : settingsError ? (
                    <span className="font-normal text-slate-400">—</span>
                  ) : expenseEstimateCents === 0 ? (
                    <span className="font-normal text-slate-500">Set expense estimate</span>
                  ) : (
                    formatUsdFromCents(expenseEstimateCents)
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-slate-500">Net Change</dt>
                <dd
                  className={`text-right font-semibold tabular-nums ${
                    positionDerived && positionDerived.netChangeCents < 0
                      ? "text-red-600"
                      : "text-slate-900"
                  }`}
                >
                  {!positionDerived ? (
                    <span className="font-normal text-slate-400">—</span>
                  ) : (
                    formatUsdFromCents(positionDerived.netChangeCents)
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-slate-500">Projected Balance</dt>
                <dd className="text-right font-semibold tabular-nums text-slate-900">
                  {!positionDerived ? (
                    <span className="font-normal text-slate-400">—</span>
                  ) : (
                    <>
                      <div>{formatUsdFromCents(positionDerived.projectedBalanceCents)}</div>
                      <div className="mt-0.5 text-xs font-normal text-slate-400">
                        Through selected month.
                      </div>
                    </>
                  )}
                </dd>
              </div>
              <div className="border-b border-slate-100 pb-3">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Goal Progress</dt>
                  <dd className="text-right">
                    {annualGoalCents <= 0 ? (
                      <span className="text-sm font-medium text-slate-500">Set annual goal</span>
                    ) : !positionDerived ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="font-semibold tabular-nums text-slate-900">
                        {`${formatUsd0Whole(positionDerived.projectedBalanceCents / 100)} / ${formatUsd0Whole(annualGoalCents / 100)} (${Math.round((positionDerived.goalProgressRatio ?? 0) * 100)}%)`}
                      </span>
                    )}
                  </dd>
                </div>
                {annualGoalCents > 0 && positionDerived ? (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
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
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Cash Runway</dt>
                <dd className="text-right font-semibold tabular-nums text-slate-900">
                  {!positionDerived || expenseEstimateCents <= 0 ? (
                    <span className="font-normal text-slate-400">—</span>
                  ) : positionDerived.runwayMonths == null ? (
                    <span className="font-normal text-slate-400">—</span>
                  ) : (
                    `${positionDerived.runwayMonths.toFixed(1)} mo`
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-medium text-slate-900">Expected Monthly Model</div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-slate-500">Expected Monthly Income</dt>
                <dd className="font-semibold tabular-nums text-slate-900">
                  {officesLoading ? (
                    <span className="font-normal text-slate-500">Loading…</span>
                  ) : officesError ? (
                    <span className="font-normal text-slate-400">—</span>
                  ) : revenueModel.rows.length === 0 ? (
                    <span className="font-normal text-slate-400">—</span>
                  ) : (
                    formatUsd0Whole(expectedMonthlyIncomeUsd)
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3 items-start">
                <dt className="text-slate-500 shrink-0 pt-0.5">Expected Monthly Expenses</dt>
                <dd className="flex flex-col items-end gap-1.5 text-right">
                  <div className="min-h-[1.25rem] font-semibold tabular-nums text-slate-900">
                    {settingsLoading ? (
                      <span className="font-normal text-slate-500">Loading…</span>
                    ) : settingsError ? (
                      <span className="font-normal text-slate-400">—</span>
                    ) : expenseEstimateCents === 0 ? (
                      <span className="font-normal text-slate-500">Set expense estimate</span>
                    ) : (
                      formatUsdFromCents(expenseEstimateCents)
                    )}
                  </div>
                  <button
                    type="button"
                    className="text-xs font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                    disabled={settingsLoading}
                    onClick={openExpenseDialog}
                  >
                    Edit
                  </button>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Expected P/L</dt>
                <dd className="font-semibold tabular-nums text-slate-900">
                  {expectedPlUsd == null ? (
                    <span className="font-normal text-slate-400">—</span>
                  ) : (
                    formatUsd0Whole(expectedPlUsd)
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-medium text-slate-900">Billing Risk</div>
            {officesLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading office billing…</p>
            ) : officesError ? (
              <p className="mt-4 text-sm text-amber-800">
                Could not load office billing ({officesError}). Counts unavailable.
              </p>
            ) : (
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Past due accounts</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{risk.pastDue}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Unpaid / canceled accounts</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {unpaidCanceledTotal}
                    <span className="ml-2 font-normal text-slate-400">
                      ({risk.unpaid} unpaid · {risk.canceled} canceled)
                    </span>
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Monthly revenue at risk</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {revenueAtRiskUsd == null ? (
                      <span className="font-normal text-slate-400">—</span>
                    ) : (
                      formatUsd0Whole(revenueAtRiskUsd)
                    )}
                  </dd>
                </div>
              </dl>
            )}
          </div>
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
                Manual monthly total used in the Expected Monthly Model (USD).
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
                Starting Cash Balance and Annual Goal are saved for this dashboard (USD). Stripe
                totals are unchanged.
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
