import React, { useEffect, useState } from "react";
import { AlertCircle, CreditCard, FileText, Receipt, Wallet } from "lucide-react";
import {
  createBillingPortalSession,
  getOfficeBilling,
  type OfficeBillingView,
} from "../../../services/officeAgentsBilling";
import { getOfficeById, type Office } from "../../../services/offices";
import { getUserDisplayName, useAuth } from "../../contexts/AuthContext";
import { useSettingsProfile } from "./SettingsProfileContext";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Separator } from "../../components/ui/separator";

function ReadonlyField({ label, value }: { label: string; value: string | null | undefined }) {
  const display = value?.trim() ? value : "—";
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
      <dt className="text-xs text-slate-500 shrink-0 pt-0.5">{label}</dt>
      <dd className="text-sm text-slate-900 min-w-0 break-words">{display}</dd>
    </div>
  );
}

function roleLabelForDisplay(raw: string | null | undefined): string {
  const r = (raw ?? "").trim().toLowerCase();
  if (r === "admin") return "Admin";
  if (r === "agent") return "Agent";
  if (r === "broker") return "Broker";
  return "—";
}

function officeLabelForDisplay(office: Office | null): string | null {
  if (!office) return null;
  const name = office.name?.trim();
  if (name) return name;
  const display = office.display_name?.trim();
  return display || null;
}

function formatSeats(used: number | null, included: number | null): string {
  if (used == null && included == null) return "—";
  const u = used != null ? String(used) : "—";
  const i = included != null ? String(included) : "—";
  return `${u} / ${i} (used / included)`;
}

/**
 * Broker wallet: identity from existing services; billing sections from {@link getOfficeBilling} (mock until backend).
 */
export function MyWalletTab() {
  const { user, loading: authLoading } = useAuth();
  const { profile } = useSettingsProfile();
  const [office, setOffice] = useState<Office | null | undefined>(undefined);
  const [billing, setBilling] = useState<OfficeBillingView | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalNotice, setPortalNotice] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const oid = profile?.office_id?.trim();
    if (!oid) {
      setOffice(null);
      return () => {
        cancelled = true;
      };
    }
    getOfficeById(oid).then((o) => {
      if (!cancelled) setOffice(o);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, profile?.office_id]);

  useEffect(() => {
    if (authLoading || office === undefined) return;
    let cancelled = false;
    const oid = office?.id?.trim();
    if (!oid) {
      setBilling(null);
      setBillingError(null);
      setBillingLoading(false);
      return;
    }
    setBillingLoading(true);
    setBillingError(null);
    getOfficeBilling(oid).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setBilling(null);
        setBillingError(result.error);
        setBillingLoading(false);
        return;
      }
      setBilling(result.data);
      setBillingLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, office]);

  const loading = authLoading || office === undefined;
  const profileDisplayName = profile?.display_name?.trim();
  const displayName =
    profileDisplayName && profileDisplayName !== "" ? profileDisplayName : getUserDisplayName(user);
  const email = profile?.email?.trim() || user?.email?.trim() || null;
  const roleDisplay = roleLabelForDisplay(profile?.role);
  const officeName = office ? officeLabelForDisplay(office) : null;

  async function handleManageBilling() {
    const oid = office?.id?.trim();
    if (!oid) return;
    setPortalNotice(null);
    setPortalBusy(true);
    const result = await createBillingPortalSession(oid);
    setPortalBusy(false);
    if (!result.ok) {
      setPortalNotice(result.error);
      return;
    }
    const { url, unavailableReason } = result.data;
    if (url) {
      window.location.assign(url);
      return;
    }
    setPortalNotice(unavailableReason ?? "Billing portal is not available.");
  }

  return (
    <div className="space-y-4">
      {portalNotice ? (
        <Alert>
          <AlertCircle className="h-4 w-4" aria-hidden />
          <AlertTitle>Billing portal</AlertTitle>
          <AlertDescription>{portalNotice}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <Card className="border-slate-200 lg:col-span-1">
          <CardHeader className="space-y-1">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
                <Wallet className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-lg font-semibold leading-snug">Account</CardTitle>
                <CardDescription className="text-slate-600 text-sm leading-relaxed">
                  Your profile and office link (unchanged from BTQ records).
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            {loading ? (
              <p className="text-slate-600">Loading…</p>
            ) : (
              <>
                <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-3.5 space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Signed in as</p>
                  <p className="text-lg font-semibold text-slate-900 leading-snug">
                    {displayName?.trim() ? displayName : "—"}
                  </p>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                    <span className="text-xs text-slate-500 shrink-0">Office</span>
                    <span className="font-medium text-slate-900 min-w-0 break-words">
                      {officeName?.trim() ? officeName : "—"}
                    </span>
                  </div>
                </div>
                <dl className="space-y-2.5">
                  <ReadonlyField label="Email" value={email} />
                  <ReadonlyField label="Role" value={roleDisplay} />
                </dl>
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card className="border-slate-200">
            <CardHeader className="space-y-1">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
                  <Receipt className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-lg font-semibold leading-snug">Broker plan</CardTitle>
                  <CardDescription className="text-slate-600 text-sm leading-relaxed">
                    Preview layout — not live subscription data until billing is connected.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-slate-600 space-y-2">
              {billingLoading ? (
                <p className="text-slate-600">Loading billing preview…</p>
              ) : billingError ? (
                <p className="text-destructive text-sm" role="alert">
                  {billingError}
                </p>
              ) : billing ? (
                <>
                  <p className="font-medium text-slate-900">{billing.brokerPlanLabel}</p>
                  {billing.brokerPlanDetail ? (
                    <p className="leading-relaxed text-slate-600">{billing.brokerPlanDetail}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-slate-600">Link an office to see plan information.</p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Seat count</CardTitle>
                <CardDescription className="text-xs">Billable seats (preview)</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-slate-600 space-y-2">
                {billingLoading ? (
                  <p>Loading…</p>
                ) : billing ? (
                  <>
                    <p className="text-lg font-semibold text-slate-900 tabular-nums">
                      {formatSeats(billing.usedSeats, billing.includedSeats)}
                    </p>
                    {billing.seatNote ? <p className="text-xs leading-relaxed">{billing.seatNote}</p> : null}
                  </>
                ) : (
                  <p>—</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Estimated billing summary</CardTitle>
                <CardDescription className="text-xs">Not a quote or invoice</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-slate-600 space-y-2">
                {billingLoading ? (
                  <p>Loading…</p>
                ) : billing ? (
                  <>
                    <p className="text-lg font-semibold text-slate-900">{billing.estimatedTotalLabel}</p>
                    {billing.estimatedDetail ? (
                      <p className="text-xs leading-relaxed">{billing.estimatedDetail}</p>
                    ) : null}
                  </>
                ) : (
                  <p>—</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200">
            <CardHeader className="space-y-1">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
                  <CreditCard className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-lg font-semibold leading-snug">Payment &amp; subscription</CardTitle>
                  <CardDescription className="text-slate-600 text-sm leading-relaxed">
                    Stripe Customer Portal will appear here when connected.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-600">
              {billingLoading ? (
                <p>Loading…</p>
              ) : billing ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Payment method</p>
                    <p className="text-slate-900">{billing.paymentMethodSummary}</p>
                  </div>
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Subscription status
                    </p>
                    <p className="font-medium text-slate-900">{billing.subscriptionStatusLabel}</p>
                    {billing.subscriptionStatusDetail ? (
                      <p className="text-xs leading-relaxed">{billing.subscriptionStatusDetail}</p>
                    ) : null}
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Extra line items (read-only)
                    </p>
                    <ul className="rounded-md border border-slate-100 divide-y divide-slate-100">
                      {billing.extraLineItems.map((row) => (
                        <li
                          key={row.label}
                          className="flex flex-col sm:flex-row sm:justify-between gap-1 px-3 py-2.5"
                        >
                          <span className="text-slate-700">{row.label}</span>
                          <span className="text-slate-900 sm:text-right">{row.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p>—</p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center pt-2">
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={() => void handleManageBilling()}
                  disabled={portalBusy || !office?.id || billingLoading}
                >
                  {portalBusy ? "Working…" : "Manage Billing"}
                </Button>
                <Button variant="outline" className="w-full sm:w-auto" asChild>
                  <a
                    href="mailto:billing@brokerteq.com?subject=Billing%20inquiry"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Contact Billing Support
                  </a>
                </Button>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Manage Billing will open the Stripe portal when your workspace is connected. Until then,
                you&apos;ll see a short notice instead.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="space-y-1">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
              <FileText className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg font-semibold leading-snug">Invoices &amp; history</CardTitle>
              <CardDescription className="text-slate-700 text-base leading-relaxed">
                Not connected yet.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center">
            <p className="font-medium text-slate-800">No invoices to show</p>
            <p className="mt-2 text-slate-600 leading-relaxed max-w-md mx-auto">
              When your organization has billable activity in BTQ, invoices and payment history will appear
              here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
