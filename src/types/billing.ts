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