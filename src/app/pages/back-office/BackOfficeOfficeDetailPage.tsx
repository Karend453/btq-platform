import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Building2, CreditCard, Users } from "lucide-react";
import { getOfficeById, type Office } from "../../../services/offices";
import {
  formatOfficeRoleLabel,
  getOfficeRosterForOfficeId,
  memberDisplayName,
  type OfficeRosterRow,
} from "../../../services/officeRoster";

function formatAddress(o: Office): string {
  const parts = [
    o.address_line1?.trim(),
    [o.city?.trim(), o.state?.trim()].filter(Boolean).join(", "),
    o.postal_code?.trim(),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

function displayOfficeName(o: Office): string {
  const d = o.display_name?.trim();
  return d || o.name;
}

function dashText(s: string | null | undefined): string {
  const t = typeof s === "string" ? s.trim() : "";
  return t || "—";
}

function formatMoneyCents(
  cents: number | null | undefined,
  currency: string | null | undefined
): string {
  if (cents == null || !Number.isFinite(Number(cents))) return "—";
  const code = (currency?.trim() || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(Number(cents) / 100);
  } catch {
    return `${(Number(cents) / 100).toFixed(2)} ${code}`;
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso.trim());
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function billingStatusBadgeClass(status: string | null | undefined): string {
  const s = (status ?? "").trim().toLowerCase();
  const base =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset";
  if (s === "active") {
    return `${base} bg-emerald-50 text-emerald-800 ring-emerald-600/20`;
  }
  if (s === "past_due") {
    return `${base} bg-amber-50 text-amber-900 ring-amber-600/25`;
  }
  if (
    s === "unpaid" ||
    s === "restricted" ||
    s === "locked" ||
    s === "canceled"
  ) {
    return `${base} bg-red-50 text-red-800 ring-red-600/20`;
  }
  if (!s) {
    return `${base} bg-slate-100 text-slate-600 ring-slate-500/15`;
  }
  return `${base} bg-slate-100 text-slate-700 ring-slate-500/15`;
}

export function BackOfficeOfficeDetailPage() {
  const { officeId: officeIdParam } = useParams<{ officeId: string }>();
  const officeId = officeIdParam?.trim() ?? "";

  const [loading, setLoading] = useState(Boolean(officeId));
  const [office, setOffice] = useState<Office | null>(null);

  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterRows, setRosterRows] = useState<OfficeRosterRow[]>([]);
  const [rosterError, setRosterError] = useState<string | null>(null);

  useEffect(() => {
    if (!officeId) {
      setLoading(false);
      setOffice(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setOffice(null);
    getOfficeById(officeId).then((row) => {
      if (cancelled) return;
      setOffice(row);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [officeId]);

  useEffect(() => {
    if (!office?.id) {
      setRosterLoading(false);
      setRosterRows([]);
      setRosterError(null);
      return;
    }

    let cancelled = false;
    setRosterLoading(true);
    setRosterError(null);
    getOfficeRosterForOfficeId(office.id).then(({ rows, error }) => {
      if (cancelled) return;
      setRosterRows(rows);
      setRosterError(error);
      setRosterLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [office?.id]);

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl">
        <Link
          to="/back-office/org"
          className="mb-6 inline-flex items-center gap-2 text-sm text-indigo-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to org management
        </Link>

        {!officeId && (
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Office details</h1>
            <p className="mt-2 text-slate-600">Missing office id in the URL.</p>
          </div>
        )}

        {officeId && loading && (
          <p className="text-slate-600" role="status">
            Loading office…
          </p>
        )}

        {officeId && !loading && !office && (
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Office not found</h1>
            <p className="mt-2 text-slate-600">
              No office loaded for id <span className="font-mono text-sm">{officeId}</span>. It may
              not exist, or the current user may not be allowed to read it (e.g. RLS on{" "}
              <code className="text-sm">public.offices</code>).
            </p>
          </div>
        )}

        {officeId && !loading && office && (
          <>
            <div className="mb-6 flex items-start gap-3">
              <Building2 className="mt-1 h-8 w-8 shrink-0 text-slate-600" />
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  {displayOfficeName(office)}
                </h1>
                <p className="mt-1 text-sm text-slate-500">Back Office · Read-only</p>
              </div>
            </div>

            <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1 space-y-6">
                <dl className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Record ID
                    </dt>
                    <dd className="mt-1 font-mono text-sm text-slate-900 select-all">{office.id}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Address
                    </dt>
                    <dd className="mt-1 text-slate-800">{formatAddress(office)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Primary contact
                    </dt>
                    <dd className="mt-1 text-slate-800">{office.broker_name?.trim() || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Email
                    </dt>
                    <dd className="mt-1 text-slate-800">{office.broker_email?.trim() || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      State
                    </dt>
                    <dd className="mt-1 text-slate-800">{office.state?.trim() || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      MLS name
                    </dt>
                    <dd className="mt-1 text-slate-800">{office.mls_name?.trim() || "—"}</dd>
                  </div>
                </dl>

                <section
                  className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
                  aria-labelledby="back-office-billing-status-heading"
                >
                  <div className="mb-4 flex items-start gap-2">
                    <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" aria-hidden />
                    <div>
                      <h2
                        id="back-office-billing-status-heading"
                        className="text-lg font-semibold leading-snug text-slate-900"
                      >
                        Billing status
                      </h2>
                      <p className="mt-0.5 text-xs font-normal text-slate-500">Read-only</p>
                    </div>
                  </div>

                  <dl className="space-y-4">
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Billing status (BTQ)
                      </dt>
                      <dd className="mt-1">
                        <span className={billingStatusBadgeClass(office.billing_status)}>
                          {dashText(office.billing_status)}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Stripe subscription status
                      </dt>
                      <dd className="mt-1 text-slate-800">
                        {dashText(office.stripe_subscription_status)}
                      </dd>
                    </div>
                    {office.stripe_subscription_id?.trim() ? (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Stripe subscription ID
                        </dt>
                        <dd className="mt-1 font-mono text-sm text-slate-900 break-all select-all">
                          {office.stripe_subscription_id.trim()}
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Stripe customer ID
                      </dt>
                      <dd className="mt-1 font-mono text-sm text-slate-900 break-all select-all">
                        {dashText(office.stripe_customer_id)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Latest invoice status (Stripe)
                      </dt>
                      <dd className="mt-1 text-slate-800">
                        {dashText(office.stripe_latest_invoice_status)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Amount due
                      </dt>
                      <dd className="mt-1 text-slate-800">
                        {formatMoneyCents(office.billing_amount_due_cents, office.billing_currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Billing currency
                      </dt>
                      <dd className="mt-1 text-slate-800">
                        {dashText(office.billing_currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Last invoice ID (legacy)
                      </dt>
                      <dd className="mt-1 font-mono text-sm text-slate-900 break-all select-all">
                        {dashText(office.billing_last_invoice_id)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Last payment status (legacy)
                      </dt>
                      <dd className="mt-1 text-slate-800">
                        {dashText(office.billing_last_payment_status)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Last payment failed at
                      </dt>
                      <dd className="mt-1 text-slate-800">
                        {formatDateTime(office.billing_last_payment_failed_at)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Last payment succeeded at
                      </dt>
                      <dd className="mt-1 text-slate-800">
                        {formatDateTime(office.billing_last_payment_succeeded_at)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Grace period ends at
                      </dt>
                      <dd className="mt-1 text-slate-800">
                        {office.billing_grace_period_ends_at?.trim()
                          ? formatDateTime(office.billing_grace_period_ends_at)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Restricted at
                      </dt>
                      <dd className="mt-1 text-slate-800">
                        {office.billing_restricted_at?.trim()
                          ? formatDateTime(office.billing_restricted_at)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Locked at
                      </dt>
                      <dd className="mt-1 text-slate-800">
                        {office.billing_locked_at?.trim()
                          ? formatDateTime(office.billing_locked_at)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Admin note
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap text-slate-800">
                        {office.billing_admin_note?.trim() ? office.billing_admin_note.trim() : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Billing updated at
                      </dt>
                      <dd className="mt-1 text-slate-800">
                        {formatDateTime(office.billing_updated_at)}
                      </dd>
                    </div>
                  </dl>
                </section>
              </div>

              <section
                className="mt-0 min-w-0 flex-1 self-start pt-0"
                aria-labelledby="office-roster-heading"
              >
              <div className="mb-3 flex items-start gap-2">
                <Users className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" aria-hidden />
                <h2
                  id="office-roster-heading"
                  className="mt-0 text-lg font-semibold leading-snug text-slate-900"
                >
                  Office roster
                </h2>
                <span className="text-xs font-normal text-slate-500">(read-only)</span>
              </div>

              {rosterLoading && (
                <p className="text-sm text-slate-600" role="status">
                  Loading roster…
                </p>
              )}

              {!rosterLoading && rosterError && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-medium">Could not load roster</p>
                  <p className="mt-1 font-mono text-xs">{rosterError}</p>
                  <p className="mt-2 text-amber-800">
                    If this office should have users, check whether RLS on{" "}
                    <code className="text-xs">public.office_memberships</code> and{" "}
                    <code className="text-xs">public.user_profiles</code> allows your account to read
                    membership rows and joined profiles for this office.
                  </p>
                </div>
              )}

              {!rosterLoading && !rosterError && rosterRows.length === 0 && (
                <p className="text-sm text-slate-600">
                  No active members for this office (<code className="text-xs">office_memberships</code>).
                </p>
              )}

              {!rosterLoading && !rosterError && rosterRows.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-4 py-3" scope="col">
                          Name
                        </th>
                        <th className="px-4 py-3" scope="col">
                          Email
                        </th>
                        <th className="px-4 py-3" scope="col">
                          Role
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rosterRows.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-3 text-slate-900">{memberDisplayName(row)}</td>
                          <td className="break-words px-4 py-3 text-slate-900">
                            {row.email?.trim() || "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-900">
                            {formatOfficeRoleLabel(row.role)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
