import React, { useEffect, useState } from "react";
import { AlertCircle, CreditCard, Wallet } from "lucide-react";
import {
  createBillingPortalSession,
  getWalletBillingSummary,
} from "../../../services/officeAgentsBilling";
import type { WalletBillingSummary } from "../../../types/billing";
import type { Office } from "../../../services/offices";
import { getUserDisplayName, useAuth } from "../../contexts/AuthContext";
import { useSettingsProfile } from "./SettingsProfileContext";
import { useOfficeForSettingsTabs } from "./useOfficeForSettingsTabs";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

function ReadonlyField({
  label,
  value,
  nowrapValue = false,
}: {
  label: string;
  value: string | null | undefined;
  nowrapValue?: boolean;
}) {
  const display = value?.trim() ? value : "—";
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
      <dt className="text-xs text-slate-500 shrink-0 pt-0.5">{label}</dt>
      <dd
        className={`text-sm text-slate-900 min-w-0 ${nowrapValue ? "whitespace-nowrap" : "break-words"}`}
      >
        {display}
      </dd>
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

function formatMoney(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "—";
  const code = (currency?.trim() || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

function formatDateIso(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(d);
  } catch {
    return "—";
  }
}

/** Stripe subscription.status → title-style words (e.g. past_due → Past Due). */
function formatSubscriptionStatus(raw: string): string {
  const s = raw.trim();
  if (!s) return "—";
  return s
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Broker wallet: account from BTQ; billing summary and payment method from Stripe (server-backed).
 */
export function MyWalletTab() {
  const { user, loading: authLoading } = useAuth();
  const { profile } = useSettingsProfile();
  const { office } = useOfficeForSettingsTabs(profile?.office_id);
  const isBtqAdmin = (profile?.role ?? "").trim().toLowerCase() === "btq_admin";
  const [wallet, setWallet] = useState<WalletBillingSummary | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalNotice, setPortalNotice] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (isBtqAdmin && office === undefined) return;
    let cancelled = false;
    setWalletLoading(true);
    setWalletError(null);
    const readOfficeId = isBtqAdmin ? office?.id ?? null : undefined;
    getWalletBillingSummary(readOfficeId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setWallet(null);
        setWalletError(result.error);
        setWalletLoading(false);
        return;
      }
      setWallet(result.data);
      setWalletLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, isBtqAdmin, office]);

  const loading = authLoading || office === undefined;
  const profileDisplayName = profile?.display_name?.trim();
  const displayName =
    profileDisplayName && profileDisplayName !== "" ? profileDisplayName : getUserDisplayName(user);
  const email = profile?.email?.trim() || user?.email?.trim() || null;
  const roleDisplay = roleLabelForDisplay(profile?.role);
  const officeName = office ? officeLabelForDisplay(office) : null;

  async function handleUpdatePaymentMethod() {
    if (portalBusy) return;
    setPortalNotice(null);
    setPortalBusy(true);
    let navigatingAway = false;
    try {
      const result = await createBillingPortalSession();
      if (!result.ok) {
        setPortalNotice(result.error);
        return;
      }
      navigatingAway = true;
      window.location.assign(result.data.url);
    } catch {
      setPortalNotice("Could not reach billing. Check your connection and try again.");
    } finally {
      if (!navigatingAway) setPortalBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {portalNotice ? (
        <Alert variant="default" className="border-slate-200 bg-slate-50/80">
          <AlertCircle className="h-4 w-4 text-slate-600" aria-hidden />
          <AlertTitle className="text-slate-800">Could not open billing portal</AlertTitle>
          <AlertDescription className="text-slate-600">{portalNotice}</AlertDescription>
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
                  Your profile and office in BTQ.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            {loading ? (
              <p className="text-slate-500">Loading…</p>
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
                  <ReadonlyField label="Email" value={email} nowrapValue />
                  <ReadonlyField label="Role" value={roleDisplay} />
                </dl>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader className="space-y-1">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
                <CreditCard className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-lg font-semibold leading-snug">Billing</CardTitle>
                <CardDescription className="text-slate-600 text-sm leading-relaxed">
                  {isBtqAdmin
                    ? "Subscription details from Stripe for the office selected in the dashboard (read-only)."
                    : "Subscription details from Stripe. Update your payment method in the secure Stripe portal."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 text-sm text-slate-600">
            {walletLoading ? (
              <p className="text-slate-500">Loading billing information…</p>
            ) : walletError ? (
              <p className="text-slate-600" role="status">
                {walletError}
              </p>
            ) : wallet && !wallet.connected ? (
              <p className="text-slate-600">Billing is not connected yet.</p>
            ) : wallet?.connected ? (
              <>
                <dl className="grid gap-3 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-3">
                  <ReadonlyField label="Plan" value={wallet.planName} />
                  <ReadonlyField
                    label="Subscription status"
                    value={formatSubscriptionStatus(wallet.subscriptionStatus)}
                  />
                  <ReadonlyField label="Next billing date" value={formatDateIso(wallet.nextBillingDate)} />
                  <ReadonlyField
                    label="Monthly total"
                    value={`${formatMoney(wallet.monthlyTotal, wallet.currency)}/mo`}
                  />
                  <div className="sm:col-span-2">
                    <ReadonlyField label="Billable seats" value={String(wallet.seatCount)} />
                  </div>
                </dl>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Seat changes apply to your next billing cycle.
                </p>
                {!isBtqAdmin ? (
                  <div className="pt-1">
                    <Button
                      type="button"
                      onClick={() => void handleUpdatePaymentMethod()}
                      disabled={portalBusy}
                      aria-busy={portalBusy}
                    >
                      {portalBusy ? "Opening…" : "Update payment method"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 leading-relaxed pt-1">
                    Payment method and plan changes use the broker&apos;s Stripe billing portal and are
                    not available in BTQ Admin view.
                  </p>
                )}
              </>
            ) : (
              <p className="text-slate-600">No billing data available.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
