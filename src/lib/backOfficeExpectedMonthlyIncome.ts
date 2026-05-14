import type { BackOfficeListOfficeRow } from "../services/offices";
import { displayOfficePlanLabel } from "./pricingPlans";

/**
 * Back Office Revenue view-model. **Stripe is the only source of truth** for the monthly
 * revenue number — see `offices.billing_monthly_amount_cents` (webhook-maintained by
 * `api/billing/webhook.ts`, same value Settings → My Wallet renders). There is intentionally
 * NO internal pricing model in this file: when an office has no Stripe subscription, its
 * revenue is `null` and renders as "—".
 */
export type RevenueModelRowView = {
  officeId: string;
  officeLabel: string;
  brokerPrimaryLabel: string;
  /** Sub-agent add-on seats (total Stripe seats minus broker/base); "—" when unknown. */
  subAgentsLabel: string;
  /** Sub-agent count for sorting; null when {@link subAgentsLabel} is — (missing sorts last). */
  subAgentsSortValue: number | null;
  planLabel: string;
  billingCycleLabel: string;
  /** Stripe-derived recurring monthly amount in USD, or null when no Stripe subscription. */
  monthlyRevenueUsd: number | null;
};

type ParsedCadence = "monthly" | "annual" | "quarterly";

function parseSignupCadence(raw: string | null | undefined): ParsedCadence | null {
  const k = (raw ?? "").trim().toLowerCase();
  if (!k) return null;
  if (k === "monthly" || k === "month") return "monthly";
  if (k === "annual" || k === "yearly" || k === "year") return "annual";
  if (k === "quarterly" || k === "quarter") return "quarterly";
  return null;
}

function formatCadenceLabel(c: ParsedCadence): string {
  switch (c) {
    case "monthly":
      return "Monthly";
    case "annual":
      return "Annual";
    case "quarterly":
      return "Quarterly";
  }
}

/** Offices that should contribute to Business Overview revenue (not suspended). */
export function isActiveAccessOffice(o: BackOfficeListOfficeRow): boolean {
  const access = (o.app_access_status ?? "").trim().toLowerCase();
  if (access === "suspended") return false;
  if (access === "active" || access === "active_grace") return true;
  /** Older `list_offices_for_back_office` payloads omitted this column; DB default is active. */
  return access === "";
}

function brokerPrimaryDisplay(o: BackOfficeListOfficeRow): string {
  const name = o.broker_name?.trim();
  if (name) return name;
  const email = o.broker_email?.trim();
  if (email) return email;
  return "—";
}

function subAgentsColumnDisplay(o: BackOfficeListOfficeRow): {
  label: string;
  sortValue: number | null;
} {
  const raw = o.billing_seat_quantity;
  if (raw == null || raw === undefined) {
    return { label: "—", sortValue: null };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return { label: "—", sortValue: null };
  }
  /** `billing_seat_quantity` is broker-inclusive; the SubAgents column reports add-on seats only. */
  const sub = Math.max(Math.trunc(n) - 1, 0);
  return { label: String(sub), sortValue: sub };
}

function officeDisplayName(o: BackOfficeListOfficeRow): string {
  return o.display_name?.trim() || o.name?.trim() || "—";
}

/**
 * Returns USD-major-units when:
 *   - the office has an attached Stripe subscription,
 *   - `billing_monthly_amount_cents` is a finite integer (webhook has populated it), and
 *   - `billing_currency` is USD.
 * Non-USD currencies and missing snapshots return null and the row shows "—".
 */
function stripeMonthlyRevenueUsd(o: BackOfficeListOfficeRow): number | null {
  if (!o.stripe_subscription_id?.trim()) return null;
  const cents = o.billing_monthly_amount_cents;
  if (cents == null || !Number.isFinite(cents)) return null;
  const currency = (o.billing_currency ?? "usd").trim().toLowerCase();
  if (currency !== "usd") return null;
  return cents / 100;
}

/**
 * Builds the Business Overview "Revenue" table from `offices` rows. Stripe-only; no
 * internal plan/seat math. Offices without a Stripe subscription show "—" and contribute
 * 0 to the total.
 */
export function buildBackOfficeRevenueModel(offices: BackOfficeListOfficeRow[]): {
  rows: RevenueModelRowView[];
  totalMonthlyRevenueUsd: number;
} {
  const activeRows = offices.filter(isActiveAccessOffice);
  if (activeRows.length === 0) {
    return { rows: [], totalMonthlyRevenueUsd: 0 };
  }

  const views: RevenueModelRowView[] = [];
  let totalMonthlyRevenueUsd = 0;

  for (const o of activeRows) {
    const rawCycle = (o.signup_billing_cycle ?? "").trim();
    const cadenceParsed = parseSignupCadence(o.signup_billing_cycle);
    const cadenceLabel =
      cadenceParsed != null ? formatCadenceLabel(cadenceParsed) : rawCycle || "—";

    const { label: subAgentsLabel, sortValue: subAgentsSortValue } = subAgentsColumnDisplay(o);

    const monthlyRevenueUsd = stripeMonthlyRevenueUsd(o);
    if (monthlyRevenueUsd != null) {
      totalMonthlyRevenueUsd += monthlyRevenueUsd;
    }

    views.push({
      officeId: o.id,
      officeLabel: officeDisplayName(o),
      brokerPrimaryLabel: brokerPrimaryDisplay(o),
      subAgentsLabel,
      subAgentsSortValue,
      planLabel: displayOfficePlanLabel(o) || "—",
      billingCycleLabel: cadenceLabel,
      monthlyRevenueUsd,
    });
  }

  return { rows: views, totalMonthlyRevenueUsd };
}
