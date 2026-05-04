import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, ExternalLink } from "lucide-react";
import { listOfficesForBackOfficeV2, type BackOfficeListOfficeRow } from "../../../services/offices";
import {
  stripeCustomerDashboardUrl,
  stripeSubscriptionDashboardUrl,
} from "../../../lib/stripeDashboardUrls";

type BillingFilter =
  | "all"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "missing_stripe";

/** Billing status filters only (subset of rows). Applied before search and sort. */
const FILTER_LABELS: { id: BillingFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "past_due", label: "Past due" },
  { id: "unpaid", label: "Unpaid" },
  { id: "canceled", label: "Canceled" },
  { id: "missing_stripe", label: "Missing Stripe ID" },
];

function officeLabel(o: BackOfficeListOfficeRow): string {
  return o.display_name?.trim() || o.name;
}

type BillingSortMode =
  | "needs_attention"
  | "office_az"
  | "broker_az"
  | "days_late_high_low"
  | "amount_due_high_low";

const SORT_OPTIONS: { id: BillingSortMode; label: string }[] = [
  { id: "needs_attention", label: "Needs attention first" },
  { id: "office_az", label: "Office A–Z" },
  { id: "broker_az", label: "Broker A–Z" },
  { id: "days_late_high_low", label: "Days late (high → low)" },
  { id: "amount_due_high_low", label: "Amount due (high → low)" },
];

function brokerLabel(o: BackOfficeListOfficeRow): string {
  return (o.broker_name ?? "").trim();
}

function planDisplay(o: BackOfficeListOfficeRow): string {
  return (
    o.display_plan_label?.trim() ||
    o.billing_plan_tier?.trim() ||
    o.plan_tier?.trim() ||
    ""
  );
}

/** Case-insensitive substring match on trimmed office name(s), broker, email, id. */
function officeMatchesSearch(o: BackOfficeListOfficeRow, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const chunks = [
    o.display_name?.trim(),
    o.name?.trim(),
    o.broker_name?.trim(),
    o.broker_email?.trim(),
    o.id?.trim(),
  ].filter(Boolean) as string[];
  return chunks.some((c) => c.toLowerCase().includes(q));
}

function billingStatusBadgeClass(status: string | null | undefined): string {
  const s = (status ?? "").trim().toLowerCase();
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";
  if (s === "active") {
    return `${base} bg-emerald-50 text-emerald-800 ring-emerald-600/20`;
  }
  if (s === "past_due") {
    return `${base} bg-amber-50 text-amber-900 ring-amber-600/25`;
  }
  if (s === "unpaid" || s === "canceled") {
    return `${base} bg-red-50 text-red-800 ring-red-600/20`;
  }
  if (!s) {
    return `${base} bg-slate-100 text-slate-600 ring-slate-500/15`;
  }
  return `${base} bg-slate-100 text-slate-700 ring-slate-500/15`;
}

/** Display + sort tie-break helpers for Days late cells. */
type DaysLateCell =
  | { kind: "dash"; text: string; emphasize: boolean }
  | { kind: "days"; text: string; emphasize: boolean }
  | { kind: "unknown"; text: string; emphasize: boolean };

function daysLateCell(
  billingStatus: string | null | undefined,
  failedAt: string | null | undefined
): DaysLateCell {
  const st = (billingStatus ?? "").trim().toLowerCase();
  if (st === "active") {
    return { kind: "dash", text: "—", emphasize: false };
  }
  if (!failedAt?.trim()) {
    return { kind: "unknown", text: "Unknown", emphasize: false };
  }
  const t = new Date(failedAt.trim()).getTime();
  if (Number.isNaN(t)) {
    return { kind: "unknown", text: "Unknown", emphasize: false };
  }
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days < 0) {
    return { kind: "unknown", text: "Unknown", emphasize: false };
  }
  return { kind: "days", text: String(days), emphasize: days >= 7 };
}

/** Sort key: bucket 0 = non-active with known days late, 1 = non-active unknown late, 2 = active. */
function lateSortBucket(o: BackOfficeListOfficeRow): { bucket: number; days: number } {
  const st = (o.billing_status ?? "").trim().toLowerCase();
  if (st === "active") return { bucket: 2, days: 0 };

  const failed = o.billing_last_payment_failed_at?.trim();
  if (!failed) return { bucket: 1, days: 0 };

  const t = new Date(failed).getTime();
  if (Number.isNaN(t)) return { bucket: 1, days: 0 };

  const days = Math.floor((Date.now() - t) / 86400000);
  if (days < 0) return { bucket: 1, days: 0 };

  return { bucket: 0, days };
}

function sortNeedsAttentionFirst(rows: BackOfficeListOfficeRow[]): BackOfficeListOfficeRow[] {
  return [...rows].sort((a, b) => {
    const ka = lateSortBucket(a);
    const kb = lateSortBucket(b);
    if (ka.bucket !== kb.bucket) return ka.bucket - kb.bucket;
    if (ka.bucket === 0 && ka.days !== kb.days) return kb.days - ka.days;
    return officeLabel(a).localeCompare(officeLabel(b), undefined, { sensitivity: "base" });
  });
}

/** Same buckets as needs-attention: known late (days desc) → unknown non-active → active; ties by office A–Z. */
function sortDaysLateHighLow(rows: BackOfficeListOfficeRow[]): BackOfficeListOfficeRow[] {
  return sortNeedsAttentionFirst(rows);
}

function sortOfficeAz(rows: BackOfficeListOfficeRow[]): BackOfficeListOfficeRow[] {
  return [...rows].sort((a, b) =>
    officeLabel(a).localeCompare(officeLabel(b), undefined, { sensitivity: "base" })
  );
}

function sortBrokerAz(rows: BackOfficeListOfficeRow[]): BackOfficeListOfficeRow[] {
  return [...rows].sort((a, b) => {
    const na = brokerLabel(a).toLowerCase() || "\uffff";
    const nb = brokerLabel(b).toLowerCase() || "\uffff";
    const cmp = na.localeCompare(nb, undefined, { sensitivity: "base" });
    if (cmp !== 0) return cmp;
    return officeLabel(a).localeCompare(officeLabel(b), undefined, { sensitivity: "base" });
  });
}

function validAmountDueCents(o: BackOfficeListOfficeRow): number | null {
  const raw = o.billing_amount_due_cents;
  if (raw == null || !Number.isFinite(Number(raw)) || Number(raw) <= 0) return null;
  return Number(raw);
}

function sortAmountDueHighLow(rows: BackOfficeListOfficeRow[]): BackOfficeListOfficeRow[] {
  return [...rows].sort((a, b) => {
    const va = validAmountDueCents(a);
    const vb = validAmountDueCents(b);
    if (va != null && vb != null && va !== vb) return vb - va;
    if (va != null && vb == null) return -1;
    if (va == null && vb != null) return 1;
    return officeLabel(a).localeCompare(officeLabel(b), undefined, { sensitivity: "base" });
  });
}

function applyBillingSort(
  rows: BackOfficeListOfficeRow[],
  mode: BillingSortMode
): BackOfficeListOfficeRow[] {
  switch (mode) {
    case "needs_attention":
      return sortNeedsAttentionFirst(rows);
    case "office_az":
      return sortOfficeAz(rows);
    case "broker_az":
      return sortBrokerAz(rows);
    case "days_late_high_low":
      return sortDaysLateHighLow(rows);
    case "amount_due_high_low":
      return sortAmountDueHighLow(rows);
    default:
      return sortNeedsAttentionFirst(rows);
  }
}

function formatAmountDueUsd(cents: number | null | undefined): string | null {
  if (cents == null || !Number.isFinite(Number(cents)) || Number(cents) <= 0) {
    return null;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(cents) / 100);
}

function officeMatchesFilter(o: BackOfficeListOfficeRow, f: BillingFilter): boolean {
  const st = (o.billing_status ?? "").trim().toLowerCase();
  const hasCust = Boolean(o.stripe_customer_id?.trim());
  const hasSub = Boolean(o.stripe_subscription_id?.trim());
  switch (f) {
    case "all":
      return true;
    case "active":
      return st === "active";
    case "past_due":
      return st === "past_due";
    case "unpaid":
      return st === "unpaid";
    case "canceled":
      return st === "canceled";
    case "missing_stripe":
      return !hasCust || !hasSub;
    default:
      return true;
  }
}

export function BackOfficeBillingPage() {
  const [rows, setRows] = useState<BackOfficeListOfficeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<BillingFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<BillingSortMode>("needs_attention");

  useEffect(() => {
    let cancelled = false;
    listOfficesForBackOfficeV2().then(({ offices, error: err }) => {
      if (cancelled) return;
      setRows(offices);
      setError(err);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredByStatus = useMemo(
    () => rows.filter((o) => officeMatchesFilter(o, filter)),
    [rows, filter]
  );

  const filtered = useMemo(
    () => filteredByStatus.filter((o) => officeMatchesSearch(o, searchQuery)),
    [filteredByStatus, searchQuery]
  );

  const sortedFiltered = useMemo(
    () => applyBillingSort(filtered, sortMode),
    [filtered, sortMode]
  );

  return (
    <div className="p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-start gap-3">
          <CreditCard className="h-8 w-8 shrink-0 text-slate-600" aria-hidden />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Billing</h1>
            <p className="text-sm text-slate-500">Back Office · Read-only overview</p>
          </div>
        </div>

        {/* Billing status filters — row subset only; sorting is separate (dropdown below). */}
        <div className="mb-3 flex flex-wrap gap-2">
          {FILTER_LABELS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={
                filter === id
                  ? "rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
                  : "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <input
            type="search"
            id="back-office-billing-search"
            name="billing-search"
            placeholder="Search office, broker or email"
            autoComplete="off"
            className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 sm:max-w-xs sm:flex-none md:max-w-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search offices"
          />
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs text-slate-500" id="back-office-billing-sort-label">
              Sort
            </span>
            <select
              aria-labelledby="back-office-billing-sort-label"
              id="back-office-billing-sort"
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as BillingSortMode)}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && <p className="text-slate-600">Loading offices…</p>}
        {!loading && error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}
        {!loading && !error && rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
            No offices found.
          </div>
        )}
        {!loading && !error && rows.length > 0 && filteredByStatus.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
            No offices match this filter.
          </div>
        )}
        {!loading &&
          !error &&
          rows.length > 0 &&
          filteredByStatus.length > 0 &&
          filtered.length === 0 &&
          searchQuery.trim() !== "" && (
            <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/80 px-6 py-10 text-center text-sm text-amber-950">
              <p className="font-medium">No offices match your search.</p>
              <p className="mt-1 text-amber-900/90">
                Try a different term or clear the search box to see all offices in this filter.
              </p>
            </div>
          )}

        {!loading && !error && sortedFiltered.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">Office</th>
                  <th className="whitespace-nowrap px-3 py-2">Broker / Primary</th>
                  <th className="whitespace-nowrap px-3 py-2">Plan</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Agents</th>
                  <th className="whitespace-nowrap px-3 py-2">Billing status</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Days late</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Amount due</th>
                  <th className="whitespace-nowrap px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedFiltered.map((o) => {
                  const late = daysLateCell(o.billing_status, o.billing_last_payment_failed_at);
                  const custId = o.stripe_customer_id?.trim();
                  const subId = o.stripe_subscription_id?.trim();
                  const plan = planDisplay(o);
                  const due = formatAmountDueUsd(o.billing_amount_due_cents);
                  return (
                    <tr key={o.id} className="align-top">
                      <td className="max-w-[10rem] px-3 py-2 font-medium text-slate-900">
                        <span className="line-clamp-2">{officeLabel(o)}</span>
                        <span className="mt-0.5 block font-mono text-[10px] font-normal text-slate-500 select-all">
                          {o.id}
                        </span>
                      </td>
                      <td className="max-w-[12rem] px-3 py-2 text-slate-800">
                        <div className="line-clamp-2">{o.broker_name?.trim() || "—"}</div>
                        {o.broker_email?.trim() ? (
                          <div className="mt-0.5 truncate text-xs text-slate-500">
                            {o.broker_email.trim()}
                          </div>
                        ) : null}
                      </td>
                      <td className="max-w-[9rem] px-3 py-2 text-slate-800">
                        {plan || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-800">
                        {o.active_member_count}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className={billingStatusBadgeClass(o.billing_status)}>
                          {(o.billing_status ?? "").trim() || "—"}
                        </span>
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                          late.kind === "unknown"
                            ? "text-xs font-normal italic text-amber-800/85"
                            : late.kind === "days" && late.emphasize
                              ? "font-semibold text-red-700"
                              : "text-slate-800"
                        }`}
                      >
                        {late.text}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-800">
                        {due ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1.5 whitespace-nowrap">
                          <Link
                            to={`/back-office/org/${o.id}`}
                            className="text-xs font-medium text-indigo-700 hover:underline"
                          >
                            View office
                          </Link>
                          {custId || subId ? (
                            <div className="flex flex-col gap-1">
                              {custId ? (
                                <a
                                  href={stripeCustomerDashboardUrl(custId)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
                                >
                                  Stripe customer
                                  <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                                </a>
                              ) : null}
                              {subId ? (
                                <a
                                  href={stripeSubscriptionDashboardUrl(subId)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
                                >
                                  Stripe subscription
                                  <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                                </a>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
