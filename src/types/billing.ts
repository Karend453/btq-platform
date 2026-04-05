import type { BrokerPlanKey } from "../lib/stripePrices";

export type CreateBrokerCheckoutInput = {
  officeId: string;
  officeName: string;
  brokerEmail: string;
  plan: BrokerPlanKey;
  /** Optional per-seat add-on quantity; omit or 0 = no seat line item (Stripe rejects quantity 0). */
  seatQuantity?: number;
};

export type CreateBrokerCheckoutResponse = {
  url: string;
};

export type BillingPortalSessionResponse = {
  url: string;
};

/** Normalized wallet read model: Stripe-backed when `connected`; DB only gates access + linkage. */
export type WalletBillingSummary =
  | {
      connected: false;
      planName: null;
      subscriptionStatus: null;
      nextBillingDate: null;
      monthlyTotal: null;
      seatCount: null;
      currency: null;
    }
  | {
      connected: true;
      planName: string;
      subscriptionStatus: string;
      nextBillingDate: string | null;
      /** Sum of subscription line items in major display units for `currency` (Stripe minor units → major). */
      monthlyTotal: number;
      /** Quantity on the Stripe seat price item (`STRIPE_PRICE_SEAT`). */
      seatCount: number;
      currency: string;
    };