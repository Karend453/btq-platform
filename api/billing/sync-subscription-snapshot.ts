import type { VercelRequest, VercelResponse } from "@vercel/node";
import type Stripe from "stripe";
import { getStripeServer } from "../../src/lib/stripeServer.js";
import { getSupabaseServiceRole } from "../../src/lib/supabaseServer.js";
import {
  attachLogContext,
  logApiError,
  logApiStart,
  logApiSuccess,
} from "../../src/lib/server/observability.js";
import { getUserIdFromAuthHeader } from "./billingAuth.js";
import { getUserProfileRoleKeyForBilling } from "./billingOfficeContext.js";
import { subscriptionMonthlyAmountSnapshot } from "./stripeSubscriptionAmount.js";

const ROUTE = "api/billing/sync-subscription-snapshot";

/**
 * Admin-only backfill / re-sync of `offices.billing_monthly_amount_cents` (+ `billing_currency`)
 * from Stripe. Webhooks keep these columns fresh going forward; this endpoint exists so we don't
 * have to wait for the next subscription event (or to recover from a missed webhook).
 *
 * Auth: `btq_admin` only.
 * Body: `{ officeId?: string }` — single office when provided, else every office with a
 *       `stripe_subscription_id`.
 */

type ParsedBody = { officeId: string | null };

function parseJsonBody(req: VercelRequest): ParsedBody {
  let raw: unknown = req.body;
  if (raw == null || raw === "") return { officeId: null };
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return { officeId: null };
    }
  }
  if (Buffer.isBuffer(raw)) {
    try {
      raw = JSON.parse(raw.toString("utf8")) as unknown;
    } catch {
      return { officeId: null };
    }
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const oid = typeof obj.officeId === "string" ? obj.officeId.trim() : "";
    return { officeId: oid || null };
  }
  return { officeId: null };
}

type SyncResult = {
  officeId: string;
  subscriptionId: string;
  status: "updated" | "skipped" | "error";
  amountMinor?: number;
  currency?: string;
  message?: string;
};

async function syncOneOffice(
  stripe: Stripe,
  admin: ReturnType<typeof getSupabaseServiceRole>,
  officeId: string,
  subscriptionId: string
): Promise<SyncResult> {
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price"],
    });
    const snap = subscriptionMonthlyAmountSnapshot(sub);
    const { error } = await admin
      .from("offices")
      .update({
        billing_monthly_amount_cents: snap.amountMinor,
        billing_currency: snap.currency,
        billing_updated_at: new Date().toISOString(),
      })
      .eq("id", officeId);
    if (error) {
      return {
        officeId,
        subscriptionId,
        status: "error",
        message: `db_update_failed: ${error.message}`,
      };
    }
    return {
      officeId,
      subscriptionId,
      status: "updated",
      amountMinor: snap.amountMinor,
      currency: snap.currency,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { officeId, subscriptionId, status: "error", message: msg };
  }
}

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

  let admin;
  try {
    admin = getSupabaseServiceRole();
  } catch (e) {
    console.error("[sync-subscription-snapshot] Supabase init", e);
    logApiError(ctx, e, { status: 500, metadata: { stage: "supabase_init" } });
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const roleGate = await getUserProfileRoleKeyForBilling(admin, userId);
  if (!roleGate.ok) {
    logApiError(ctx, "role_gate_failed", {
      status: 500,
      metadata: { stage: "role_gate" },
    });
    return res.status(500).json({ error: "Could not verify account" });
  }
  if (roleGate.role !== "btq_admin") {
    logApiSuccess(ctx, { status: 403, metadata: { reason: "not_btq_admin" } });
    return res.status(403).json({ error: "Forbidden" });
  }

  const { officeId } = parseJsonBody(req);
  attachLogContext(ctx, { officeId });

  let stripe: Stripe;
  try {
    stripe = getStripeServer();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Stripe misconfiguration";
    console.error("[sync-subscription-snapshot] Stripe init", msg);
    logApiError(ctx, e, { status: 500, metadata: { stage: "stripe_init" } });
    return res.status(500).json({ error: "Billing is not configured on the server" });
  }

  const baseQuery = admin
    .from("offices")
    .select("id, stripe_subscription_id")
    .not("stripe_subscription_id", "is", null);

  const { data, error } = officeId ? await baseQuery.eq("id", officeId) : await baseQuery;

  if (error) {
    console.error("[sync-subscription-snapshot] offices select", error);
    logApiError(ctx, error, { status: 500, metadata: { stage: "offices_select" } });
    return res.status(500).json({ error: "Could not load offices" });
  }

  const targets = (data ?? []).filter(
    (r): r is { id: string; stripe_subscription_id: string } =>
      typeof r.id === "string" &&
      typeof r.stripe_subscription_id === "string" &&
      r.stripe_subscription_id.trim() !== ""
  );

  const results: SyncResult[] = [];
  for (const row of targets) {
    results.push(
      await syncOneOffice(stripe, admin, row.id, row.stripe_subscription_id.trim())
    );
  }

  const summary = {
    requestedOfficeId: officeId,
    total: results.length,
    updated: results.filter((r) => r.status === "updated").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "error").length,
    results,
  };

  logApiSuccess(ctx, {
    status: 200,
    metadata: {
      total: summary.total,
      updated: summary.updated,
      skipped: summary.skipped,
      failed: summary.failed,
    },
  });

  return res.status(200).json(summary);
}
