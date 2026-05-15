import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { getStripeServer } from "../../src/lib/stripeServer.js";
import { getSupabaseServiceRole } from "../../src/lib/supabaseServer.js";
import {
  attachLogContext,
  logApiError,
  logApiStart,
  logApiSuccess,
} from "../../src/lib/server/observability.js";
import { getUserIdFromAuthHeader } from "./billingAuth.js";
import { getUserProfileRoleKeyForBilling, resolveWalletOfficeId } from "./billingOfficeContext.js";
import { resolveAppBaseUrl } from "./appBaseUrl.js";

const ROUTE = "api/billing/create-billing-portal-session";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = logApiStart({ route: ROUTE, method: req.method });

  if (req.method !== "POST") {
    logApiSuccess(ctx, { status: 405 });
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userId = await getUserIdFromAuthHeader(req);
  if (!userId) {
    logApiSuccess(ctx, { status: 401 });
    return res.status(401).json({ error: "Unauthorized" });
  }
  attachLogContext(ctx, { userId });

  const admin = getSupabaseServiceRole();

  const roleGate = await getUserProfileRoleKeyForBilling(admin, userId);
  if (!roleGate.ok) {
    logApiError(ctx, "role_gate_failed", {
      status: 500,
      metadata: { stage: "role_gate" },
    });
    return res.status(500).json({ error: "Could not verify account" });
  }
  if (roleGate.role === "btq_admin") {
    logApiSuccess(ctx, { status: 403, metadata: { reason: "btq_admin_blocked" } });
    return res.status(403).json({
      error: "Billing portal is not available for BTQ Admin. Use a broker account to change payment methods.",
    });
  }

  const resolved = await resolveWalletOfficeId(admin, userId);
  if (!resolved.ok) {
    const r = resolved as { ok: false; reason: "no_office" | "db_error" };
    if (r.reason === "db_error") {
      logApiError(ctx, "resolve_office_db_error", {
        status: 500,
        metadata: { stage: "resolve_office" },
      });
      return res.status(500).json({ error: "Could not resolve office" });
    }
    logApiSuccess(ctx, { status: 404, metadata: { reason: "no_office" } });
    return res.status(404).json({ error: "No active office for this account" });
  }
  attachLogContext(ctx, { officeId: resolved.officeId });

  const { data: office, error: officeErr } = await admin
    .from("offices")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("id", resolved.officeId)
    .maybeSingle();

  if (officeErr) {
    console.error("[create-billing-portal-session] offices select", officeErr);
    logApiError(ctx, officeErr, {
      status: 500,
      metadata: { stage: "offices_select" },
    });
    return res.status(500).json({ error: "Could not load office" });
  }
  if (!office) {
    logApiSuccess(ctx, { status: 404, metadata: { reason: "office_not_found" } });
    return res.status(404).json({ error: "Office not found" });
  }

  let customerId =
    typeof office.stripe_customer_id === "string" ? office.stripe_customer_id.trim() : "";

  const subscriptionId =
    typeof office.stripe_subscription_id === "string" ? office.stripe_subscription_id.trim() : "";

  try {
    const stripe = getStripeServer();

    if (!customerId && subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const c = sub.customer;
      if (typeof c === "string") {
        customerId = c.trim();
      } else if (c && typeof c === "object" && "id" in c && typeof (c as { id: unknown }).id === "string") {
        customerId = (c as { id: string }).id.trim();
      }
    }

    if (!customerId) {
      logApiSuccess(ctx, {
        status: 400,
        metadata: { reason: "no_stripe_customer" },
      });
      return res.status(400).json({
        error: "Billing is not connected for this office.",
      });
    }

    const base = resolveAppBaseUrl(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${base}/settings?tab=wallet`,
    });
    if (!session.url) {
      logApiError(ctx, "stripe_portal_missing_url", { status: 500 });
      return res.status(500).json({ error: "Stripe did not return a portal URL" });
    }
    logApiSuccess(ctx, { status: 200 });
    return res.status(200).json({ url: session.url });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Stripe error";
    console.error("[create-billing-portal-session]", msg);
    if (error instanceof Stripe.errors.StripeError) {
      logApiError(ctx, error, {
        status: 502,
        metadata: { stage: "stripe_error" },
      });
      return res.status(502).json({ error: error.message });
    }
    logApiError(ctx, error, { status: 502, metadata: { stage: "unhandled" } });
    return res.status(502).json({ error: "Could not create billing portal session" });
  }
}
