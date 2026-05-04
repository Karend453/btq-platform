import type { BackOfficeListOfficeRow } from "../services/offices";
import {
  LIST_PRICE_SEAT_PER_USER_MONTH_USD,
  PLAN_DETAILS,
  resolvePlanKeyFromOfficeFields,
  type PlanKey,
} from "./pricingPlans";

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

function planLabelForOffice(o: BackOfficeListOfficeRow, planKey: PlanKey | null): string {
  const custom = o.display_plan_label?.trim();
  if (custom) return custom;
  if (planKey) return PLAN_DETAILS[planKey].label;
  const tier = o.billing_plan_tier?.trim() || o.plan_tier?.trim();
  return tier || "—";
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

/**
 * Catalog-based expected subscription revenue for active-access offices (see {@link isActiveAccessOffice}).
 * Uses {@link PLAN_DETAILS} base prices + {@link LIST_PRICE_SEAT_PER_USER_MONTH_USD} on **sub-agent**
 * seats only (`billing_seat_quantity` is treated as broker-inclusive).
 */
export function buildBackOfficeRevenueModel(offices: BackOfficeListOfficeRow[]): {
  rows: RevenueModelRowView[];
  totalMonthlyEquivalentUsd: number;
  missingPricingActiveCount: number;
  notes: string[];
} {
  const notes: string[] = [];
  let defaultedCadence = false;

  const activeRows = offices.filter(isActiveAccessOffice);

  if (activeRows.length === 0) {
    return {
      rows: [],
      totalMonthlyEquivalentUsd: 0,
      missingPricingActiveCount: 0,
      notes: [] as string[],
    };
  }

  notes.push(
    "Expected amounts use published list prices plus the add-on seat rate on SubAgents only (Stripe seat total includes the broker/base seat; one seat is excluded from add-on pricing). Annual and quarterly columns assume catalog-linear billing. If billing_seat_quantity is missing, revenue math assumes one broker seat only (0 SubAgents).",
  );

  const views: RevenueModelRowView[] = [];
  let totalMonthlyEquivalentUsd = 0;
  let missingPricingActiveCount = 0;

  for (const o of activeRows) {
    const tierSource = o.billing_plan_tier?.trim() || o.plan_tier?.trim() || "";
    const planKey = resolvePlanKeyFromOfficeFields(tierSource);
    const customPlan = Boolean(o.display_plan_label?.trim());

    const rawCycle = (o.signup_billing_cycle ?? "").trim();
    let cadenceParsed = parseSignupCadence(o.signup_billing_cycle);
    if (cadenceParsed === null && rawCycle === "") {
      cadenceParsed = "monthly";
      defaultedCadence = true;
    }

    const cadenceLabel =
      cadenceParsed != null ? formatCadenceLabel(cadenceParsed) : rawCycle || "—";

    const hasStripeSub = Boolean(o.stripe_subscription_id?.trim());

    let expectedPeriodAmountUsd: number | null = null;
    let monthlyEquivalentUsd: number | null = null;

    const canPrice =
      !customPlan && planKey != null && cadenceParsed != null && hasStripeSub;

    const { label: subAgentsLabel, sortValue: subAgentsSortValue } = subAgentsColumnDisplay(o);

    if (canPrice) {
      const subagents = subagentSeatCountForPricing(o.billing_seat_quantity);
      const monthlyRecurring = monthlyCatalogRecurringUsd(planKey, subagents);
      const { period, monthlyEq } = periodFromCadence(cadenceParsed, monthlyRecurring);
      expectedPeriodAmountUsd = period;
      monthlyEquivalentUsd = monthlyEq;
      totalMonthlyEquivalentUsd += monthlyEq;
    } else {
      missingPricingActiveCount += 1;
    }

    views.push({
      officeId: o.id,
      officeLabel: officeDisplayName(o),
      brokerPrimaryLabel: brokerPrimaryDisplay(o),
      subAgentsLabel,
      subAgentsSortValue,
      planLabel: planLabelForOffice(o, planKey),
      billingCycleLabel: cadenceLabel,
      expectedPeriodAmountUsd,
      monthlyEquivalentUsd,
    });
  }

  if (defaultedCadence) {
    notes.push(
      "Offices with no signup_billing_cycle are treated as monthly for catalog normalization.",
    );
  }

  if (missingPricingActiveCount > 0) {
    notes.push(
      "Some offices missing pricing data — rows show — and are excluded from the income total (custom plans, unknown tiers/cadence, or no Stripe subscription).",
    );
  }

  return {
    rows: views,
    totalMonthlyEquivalentUsd,
    missingPricingActiveCount,
    notes,
  };
}
