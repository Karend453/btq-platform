import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getStripeServer } from "../../src/lib/stripeServer.js";
import { getSeatPriceId } from "../../src/lib/stripePrices.js";
import { getSupabaseServiceRole } from "../../src/lib/supabaseServer.js";
import { getUserIdFromAuthHeader } from "./billingAuth.js";
import {
  assertBrokerForOffice,
  countPaidSeats,
  syncStripeSeatQuantity,
} from "./seatSyncShared.js";

/** Server-only: `console.error` for Vercel/host logs — not persisted to DB. */
function logDeactivateBillingMismatch(payload: {
  officeId: string;
  targetCount: number;
  message: string;
}): void {
  console.error("[sync-subscription-seats] deactivate billing mismatch — Stripe seat sync failed", payload);
}

function parseJsonBody(req: VercelRequest): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = req.body as unknown;
  } catch {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userId = await getUserIdFromAuthHeader(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = parseJsonBody(req);
  const officeId = typeof body.officeId === "string" ? body.officeId.trim() : "";
  if (!officeId) {
    return res.status(400).json({ error: "officeId is required" });
  }

  const admin = getSupabaseServiceRole();
  const isBroker = await assertBrokerForOffice(admin, officeId, userId);
  if (!isBroker) {
    return res.status(403).json({ error: "Not authorized for this office" });
  }

  const { data: office, error: officeErr } = await admin
    .from("offices")
    .select("stripe_subscription_id")
    .eq("id", officeId)
    .maybeSingle();

  if (officeErr) {
    console.error("[sync-subscription-seats] offices select", officeErr);
    return res.status(500).json({ error: "Could not load office" });
  }

  const subscriptionId =
    typeof office?.stripe_subscription_id === "string"
      ? office.stripe_subscription_id.trim()
      : "";

  if (!subscriptionId) {
    return res.status(200).json({
      synced: true,
      skipped: true,
      reason: "no_stripe_subscription",
    });
  }

  let targetCount: number;
  try {
    targetCount = await countPaidSeats(admin, officeId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync-subscription-seats] countPaidSeats", msg);
    return res.status(500).json({ error: "Could not count paid seats" });
  }

  let seatPriceId: string;
  try {
    seatPriceId = getSeatPriceId();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync-subscription-seats] STRIPE_PRICE_SEAT missing or invalid", msg);
    return res.status(503).json({
      error: "Billing seat price is not configured (STRIPE_PRICE_SEAT).",
    });
  }

  const stripe = getStripeServer();

  try {
    await syncStripeSeatQuantity(stripe, subscriptionId, seatPriceId, targetCount);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Mismatch is recorded via server logs only (`logDeactivateBillingMismatch`), not `stripe_event_log`.
    logDeactivateBillingMismatch({ officeId, targetCount, message: msg });
    return res.status(200).json({
      synced: false,
      billingMismatch: true,
      message: msg,
    });
  }

  return res.status(200).json({ synced: true });
}
