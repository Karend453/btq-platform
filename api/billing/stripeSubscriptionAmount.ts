import type Stripe from "stripe";

/**
 * Centralized "what is this Stripe subscription billed at per recurring period" math.
 *
 * Used by both the webhook (to denormalize an actual monthly amount onto `offices`) and by
 * `wallet-summary` (to render the live amount in Settings → My Wallet). Keeping the logic
 * here is what lets Wallet, Billing, and Business Overview agree on the dollar amount.
 *
 * **Stripe is the source of truth** — never compute revenue from internal plan/seat
 * catalogs when a subscription object is available. The catalog model is informational only.
 */

/** Currencies where Stripe amounts are already in major units (no /100). */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

export function minorUnitsToMajorAmount(minor: number, currency: string): number {
  const c = currency.trim().toLowerCase();
  if (ZERO_DECIMAL_CURRENCIES.has(c)) return minor;
  return minor / 100;
}

/**
 * Sums `unit_amount × quantity` for every subscription line item, in Stripe minor units.
 *
 * - Items whose `price` is unexpanded (just a string id) cannot be priced and are skipped.
 *   Callers that need a full sum must retrieve the subscription with `expand: ["items.data.price"]`.
 * - Items missing `unit_amount` (e.g. metered usage prices) contribute 0.
 * - The result is intentionally cadence-agnostic: callers know whether the subscription is
 *   monthly/annual/quarterly and convert as needed. For Brokerteq today, **all base plans
 *   are billed monthly** and seats are always monthly, so this value *is* the monthly total.
 *   When that ever changes, fix it here (one place) rather than at each call site.
 */
export function sumSubscriptionLineItemsMinor(sub: Stripe.Subscription): number {
  let total = 0;
  for (const item of sub.items.data) {
    const price = item.price;
    if (price == null || typeof price === "string") continue;
    const ua = price.unit_amount;
    if (ua == null) continue;
    const qty = item.quantity ?? 1;
    total += ua * qty;
  }
  return total;
}

/**
 * Convenience wrapper that returns the sum plus the resolved currency (always lower-case),
 * matching the shape we persist into `offices.billing_monthly_amount_cents` / `billing_currency`.
 */
export function subscriptionMonthlyAmountSnapshot(sub: Stripe.Subscription): {
  amountMinor: number;
  currency: string;
} {
  return {
    amountMinor: sumSubscriptionLineItemsMinor(sub),
    currency: (sub.currency ?? "usd").toLowerCase(),
  };
}
