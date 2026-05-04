import React, { useEffect, useMemo, useState } from "react";
import { Briefcase } from "lucide-react";
import { listOfficesForBackOffice, type BackOfficeListOfficeRow } from "../../../services/offices";
import {
  fetchMonthlyPayoutsSummary,
  type MonthlyPayoutsApiResponse,
} from "../../../services/backOfficeMonthlyPayouts";

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

export function BackOfficeBusinessOverviewPage() {
  const [year, setYear] = useState<number>(currentCalendarYear());
  const [month, setMonth] = useState<number>(currentCalendarMonth());

  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutData, setPayoutData] = useState<MonthlyPayoutsApiResponse | null>(null);

  const [officesLoading, setOfficesLoading] = useState(true);
  const [officesError, setOfficesError] = useState<string | null>(null);
  const [offices, setOffices] = useState<BackOfficeListOfficeRow[]>([]);

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
    listOfficesForBackOffice().then(({ offices: rows, error: err }) => {
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
    setPayoutLoading(true);
    setPayoutError(null);
    fetchMonthlyPayoutsSummary(year, month).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setPayoutData(result.data);
      } else {
        setPayoutData(null);
        setPayoutError(result.error);
      }
      setPayoutLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const risk = useMemo(() => billingRiskCounts(offices), [offices]);
  const unpaidCanceledTotal = risk.unpaid + risk.canceled;

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

        {payoutError && (
          <p
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {payoutError}
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
            <div className="text-sm font-medium text-slate-900">Business Position</div>
            <div className="mt-3 text-sm text-slate-500">Stripe Payouts This Month</div>
            {payoutLoading ? (
              <div className="mt-3 text-sm text-slate-500">Loading payouts…</div>
            ) : payoutData ? (
              <>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {formatUsdFromCents(payoutData.amount_paid_out_cents)}
                </div>
                <p className="mt-2 text-xs text-slate-400">Paid out from Stripe</p>
                <p className="mt-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-900 tabular-nums">
                    {payoutData.payout_count}
                  </span>{" "}
                  {payoutData.payout_count === 1 ? "payout" : "payouts"}
                </p>
              </>
            ) : payoutError ? (
              <p className="mt-3 text-sm text-slate-600">Payout totals unavailable.</p>
            ) : (
              <div className="mt-3 text-sm text-slate-500">No payout data loaded.</div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-medium text-slate-900">Expected Monthly Model</div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-slate-500">Expected Monthly Income</dt>
                <dd className="font-medium text-slate-400">—</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-slate-500">Expected Monthly Expenses</dt>
                <dd className="font-medium text-slate-400">Manual later</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Expected P/L</dt>
                <dd className="font-medium text-slate-400">—</dd>
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
              </dl>
            )}
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6">
          <h2 className="text-lg font-semibold text-slate-900">Revenue model</h2>
          <p className="mt-2 text-sm text-slate-500">
            Office-level expected revenue model will live here.
          </p>
        </div>
      </div>
    </div>
  );
}
