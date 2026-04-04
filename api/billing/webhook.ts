import { buffer } from "node:stream/consumers";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type Stripe from "stripe";
import { getStripeServer } from "../../src/lib/stripeServer.js";
import { getSupabaseServiceRole } from "../../src/lib/supabaseServer.js";

const HANDLED_EVENT_TYPES = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function idFromExpandable(
  field: string | { id: string } | null | undefined
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

function serializeEventPayload(event: Stripe.Event): Record<string, unknown> {
  return JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
}

function appAccessFromSubscriptionStatus(
  status: Stripe.Subscription.Status
): string {
  switch (status) {
    case "past_due":
      return "active_grace";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "suspended";
    case "active":
    case "trialing":
      return "active";
    default:
      return "suspended";
  }
}

function extractSeatQuantity(sub: Stripe.Subscription): number {
  const items = sub.items?.data ?? [];
  if (items.length === 0) return 1;
  const sum = items.reduce((s, i) => s + (i.quantity ?? 0), 0);
  if (items.length === 1) return Math.max(1, sum);
  return Math.max(1, sum - 1);
}

function primaryPriceId(sub: Stripe.Subscription): string | null {
  const first = sub.items?.data?.[0];
  if (!first?.price) return null;
  return idFromExpandable(first.price as string | { id: string });
}

async function resolveOfficeId(
  supabase: ReturnType<typeof getSupabaseServiceRole>,
  metaOfficeId: string | null | undefined,
  subscriptionId: string | null | undefined,
  customerId: string | null | undefined
): Promise<{ officeId: string | null; matchedBy: string }> {
  const meta = metaOfficeId?.trim();
  if (meta && isUuid(meta)) {
    const { data } = await supabase
      .from("offices")
      .select("id")
      .eq("id", meta)
      .maybeSingle();
    if (data?.id) {
      return { officeId: data.id, matchedBy: "metadata.office_id" };
    }
  }
  if (subscriptionId) {
    const { data } = await supabase
      .from("offices")
      .select("id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    if (data?.id) {
      return { officeId: data.id, matchedBy: "stripe_subscription_id" };
    }
  }
  if (customerId) {
    const { data } = await supabase
      .from("offices")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (data?.id) {
      return { officeId: data.id, matchedBy: "stripe_customer_id" };
    }
  }
  return { officeId: null, matchedBy: "none" };
}

async function updateEventLog(
  supabase: ReturnType<typeof getSupabaseServiceRole>,
  stripeEventId: string,
  patch: Record<string, unknown>
): Promise<void> {
  await supabase
    .from("stripe_event_log")
    .update(patch)
    .eq("stripe_event_id", stripeEventId);
}

async function handleCheckoutSessionCompleted(
  stripe: Stripe,
  supabase: ReturnType<typeof getSupabaseServiceRole>,
  session: Stripe.Checkout.Session
): Promise<string | null> {
  const customerId = idFromExpandable(
    session.customer as string | { id: string } | null
  );
  const subscriptionId = idFromExpandable(
    session.subscription as string | { id: string } | null
  );

  const { officeId, matchedBy } = await resolveOfficeId(
    supabase,
    session.metadata?.office_id,
    subscriptionId,
    customerId
  );

  if (!officeId) {
    console.log("[billing/webhook] office matched", {
      officeId: null,
      matchedBy,
      sessionId: session.id,
    });
    throw new Error("office_not_found");
  }

  console.log("[billing/webhook] office matched", {
    officeId,
    matchedBy,
    sessionId: session.id,
  });

  if (!customerId || !subscriptionId) {
    throw new Error("checkout.session.completed missing customer or subscription");
  }


  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const planTier =
    session.metadata?.plan_tier?.trim() ||
    session.metadata?.broker_plan_key?.trim() ||
    subscription.metadata?.plan_tier?.trim() ||
    subscription.metadata?.broker_plan_key?.trim() ||
    "";

  const billingEmail =
    session.customer_email?.trim() ||
    session.metadata?.signup_email?.trim() ||
    session.metadata?.broker_email?.trim() ||
    null;

  const nowIso = new Date().toISOString();
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  const { error: officeErr } = await supabase
    .from("offices")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_checkout_session_id: session.id,
      billing_status: subscription.status,
      billing_plan_tier: planTier || null,
      billing_price_id: primaryPriceId(subscription),
      billing_seat_quantity: extractSeatQuantity(subscription),
      billing_current_period_end: periodEnd,
      billing_cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      billing_email: billingEmail,
      billing_updated_at: nowIso,
      app_access_status: appAccessFromSubscriptionStatus(subscription.status),
    })
    .eq("id", officeId);

  if (officeErr) throw officeErr;

  console.log("[billing/webhook] office updated", {
    officeId,
    event: "checkout.session.completed",
  });

  if (!planTier) {
    return officeId;
  }

  const { error: subRowErr } = await supabase
    .from("office_stripe_subscriptions")
    .upsert(
      {
        office_id: officeId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        broker_plan_key: planTier,
        stripe_subscription_status: subscription.status,
        stripe_checkout_session_id: session.id,
        updated_at: nowIso,
      },
      { onConflict: "office_id" }
    );

  if (subRowErr) {
    if (subRowErr.code === "23503" || subRowErr.message?.includes("foreign key")) {
      console.log("[billing/webhook] office_stripe_subscriptions skipped (FK)", {
        officeId,
      });
      return officeId;
    }
    throw subRowErr;
  }

  return officeId;
}

async function handleSubscriptionEvent(
  supabase: ReturnType<typeof getSupabaseServiceRole>,
  subscription: Stripe.Subscription,
  eventType: string
): Promise<string | null> {
  const customerId = idFromExpandable(
    subscription.customer as string | { id: string } | null
  );
  const subscriptionId = subscription.id;

  const { officeId, matchedBy } = await resolveOfficeId(
    supabase,
    subscription.metadata?.office_id,
    subscriptionId,
    customerId
  );

  if (!officeId) {
    console.log("[billing/webhook] office matched", {
      officeId: null,
      matchedBy,
      subscriptionId,
      eventType,
    });
    throw new Error("office_not_found");
  }

  console.log("[billing/webhook] office matched", {
    officeId,
    matchedBy,
    subscriptionId,
    eventType,
  });

  const nowIso = new Date().toISOString();
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  const planTier =
    subscription.metadata?.plan_tier?.trim() ||
    subscription.metadata?.broker_plan_key?.trim() ||
    null;

  const patch: Record<string, unknown> = {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    billing_status: subscription.status,
    billing_plan_tier: planTier,
    billing_price_id: primaryPriceId(subscription),
    billing_seat_quantity: extractSeatQuantity(subscription),
    billing_current_period_end: periodEnd,
    billing_cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    billing_updated_at: nowIso,
    app_access_status: appAccessFromSubscriptionStatus(subscription.status),
  };

  if (subscription.status === "canceled" || eventType === "customer.subscription.deleted") {
    patch.app_access_status = "suspended";
    patch.billing_status = "canceled";
  }

  const { error } = await supabase.from("offices").update(patch).eq("id", officeId);

  if (error) throw error;

  console.log("[billing/webhook] office updated", {
    officeId,
    event: eventType,
  });

  return officeId;
}

async function handleInvoicePaymentFailed(
  stripe: Stripe,
  supabase: ReturnType<typeof getSupabaseServiceRole>,
  invoice: Stripe.Invoice
): Promise<string | null> {
  const customerId = idFromExpandable(
    invoice.customer as string | { id: string } | null
  );
  const subscriptionId = idFromExpandable(
    invoice.subscription as string | { id: string } | null
  );

  const { officeId, matchedBy } = await resolveOfficeId(
    supabase,
    invoice.metadata?.office_id,
    subscriptionId,
    customerId
  );

  if (!officeId) {
    console.log("[billing/webhook] office matched", {
      officeId: null,
      matchedBy,
      invoiceId: invoice.id,
    });
    throw new Error("office_not_found");
  }

  console.log("[billing/webhook] office matched", {
    officeId,
    matchedBy,
    invoiceId: invoice.id,
  });

  let sub: Stripe.Subscription | null = null;
  if (subscriptionId) {
    sub = await stripe.subscriptions.retrieve(subscriptionId);
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    billing_last_invoice_id: invoice.id,
    billing_last_payment_status: invoice.status ?? "payment_failed",
    billing_updated_at: nowIso,
  };

  if (sub) {
    patch.billing_status = sub.status;
    patch.billing_plan_tier =
      sub.metadata?.plan_tier?.trim() ||
      sub.metadata?.broker_plan_key?.trim() ||
      null;
    patch.billing_price_id = primaryPriceId(sub);
    patch.billing_seat_quantity = extractSeatQuantity(sub);
    patch.billing_current_period_end = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;
    patch.billing_cancel_at_period_end = sub.cancel_at_period_end ?? false;
    patch.stripe_customer_id = idFromExpandable(
      sub.customer as string | { id: string } | null
    );
    patch.stripe_subscription_id = sub.id;
    patch.app_access_status = appAccessFromSubscriptionStatus(sub.status);
  } else {
    patch.app_access_status = "active_grace";
  }

  const { error } = await supabase.from("offices").update(patch).eq("id", officeId);

  if (error) throw error;

  console.log("[billing/webhook] office updated", {
    officeId,
    event: "invoice.payment_failed",
  });

  return officeId;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).setHeader("Allow", "POST").end("Method Not Allowed");
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error("[billing/webhook] STRIPE_WEBHOOK_SECRET is not set");
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
    console.error("[billing/webhook] failed to read request body", {
      message: e instanceof Error ? e.message : String(e),
    });
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const rawBodyText = rawBody.toString("utf8");

  const stripe = getStripeServer();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBodyText, sig, webhookSecret);
  } catch (e) {
    console.error("[billing/webhook] signature verification failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  console.log("[billing/webhook] event received", {
    id: event.id,
    type: event.type,
  });

  const supabase = getSupabaseServiceRole();
  const objectId = (event.data.object as { id?: string }).id ?? null;
  const payload = serializeEventPayload(event);

  const { error: insertErr } = await supabase.from("stripe_event_log").insert({
    stripe_event_id: event.id,
    stripe_event_type: event.type,
    stripe_object_id: objectId,
    office_id: null,
    payload,
    processing_status: "received",
  });

  if (insertErr) {
    if (insertErr.code === "23505") {
      console.log("[billing/webhook] duplicate skipped", { stripeEventId: event.id });
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
    console.error("[billing/webhook] stripe_event_log insert failed", insertErr);
    res.status(500).json({ error: "Event log failed" });
    return;
  }

  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    await updateEventLog(supabase, event.id, {
      processing_status: "ignored_unhandled_type",
      processed_at: new Date().toISOString(),
    });
    res.status(200).json({ received: true });
    return;
  }

  try {
    let resolvedOfficeId: string | null = null;
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        resolvedOfficeId = await handleCheckoutSessionCompleted(
          stripe,
          supabase,
          session
        );
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        resolvedOfficeId = await handleSubscriptionEvent(
          supabase,
          subscription,
          event.type
        );
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        resolvedOfficeId = await handleInvoicePaymentFailed(
          stripe,
          supabase,
          invoice
        );
        break;
      }
      default:
        break;
    }

    await updateEventLog(supabase, event.id, {
      office_id: resolvedOfficeId,
      processing_status: "processed",
      processed_at: new Date().toISOString(),
    });

    res.status(200).json({ received: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[billing/webhook] processing failed", {
      eventId: event.id,
      type: event.type,
      message,
      stack: e instanceof Error ? e.stack : undefined,
    });

    await updateEventLog(supabase, event.id, {
      processing_status: "failed",
      error_message: message.slice(0, 8000),
      processed_at: new Date().toISOString(),
    });

    res.status(500).json({ error: "Webhook processing failed" });
  }
}
