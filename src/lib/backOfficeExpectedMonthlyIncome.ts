import type { BackOfficeListOfficeRow } from "../services/offices";
import {
  LIST_PRICE_SEAT_PER_USER_MONTH_USD,
  PLAN_DETAILS,
  displayOfficePlanLabel,
  resolvePlanKeyFromOfficeFields,
  type PlanKey,
} from "./pricingPlans";

/**
 * Source the `monthlyEquivalentUsd` value resolved from for a row. Stripe is authoritative;
 * the catalog source is only used as a modeled fallback for offices without a Stripe-derived amount.
 */
export type MonthlyRevenueSource = "stripe" | "catalog_model" | "none";

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
  expectedPeriodAmountUsd: number | null;
  monthlyEquivalentUsd: number | null;
  /** Where {@link monthlyEquivalentUsd} came from. UI may show a small marker for "catalog_model". */
  monthlyEquivalentSource: MonthlyRevenueSource;
  /**
   * Catalog-derived monthly value for audit/comparison even when Stripe drives the display.
   * Null when no plan/cadence is resolvable (e.g. custom plans). Not summed into table totals.
   */
  catalogModeledMonthlyUsd: number | null;
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

/** Offices that should contribute to Business Overview revenue modeling (not suspended). */
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

/**
 * `billing_seat_quantity` is broker-inclusive. For pricing: null → assume 1 total seat (broker only).
 */
function brokerInclusiveSeatTotal(raw: number | null | undefined): number {
  if (raw == null || raw === undefined) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.trunc(n);
}

/** Add-on seats billed at LIST_PRICE_SEAT_PER_USER_MONTH_USD (excludes broker/base seat). */
function subagentSeatCountForPricing(raw: number | null | undefined): number {
  return Math.max(brokerInclusiveSeatTotal(raw) - 1, 0);
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
  const sub = Math.max(Math.trunc(n) - 1, 0);
  return { label: String(sub), sortValue: sub };
}

function officeDisplayName(o: BackOfficeListOfficeRow): string {
  return o.display_name?.trim() || o.name?.trim() || "—";
}

function monthlyCatalogRecurringUsd(planKey: PlanKey, subagentSeatCount: number): number {
  const base = PLAN_DETAILS[planKey].pricePerMonth;
  const addOn =
    Number.isFinite(subagentSeatCount) && subagentSeatCount > 0
      ? Math.trunc(subagentSeatCount)
      : 0;
  return base + addOn * LIST_PRICE_SEAT_PER_USER_MONTH_USD;
}

function periodFromCadence(
  cadence: ParsedCadence,
  monthlyRecurring: number
): { period: number; monthlyEq: number } {
  switch (cadence) {
    case "monthly":
      return { period: monthlyRecurring, monthlyEq: monthlyRecurring };
    case "annual":
      return { period: monthlyRecurring * 12, monthlyEq: monthlyRecurring };
    case "quarterly":
      return { period: monthlyRecurring * 3, monthlyEq: monthlyRecurring };
  }
}

/** USD assumption: convert minor units (cents) → major dollars. Currency mixing is out of scope. */
function centsToUsdMajor(cents: number): number {
  return cents / 100;
}

/**
 * Builds the Back Office revenue table. **Stripe is the source of truth** for the
 * displayed monthly amount whenever an office has `billing_monthly_amount_cents` from a
 * Stripe subscription (webhook-maintained). The catalog model (`PLAN_DETAILS` +
 * `LIST_PRICE_SEAT_PER_USER_MONTH_USD`) is only used:
 *   - as a `monthlyEquivalentUsd` *fallback* for legacy/non-Stripe offices, and
 *   - as a separate `catalogModeledMonthlyUsd` for admin audit/comparison (never summed).
 *
 * Custom plans (those with `display_plan_label`) now display their real Stripe-derived
 * amount when a subscription exists. They only render `—` when there is no Stripe linkage.
 */
export function buildBackOfficeRevenueModel(offices: BackOfficeListOfficeRow[]): {
  rows: RevenueModelRowView[];
  totalMonthlyEquivalentUsd: number;
  missingPricingActiveCount: number;
  notes: string[];
} {
  const notes: string[] = [];
  let defaultedCadence = false;
  let anyCatalogFallbackUsed = false;
  let anyStripeUsed = false;

  const activeRows = offices.filter(isActiveAccessOffice);

  if (activeRows.length === 0) {
    return {
      rows: [],
      totalMonthlyEquivalentUsd: 0,
      missingPricingActiveCount: 0,
      notes: [] as string[],
    };
  }

  const views: RevenueModelRowView[] = [];
  let totalMonthlyEquivalentUsd = 0;
  let missingPricingActiveCount = 0;

  for (const o of activeRows) {
    const tierSource = o.billing_plan_tier?.trim() || o.plan_tier?.trim() || "";
    const planKey = resolvePlanKeyFromOfficeFields(tierSource);

    const rawCycle = (o.signup_billing_cycle ?? "").trim();
    let cadenceParsed = parseSignupCadence(o.signup_billing_cycle);
    if (cadenceParsed === null && rawCycle === "") {
      cadenceParsed = "monthly";
      defaultedCadence = true;
    }

    const cadenceLabel =
      cadenceParsed != null ? formatCadenceLabel(cadenceParsed) : rawCycle || "—";

    const hasStripeSub = Boolean(o.stripe_subscription_id?.trim());

    /**
     * Catalog-modeled monthly amount (audit value). Computed independently of display:
     * always present for resolvable plan+cadence combinations, regardless of plan-label.
     */
    let catalogModeledMonthlyUsd: number | null = null;
    if (planKey != null && cadenceParsed != null) {
      const subagents = subagentSeatCountForPricing(o.billing_seat_quantity);
      const monthlyRecurring = monthlyCatalogRecurringUsd(planKey, subagents);
      const { monthlyEq } = periodFromCadence(cadenceParsed, monthlyRecurring);
      catalogModeledMonthlyUsd = monthlyEq;
    }

    /**
     * Stripe-derived monthly amount in USD (authoritative). Requires the office to have:
     *   - an attached Stripe subscription (linkage check),
     *   - a webhook-populated `billing_monthly_amount_cents`,
     *   - currency consistent with USD aggregation (we only sum USD into the table total).
     */
    const stripeUsdMonthly: number | null = (() => {
      if (!hasStripeSub) return null;
      const cents = o.billing_monthly_amount_cents;
      if (cents == null || !Number.isFinite(cents)) return null;
      const currency = (o.billing_currency ?? "usd").trim().toLowerCase();
      if (currency !== "usd") return null;
      return centsToUsdMajor(cents);
    })();

    const { label: subAgentsLabel, sortValue: subAgentsSortValue } = subAgentsColumnDisplay(o);

    let monthlyEquivalentUsd: number | null = null;
    let monthlyEquivalentSource: MonthlyRevenueSource = "none";
    let expectedPeriodAmountUsd: number | null = null;

    if (stripeUsdMonthly != null) {
      monthlyEquivalentUsd = stripeUsdMonthly;
      monthlyEquivalentSource = "stripe";
      /**
       * Period column reflects cadence-billed amount: monthly → monthly, annual → ×12, etc.
       * We compute it from the Stripe-actual monthly so it stays consistent with display.
       */
      if (cadenceParsed != null) {
        expectedPeriodAmountUsd = periodFromCadence(cadenceParsed, stripeUsdMonthly).period;
      } else {
        expectedPeriodAmountUsd = stripeUsdMonthly;
      }
      totalMonthlyEquivalentUsd += stripeUsdMonthly;
      anyStripeUsed = true;
    } else if (
      catalogModeledMonthlyUsd != null &&
      cadenceParsed != null &&
      !o.display_plan_label?.trim()
    ) {
      /**
       * Modeled fallback: only used when Stripe is unavailable AND the office is on a
       * named plan (not a `display_plan_label` custom arrangement). We refuse to invent
       * a number for custom-plan offices that have no Stripe linkage.
       */
      const { period, monthlyEq } = periodFromCadence(cadenceParsed, catalogModeledMonthlyUsd);
      monthlyEquivalentUsd = monthlyEq;
      monthlyEquivalentSource = "catalog_model";
      expectedPeriodAmountUsd = period;
      totalMonthlyEquivalentUsd += monthlyEq;
      anyCatalogFallbackUsed = true;
    } else {
      missingPricingActiveCount += 1;
    }

    views.push({
      officeId: o.id,
      officeLabel: officeDisplayName(o),
      brokerPrimaryLabel: brokerPrimaryDisplay(o),
      subAgentsLabel,
      subAgentsSortValue,
      planLabel: displayOfficePlanLabel(o) || "—",
      billingCycleLabel: cadenceLabel,
      expectedPeriodAmountUsd,
      monthlyEquivalentUsd,
      monthlyEquivalentSource,
      catalogModeledMonthlyUsd,
    });
  }

  if (anyStripeUsed) {
    notes.push(
      "Monthly Revenue uses Stripe-derived recurring totals (sum of subscription line items) " +
        "as the source of truth — same value Settings → My Wallet displays for each office.",
    );
  }

  if (anyCatalogFallbackUsed) {
    notes.push(
      "Offices without Stripe-derived amounts fall back to a catalog model (published plan price " +
        "+ $" +
        LIST_PRICE_SEAT_PER_USER_MONTH_USD +
        "/SubAgent/mo). These rows are an estimate, not an actual bill.",
    );
  }

  if (defaultedCadence) {
    notes.push(
      "Offices with no signup_billing_cycle are treated as monthly for catalog normalization.",
    );
  }

  if (missingPricingActiveCount > 0) {
    notes.push(
      "Some offices have no Stripe subscription and no resolvable catalog plan — those rows " +
        "show — and are excluded from the total.",
    );
  }

  return {
    rows: views,
    totalMonthlyEquivalentUsd,
    missingPricingActiveCount,
    notes,
  };
}
