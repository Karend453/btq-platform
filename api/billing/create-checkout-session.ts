import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { getStripeServer } from "../../src/lib/stripeServer";
import {
  getBrokerPlanPriceId,
  getSeatPriceId,
  type BrokerPlanKey,
} from "../../src/lib/stripePrices";

const BROKER_PLAN_KEYS: readonly BrokerPlanKey[] = [
  "broker_core_monthly",
  "broker_growth_monthly",
  "broker_pro_monthly",
];

function isBrokerPlanKey(value: unknown): value is BrokerPlanKey {
  return typeof value === "string" && BROKER_PLAN_KEYS.includes(value as BrokerPlanKey);
}

/** Vercel may leave `body` unparsed, a string, or a Buffer depending on runtime. */
function parseJsonBody(req: VercelRequest): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = req.body as unknown;
  } catch (error) {
    console.error("[create-checkout-session] request body parse failed", error);
    return {};
  }
  if (raw == null || raw === "") return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(raw)) {
    try {
      const parsed = JSON.parse(raw.toString("utf8")) as unknown;
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function getBaseUrl(req: VercelRequest): string {
  if (process.env.VITE_APP_URL) {
    return process.env.VITE_APP_URL.replace(/\/$/, "");
  }

  const host = req.headers.host;
  if (!host) {
    return "http://localhost:3000";
  }
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

function logCheckoutError(error: unknown): void {
  if (error instanceof Stripe.errors.StripeError) {
    console.error("[create-checkout-session] Stripe error", {
      type: error.type,
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      requestId: error.requestId,
      docUrl: error.doc_url,
    });
    return;
  }
  if (error instanceof Error) {
    console.error("[create-checkout-session]", error.message, error.stack);
    return;
  }
  console.error("[create-checkout-session]", error);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const raw = parseJsonBody(req);
    const officeId = raw.officeId;
    const officeName = raw.officeName;
    const brokerEmail = raw.brokerEmail;
    const plan = raw.plan;
    const seatQtyRaw = raw.seatQuantity;

    const seatQuantity =
      typeof seatQtyRaw === "number" &&
      Number.isFinite(seatQtyRaw) &&
      seatQtyRaw >= 0
        ? Math.floor(seatQtyRaw)
        : 0;

    if (
      typeof officeId !== "string" ||
      !officeId.trim() ||
      typeof officeName !== "string" ||
      !officeName.trim() ||
      typeof brokerEmail !== "string" ||
      !brokerEmail.trim()
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!isBrokerPlanKey(plan)) {
      return res.status(400).json({
        error: "Invalid plan",
        expected: BROKER_PLAN_KEYS,
      });
    }

    const baseUrl = getBaseUrl(req);
    const stripe = getStripeServer();

    const officeIdTrimmed = officeId.trim();
    const officeNameTrimmed = officeName.trim();
    const brokerEmailTrimmed = brokerEmail.trim();

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: getBrokerPlanPriceId(plan), quantity: 1 },
    ];
    if (seatQuantity > 0) {
      lineItems.push({ price: getSeatPriceId(), quantity: seatQuantity });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: brokerEmailTrimmed,
      line_items: lineItems,
      success_url: `${baseUrl}/settings/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/settings/billing/cancelled`,
      metadata: {
        office_id: officeIdTrimmed,
        office_name: officeNameTrimmed,
        broker_email: brokerEmailTrimmed,
        broker_plan_key: plan,
        btq_flow: "broker_subscription_signup",
      },
      subscription_data: {
        metadata: {
          office_id: officeIdTrimmed,
          office_name: officeNameTrimmed,
          broker_email: brokerEmailTrimmed,
          broker_plan_key: plan,
          btq_flow: "broker_subscription_signup",
        },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return res.status(500).json({ error: "Stripe session missing URL" });
    }

    return res.status(200).json({ url: session.url });
  } catch (error) {
    logCheckoutError(error);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
}