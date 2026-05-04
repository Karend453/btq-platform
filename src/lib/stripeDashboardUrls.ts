/**
 * Human-facing Stripe Dashboard deep links (no secrets). For BTQ internal / Back Office use.
 * Test mode objects use the same path; toggle mode in the Stripe Dashboard UI.
 */
export function stripeCustomerDashboardUrl(customerId: string): string {
  const id = customerId.trim();
  return `https://dashboard.stripe.com/customers/${encodeURIComponent(id)}`;
}

export function stripeSubscriptionDashboardUrl(subscriptionId: string): string {
  const id = subscriptionId.trim();
  return `https://dashboard.stripe.com/subscriptions/${encodeURIComponent(id)}`;
}
