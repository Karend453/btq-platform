import type { BrokerPlanKey } from "./stripePrices";

/** Marketing / signup: Brokerteq package tiers (see Pricing page). */
export type PlanKey = "core" | "growth" | "pro";

/** Map marketing tier → Stripe `BrokerPlanKey` for `createBrokerCheckout`. */
export function planKeyToBrokerPlanKey(plan: PlanKey): BrokerPlanKey {
  switch (plan) {
    case "core":
      return "broker_core_monthly";
    case "growth":
      return "broker_growth_monthly";
    case "pro":
      return "broker_pro_monthly";
    default: {
      const _exhaustive: never = plan;
      return _exhaustive;
    }
  }
}

export const PLAN_ORDER: PlanKey[] = ["core", "growth", "pro"];

/** Listed add-on seat rate (USD / seat / month), aligned with subscriptions UI copy. */
export const LIST_PRICE_SEAT_PER_USER_MONTH_USD = 20;

export const PLAN_DETAILS: Record<
  PlanKey,
  { label: string; pricePerMonth: number; tagline: string }
> = {
  core: {
    label: "Core",
    pricePerMonth: 299,
    tagline: "For independent brokerages building a stronger back office foundation.",
  },
  growth: {
    label: "Growth",
    pricePerMonth: 350,
    tagline: "For brokerages ready to scale lead generation and support.",
  },
  pro: {
    label: "Pro",
    pricePerMonth: 499,
    tagline: "For teams and brokerages that need advanced oversight and flexibility.",
  },
};

export function parsePlanKey(raw: string | null | undefined): PlanKey | null {
  const k = (raw ?? "").trim().toLowerCase();
  if (k === "core" || k === "growth" || k === "pro") return k;
  return null;
}

/**
 * Resolves marketing {@link PlanKey} from `offices.plan_tier` / `offices.billing_plan_tier`.
 * Stripe checkout stores `broker_*_monthly` in metadata; signup may store short keys.
 */
export function resolvePlanKeyFromOfficeFields(raw: string | null | undefined): PlanKey | null {
  const direct = parsePlanKey(raw);
  if (direct) return direct;
  const k = (raw ?? "").trim().toLowerCase();
  if (k === "broker_core_monthly") return "core";
  if (k === "broker_growth_monthly") return "growth";
  if (k === "broker_pro_monthly") return "pro";
  return null;
}

/**
 * Human-readable plan label for back-office tables. Prefer `display_plan_label` when set;
 * otherwise resolve `billing_plan_tier` / `plan_tier` / Stripe plan keys (e.g. `broker_core_monthly`)
 * via {@link PLAN_DETAILS}, or `"Custom"` when a tier string is present but unmapped.
 */
export function displayOfficePlanLabel(office: {
  display_plan_label?: string | null;
  billing_plan_tier?: string | null;
  plan_tier?: string | null;
}): string {
  const labeled = office.display_plan_label?.trim();
  if (labeled) return labeled;

  const billingTier = office.billing_plan_tier?.trim() || "";
  const planTier = office.plan_tier?.trim() || "";

  const fromRaw = (raw: string): string | null => {
    if (!raw) return null;
    const pk = resolvePlanKeyFromOfficeFields(raw);
    return pk ? PLAN_DETAILS[pk].label : null;
  };

  const fromBilling = fromRaw(billingTier);
  if (fromBilling) return fromBilling;

  const fromPlan = fromRaw(planTier);
  if (fromPlan) return fromPlan;

  if (billingTier || planTier) return "Custom";

  return "";
}
