import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { getStripeServer } from "../../src/lib/stripeServer.js";
import { getSupabaseServiceRole } from "../../src/lib/supabaseServer.js";
import { getUserIdFromAuthHeader } from "./billingAuth.js";
import { getUserProfileRoleKeyForBilling, resolveWalletOfficeId } from "./billingOfficeContext.js";

function getReturnBaseUrl(req: VercelRequest): string {
  const explicit = process.env.APP_URL?.trim() || process.env.VITE_APP_URL?.trim();
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userId = await getUserIdFromAuthHeader(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const admin = getSupabaseServiceRole();

  const roleGate = await getUserProfileRoleKeyForBilling(admin, userId);
  if (!roleGate.ok) {
    return res.status(500).json({ error: "Could not verify account" });
  }
  if (roleGate.role === "btq_admin") {
    return res.status(403).json({
      error: "Billing portal is not available for BTQ Admin. Use a broker account to change payment methods.",
    });
  }

  const resolved = await resolveWalletOfficeId(admin, userId);
  if (!resolved.ok) {
    const r = resolved as { ok: false; reason: "no_office" | "db_error" };
    if (r.reason === "db_error") {
      return res.status(500).json({ error: "Could not resolve office" });
    }
    return res.status(404).json({ error: "No active office for this account" });
  }

  const { data: office, error: officeErr } = await admin
    .from("offices")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("id", resolved.officeId)
    .maybeSingle();

  if (officeErr) {
    console.error("[create-billing-portal-session] offices select", officeErr);
    return res.status(500).json({ error: "Could not load office" });
  }
  if (!office) {
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
      return res.status(400).json({
        error: "Billing is not connected for this office.",
      });
    }

    const base = getReturnBaseUrl(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${base}/settings?tab=wallet`,
    });
    if (!session.url) {
      return res.status(500).json({ error: "Stripe did not return a portal URL" });
    }
    return res.status(200).json({ url: session.url });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Stripe error";
    console.error("[create-billing-portal-session]", msg);
    if (error instanceof Stripe.errors.StripeError) {
      return res.status(502).json({ error: error.message });
    }
    return res.status(502).json({ error: "Could not create billing portal session" });
  }
}
