import React from "react";
import { Layers } from "lucide-react";
import type { Office } from "../../../services/offices";
import {
  LIST_PRICE_SEAT_PER_USER_MONTH_USD,
  PLAN_DETAILS,
  resolvePlanKeyFromOfficeFields,
} from "../../../lib/pricingPlans";
import { useSettingsProfile } from "./SettingsProfileContext";
import { useOfficeForSettingsTabs } from "./useOfficeForSettingsTabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
      <dt className="text-xs text-slate-500 shrink-0 pt-0.5">{label}</dt>
      <dd className="text-sm text-slate-900 min-w-0 break-words">{value}</dd>
    </div>
  );
}

/** Stripe-ish status strings → title case (e.g. past_due → Past Due). */
function formatBillingStatusLabel(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "—";
  return s
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatUsdPerMonth(amount: number): string {
  try {
    const money = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
    return `${money} / month`;
  } catch {
    return `$${amount} / month`;
  }
}

function formatAppAccessLabel(raw: string | null | undefined): string {
  const k = (raw ?? "").trim().toLowerCase();
  if (k === "active") return "Active";
  if (k === "active_grace") return "Active (grace period)";
  if (k === "suspended") return "Suspended";
  if (!k) return "—";
  return formatBillingStatusLabel(raw);
}

function officeDisplayLine(office: Office): string {
  const name = office.name?.trim();
  if (name) return name;
  const display = office.display_name?.trim();
  return display || "—";
}

const INCLUDED_ITEMS: readonly string[] = [
  "Transaction management",
  "Compliance tracking and review workflow",
  "Document organization and audit trail",
  "Email intake and auto-organization",
  "Office-level oversight",
];

function CurrentPlanFields({ office }: { office: Office }) {
  const tierSource = office.billing_plan_tier?.trim() || office.plan_tier?.trim() || "";
  const planKey = resolvePlanKeyFromOfficeFields(tierSource);
  const details = planKey ? PLAN_DETAILS[planKey] : null;

  const displayOverride = office.display_plan_label?.trim() ?? "";
  const useCustomPlanDisplay = displayOverride.length > 0;

  const hasStripeSub =
    typeof office.stripe_subscription_id === "string" && office.stripe_subscription_id.trim() !== "";

  const statusLabel = hasStripeSub
    ? office.app_access_status?.trim()
      ? formatAppAccessLabel(office.app_access_status)
      : formatBillingStatusLabel(office.billing_status)
    : tierSource
      ? "Pending billing connection"
      : "Not connected";

  const planName = useCustomPlanDisplay
    ? displayOverride
    : details?.label ?? (tierSource ? tierSource : "—");
  const basePrice = details != null ? formatUsdPerMonth(details.pricePerMonth) : "—";

  const billableSeatsValue =
    hasStripeSub && office.billing_seat_quantity != null
      ? String(office.billing_seat_quantity)
      : "—";

  return (
    <div className="space-y-3">
      <dl className="grid gap-3 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-3">
        <ReadonlyField label="Plan" value={planName} />
        {!useCustomPlanDisplay ? (
          <>
            <ReadonlyField label="Base price" value={basePrice} />
            <ReadonlyField label="Status" value={statusLabel} />
            <ReadonlyField label="Billing model" value="Monthly" />
            <ReadonlyField label="Billable seats" value={billableSeatsValue} />
            <ReadonlyField
              label="Seat rate"
              value={`$${LIST_PRICE_SEAT_PER_USER_MONTH_USD} / user / month`}
            />
          </>
        ) : (
          <>
            <ReadonlyField label="Status" value={statusLabel} />
            <ReadonlyField label="Billable seats" value={billableSeatsValue} />
          </>
        )}
      </dl>
      {useCustomPlanDisplay ? (
        <p className="text-xs text-slate-500 leading-relaxed">
          Legacy/custom billing arrangement. See Wallet for current billing details.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Read-only product summary: which Brokerteq package the office is on and what it includes.
 * Plan tier and pricing lines use `offices` plus {@link PLAN_DETAILS}; no Stripe calls in the browser.
 */
export function MySubscriptionsTab() {
  const { profile } = useSettingsProfile();
  const { office } = useOfficeForSettingsTabs(profile?.office_id);

  const loading = office === undefined;

  return (
    <div className="space-y-4">
      {loading ? (
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading…</p>
          </CardContent>
        </Card>
      ) : !office ? (
        <Card className="border-slate-200">
          <CardHeader className="space-y-1">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
                <Layers className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-lg font-semibold leading-snug">My Subscriptions</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 leading-relaxed">
              No office is linked to your account yet. When your brokerage assigns you to an office, your
              package summary will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-slate-200">
            <CardHeader className="space-y-1">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
                  <Layers className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-lg font-semibold leading-snug">My Subscriptions</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 text-sm text-slate-600">
              <p>
                <span className="text-slate-500">Office</span>{" "}
                <span className="font-medium text-slate-900">{officeDisplayLine(office)}</span>
              </p>

              <div className="space-y-3 border-t border-slate-100 pt-5">
                <h3 className="text-base font-semibold text-slate-900">Current plan</h3>
                <p className="text-slate-600 leading-relaxed">
                  Snapshot from your office record (updated when your subscription changes).
                </p>
                <CurrentPlanFields office={office} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="text-base font-semibold text-slate-900">What&apos;s included</CardTitle>
              <CardDescription className="text-slate-600 text-sm">
                Core capabilities included with your Brokerteq back office.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700 leading-relaxed">
                {INCLUDED_ITEMS.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="text-base font-semibold text-slate-900">Team seats</CardTitle>
              <CardDescription className="text-slate-600 text-sm">
                Add-on seats for agents and admins beyond your base package.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700 leading-relaxed">
              <p>
                Both agents and admins count toward billable seats when billing is live.
              </p>
              <p className="text-slate-600">
                Seat changes are made in Team Management and take effect on your next billing cycle.
              </p>
            </CardContent>
          </Card>

          <p className="text-sm text-slate-500 leading-relaxed px-0.5">
            Need a different setup? Contact Brokerteq at{" "}
            <a
              href="mailto:support@brokerteq.com"
              className="whitespace-nowrap text-slate-500 underline-offset-2 hover:underline"
            >
              support@brokerteq.com
            </a>
            .
          </p>
        </>
      )}
    </div>
  );
}
