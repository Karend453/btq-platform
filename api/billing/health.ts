import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getStripeServer, isStripeLiveMode } from "../../src/lib/stripeServer";
import { getPlanPriceId } from "../../src/lib/stripePrices";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const stripe = getStripeServer();
    const priceId = getPlanPriceId("core");
    const price = await stripe.prices.retrieve(priceId);

    res.status(200).json({
      ok: true,
      secretMode: isStripeLiveMode() ? "live" : "test",
      priceId,
      priceLiveMode: price.livemode,
      product: price.product,
      unitAmount: price.unit_amount,
      currency: price.currency,
      type: price.type,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe error";
    res.status(500).json({
      ok: false,
      error: message,
    });
  }
}