export type BillingPlanKey = "core" | "growth" | "pro";

/** Billing cadence for the base plan line item. Seats are always monthly. */
export type BillingCycle = "monthly" | "annual";

/** Wire/API plan keys sent from broker checkout UI and create-checkout-session. */
export type BrokerPlanKey =
  | "broker_core_monthly"
  | "broker_growth_monthly"
  | "broker_pro_monthly";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

/**
 * Returns the Stripe base-plan price id for `plan` at the given `billing` cadence.
 * Defaults to monthly to preserve prior call-site behavior.
 */
export function getPlanPriceId(
  plan: BillingPlanKey,
  billing: BillingCycle = "monthly"
): string {
  const annual = billing === "annual";
  switch (plan) {
    case "core":
      return requireEnv(annual ? "STRIPE_PRICE_CORE_ANNUAL" : "STRIPE_PRICE_CORE");
    case "growth":
      return requireEnv(annual ? "STRIPE_PRICE_GROWTH_ANNUAL" : "STRIPE_PRICE_GROWTH");
    case "pro":
      return requireEnv(annual ? "STRIPE_PRICE_PRO_ANNUAL" : "STRIPE_PRICE_PRO");
    default:
      throw new Error(`Unsupported billing plan: ${plan}`);
  }
}

/**
 * BTQ Paid Seat Monthly price id (must match Stripe Dashboard).
 * **Required** in any environment where Checkout seat line items or Team Management seat sync runs.
 * There is no runtime fallback: a wrong or missing value would charge the wrong product or fail closed.
 */
export function getSeatPriceId(): string {
  return requireEnv("STRIPE_PRICE_SEAT");
}

export function getBrokerPlanPriceId(
  plan: BrokerPlanKey,
  billing: BillingCycle = "monthly"
): string {
  switch (plan) {
    case "broker_core_monthly":
      return getPlanPriceId("core", billing);
    case "broker_growth_monthly":
      return getPlanPriceId("growth", billing);
    case "broker_pro_monthly":
      return getPlanPriceId("pro", billing);
    default: {
      const _exhaustive: never = plan;
      return _exhaustive;
    }
  }
}