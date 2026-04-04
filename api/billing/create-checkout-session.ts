import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { getStripeServer } from "../../src/lib/stripeServer.js";
import {
  getBrokerPlanPriceId,
  getSeatPriceId,
  type BrokerPlanKey,
} from "../../src/lib/stripePrices.js";

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
  const explicit =
    process.env.APP_URL?.trim() || process.env.VITE_APP_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const host = req.headers.host;
  if (!host) {
    return "http://localhost:3000";
  }
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

function logCheckoutError(error: unknown, context?: string): void {
  const prefix = context
    ? `[create-checkout-session] ${context}`
    : "[create-checkout-session]";
  if (error instanceof Stripe.errors.StripeError) {
    console.error(`${prefix} Stripe API error`, {
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
    console.error(prefix, error.message, error.stack);
    return;
  }
  console.error(prefix, error);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  console.log("[create-checkout-session] handler entered", {
    method: req.method,
    host: req.headers.host ?? null,
  });

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
      console.warn("[create-checkout-session] validation failed: missing required fields");
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!isBrokerPlanKey(plan)) {
      console.warn("[create-checkout-session] validation failed: invalid plan", {
        plan,
        expected: BROKER_PLAN_KEYS,
      });
      return res.status(400).json({
        error: "Invalid plan",
        expected: BROKER_PLAN_KEYS,
      });
    }

    const explicitAppUrl = process.env.APP_URL?.trim() || null;
    const explicitViteAppUrl = process.env.VITE_APP_URL?.trim() || null;
    const baseUrl = getBaseUrl(req);
    console.log("[create-checkout-session] base URL resolved", {
      baseUrl,
      usedExplicitAppUrl: !!explicitAppUrl,
      usedExplicitViteAppUrl: !explicitAppUrl && !!explicitViteAppUrl,
      usedHostHeader: !explicitAppUrl && !explicitViteAppUrl,
    });

    const stripeSecretPresent = !!process.env.STRIPE_SECRET_KEY?.trim();
    console.log("[create-checkout-session] env check", {
      stripeSecretPresent,
    });

    let stripe: Stripe;
    try {
      console.log("[create-checkout-session] calling getStripeServer()");
      stripe = getStripeServer();
      console.log("[create-checkout-session] getStripeServer() ok");
    } catch (error) {
      logCheckoutError(error, "throw at getStripeServer()");
      throw error;
    }

    const officeIdTrimmed = officeId.trim();
    const officeNameTrimmed = officeName.trim();
    const brokerEmailTrimmed = brokerEmail.trim();

    console.log("[create-checkout-session] parsed request", {
      plan,
      seatQuantity,
      officeIdLength: officeIdTrimmed.length,
    });

    let brokerPriceId: string;
    try {
      console.log("[create-checkout-session] resolving broker plan price id", { plan });
      brokerPriceId = getBrokerPlanPriceId(plan);
      console.log("[create-checkout-session] broker plan price id ok", {
        priceId: brokerPriceId,
      });
    } catch (error) {
      logCheckoutError(error, "throw at getBrokerPlanPriceId()");
      throw error;
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: brokerPriceId, quantity: 1 },
    ];

    if (seatQuantity > 0) {
      try {
        console.log("[create-checkout-session] resolving seat price id");
        const seatPriceId = getSeatPriceId();
        console.log("[create-checkout-session] seat price id ok", { priceId: seatPriceId });
        lineItems.push({ price: seatPriceId, quantity: seatQuantity });
      } catch (error) {
        logCheckoutError(error, "throw at getSeatPriceId()");
        throw error;
      }
    }

    console.log("[create-checkout-session] calling stripe.checkout.sessions.create", {
      lineItemCount: lineItems.length,
    });

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: brokerEmailTrimmed,
        line_items: lineItems,
        success_url: `${baseUrl}/settings/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/settings/billing/cancelled`,
        metadata: {
          office_id: officeIdTrimmed,
          plan_tier: plan,
          signup_email: brokerEmailTrimmed,
          office_name: officeNameTrimmed,
          broker_email: brokerEmailTrimmed,
          broker_plan_key: plan,
          btq_flow: "broker_subscription_signup",
        },
        subscription_data: {
          metadata: {
            office_id: officeIdTrimmed,
            plan_tier: plan,
            signup_email: brokerEmailTrimmed,
            office_name: officeNameTrimmed,
            broker_email: brokerEmailTrimmed,
            broker_plan_key: plan,
            btq_flow: "broker_subscription_signup",
          },
        },
        allow_promotion_codes: true,
      });
    } catch (error) {
      logCheckoutError(error, "throw at stripe.checkout.sessions.create");
      throw error;
    }

    console.log("[create-checkout-session] stripe.checkout.sessions.create ok", {
      sessionId: session.id,
      hasUrl: !!session.url,
    });

    if (!session.url) {
      console.error("[create-checkout-session] Stripe session missing URL on response");
      return res.status(500).json({ error: "Stripe session missing URL" });
    }

    return res.status(200).json({ url: session.url });
  } catch (error) {
    logCheckoutError(error, "unhandled");
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
}
