import { buffer } from "node:stream/consumers";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type Stripe from "stripe";
import { getStripeServer } from "../../src/lib/stripeServer.js";
import { getSupabaseServiceRole } from "../../src/lib/supabaseServer.js";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function idFromExpandable(
  field: string | { id: string } | null
): string | null {
  if (field == null) return null;
  if (typeof field === "string") return field;
  return field.id;
}

function stripeSignatureHeader(req: VercelRequest): string | null {
  const raw = req.headers["stripe-signature"];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.length > 0) return raw[0] ?? null;
  return null;
}

function logWebhook(message: string, extra?: Record<string, unknown>): void {
  console.error(`[billing/webhook] ${message}`, extra ?? "");
}

async function handleCheckoutSessionCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session
): Promise<void> {
  const officeId = session.metadata?.office_id?.trim();

  if (!officeId || !isUuid(officeId)) {
    logWebhook("checkout.session.completed missing or invalid metadata.office_id", {
      sessionId: session.id,
    });
    return;
  }

  const customerId = idFromExpandable(
    session.customer as string | { id: string } | null
  );
  const subscriptionId = idFromExpandable(
    session.subscription as string | { id: string } | null
  );

  if (!customerId || !subscriptionId) {
    logWebhook("checkout.session.completed missing customer or subscription id", {
      sessionId: session.id,
      officeId,
      customerId,
      subscriptionId,
    });
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const brokerPlanKey =
    session.metadata?.broker_plan_key?.trim() ||
    subscription.metadata?.broker_plan_key?.trim() ||
    "";

  if (!brokerPlanKey) {
    logWebhook("checkout.session.completed missing broker_plan_key on session and subscription", {
      sessionId: session.id,
      officeId,
      subscriptionId,
    });
    return;
  }

  const supabase = getSupabaseServiceRole();
  const { error } = await supabase.from("office_stripe_subscriptions").upsert(
    {
      office_id: officeId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      broker_plan_key: brokerPlanKey,
      stripe_subscription_status: subscription.status,
      stripe_checkout_session_id: session.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "office_id" }
  );

  if (error) {
    if (error.code === "23503" || error.message?.includes("foreign key")) {
      logWebhook("office not found for office_id (FK); not retrying", {
        sessionId: session.id,
        officeId,
        message: error.message,
      });
      return;
    }
    throw error;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).setHeader("Allow", "POST").end("Method Not Allowed");
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    logWebhook("STRIPE_WEBHOOK_SECRET is not set");
    res.status(500).json({ error: "Webhook misconfigured" });
    return;
  }

  const sig = stripeSignatureHeader(req);
  if (!sig) {
    res.status(400).json({ error: "Missing Stripe-Signature header" });
    return;
  }

  let rawBody: Buffer;
  try {
    rawBody = await buffer(req);
  } catch (e) {
    logWebhook("failed to read request body", {
      message: e instanceof Error ? e.message : String(e),
    });
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const stripe = getStripeServer();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (e) {
    logWebhook("signature verification failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutSessionCompleted(stripe, session);
    }
    res.status(200).json({ received: true });
  } catch (e) {
    logWebhook("handler error", {
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
    res.status(500).json({ error: "Webhook handler failed" });
  }
}
