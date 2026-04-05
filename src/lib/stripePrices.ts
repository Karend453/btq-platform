export type BillingPlanKey = "core" | "growth" | "pro";

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

export function getPlanPriceId(plan: BillingPlanKey): string {
  switch (plan) {
    case "core":
      return requireEnv("STRIPE_PRICE_CORE");
    case "growth":
      return requireEnv("STRIPE_PRICE_GROWTH");
    case "pro":
      return requireEnv("STRIPE_PRICE_PRO");
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

export function getBrokerPlanPriceId(plan: BrokerPlanKey): string {
  switch (plan) {
    case "broker_core_monthly":
      return getPlanPriceId("core");
    case "broker_growth_monthly":
      return getPlanPriceId("growth");
    case "broker_pro_monthly":
      return getPlanPriceId("pro");
    default: {
      const _exhaustive: never = plan;
      return _exhaustive;
    }
  }
}