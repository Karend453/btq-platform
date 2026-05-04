import type { VercelRequest, VercelResponse } from "@vercel/node";
import type Stripe from "stripe";
import { getStripeServer } from "../../src/lib/stripeServer.js";
import { getSupabaseServiceRole } from "../../src/lib/supabaseServer.js";
import { getUserIdFromAuthHeader } from "./billingAuth.js";
import { getUserProfileRoleKeyForBilling } from "./billingOfficeContext.js";

const USD = "usd";

/**
 * Cash-flow month bucket:
 * - Primary: Stripe payout `arrival_date` (expected bank arrival). Listed via
 *   `payouts.list({ status: paid, arrival_date: { gte, lt } })` with UTC month bounds.
 * - Fallback: payouts missing a usable `arrival_date` (non-positive / absent) are included only via a
 *   second pass `payouts.list({ status: paid, created: { gte, lt } })`, and only if not already counted.
 *   Payouts with a real `arrival_date` are never double-counted from the `created` pass (their month is
 *   arrival-driven even when `created` falls elsewhere).
 */

function hasUsableArrivalDate(po: Stripe.Payout): boolean {
  const a = po.arrival_date;
  return typeof a === "number" && a > 0;
}

function firstQueryParam(value: string | string[] | undefined): string | undefined {
  if (value == null) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function parseUnsignedInt(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

function utcMonthBounds(year: number, month: number): {
  periodStartSec: number;
  periodEndExclusiveSec: number;
  periodStartIso: string;
  periodEndIso: string;
} {
  const startMs = Date.UTC(year, month - 1, 1, 0, 0, 0, 0);
  const nextMonthStartMs = Date.UTC(year, month, 1, 0, 0, 0, 0);
  const endInclusiveMs = nextMonthStartMs - 1;
  return {
    periodStartSec: Math.floor(startMs / 1000),
    periodEndExclusiveSec: Math.floor(nextMonthStartMs / 1000),
    periodStartIso: new Date(startMs).toISOString(),
    periodEndIso: new Date(endInclusiveMs).toISOString(),
  };
}

async function sumPaidUsdPayoutsForMonth(
  stripe: Stripe,
  periodStartSec: number,
  periodEndExclusiveSec: number
): Promise<{ amountPaidOutCents: number; payoutCount: number }> {
  const countedIds = new Set<string>();
  let amountPaidOutCents = 0;
  let payoutCount = 0;

  let startingAfter: string | undefined;
  for (;;) {
    const page = await stripe.payouts.list({
      status: "paid",
      arrival_date: { gte: periodStartSec, lt: periodEndExclusiveSec },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const po of page.data) {
      if ((po.currency ?? "").toLowerCase() !== USD) continue;
      countedIds.add(po.id);
      amountPaidOutCents += po.amount ?? 0;
      payoutCount += 1;
    }

    if (!page.has_more) break;
    const last = page.data[page.data.length - 1];
    if (!last?.id) break;
    startingAfter = last.id;
  }

  startingAfter = undefined;
  for (;;) {
    const page = await stripe.payouts.list({
      status: "paid",
      created: { gte: periodStartSec, lt: periodEndExclusiveSec },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const po of page.data) {
      if ((po.currency ?? "").toLowerCase() !== USD) continue;
      if (countedIds.has(po.id)) continue;
      if (hasUsableArrivalDate(po)) continue;
      countedIds.add(po.id);
      amountPaidOutCents += po.amount ?? 0;
      payoutCount += 1;
    }

    if (!page.has_more) break;
    const last = page.data[page.data.length - 1];
    if (!last?.id) break;
    startingAfter = last.id;
  }

  return { amountPaidOutCents, payoutCount };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userId = await getUserIdFromAuthHeader(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let admin;
  try {
    admin = getSupabaseServiceRole();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server misconfiguration";
    console.error("[monthly-payouts] Supabase init", msg);
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const roleGate = await getUserProfileRoleKeyForBilling(admin, userId);
  if (!roleGate.ok) {
    return res.status(500).json({ error: "Could not verify account" });
  }
  if (roleGate.role !== "btq_admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const year = parseUnsignedInt(firstQueryParam(req.query.year));
  const month = parseUnsignedInt(firstQueryParam(req.query.month));

  if (year == null || month == null) {
    return res.status(400).json({ error: "year and month query parameters are required (integers)" });
  }
  if (month < 1 || month > 12) {
    return res.status(400).json({ error: "month must be between 1 and 12" });
  }
  if (year < 2000 || year > 2100) {
    return res.status(400).json({ error: "year must be between 2000 and 2100" });
  }

  const { periodStartSec, periodEndExclusiveSec, periodStartIso, periodEndIso } = utcMonthBounds(
    year,
    month
  );

  let stripe: Stripe;
  try {
    stripe = getStripeServer();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Stripe misconfiguration";
    console.error("[monthly-payouts] Stripe init", msg);
    return res.status(500).json({ error: "Billing is not configured on the server" });
  }

  try {
    const { amountPaidOutCents, payoutCount } = await sumPaidUsdPayoutsForMonth(
      stripe,
      periodStartSec,
      periodEndExclusiveSec
    );

    return res.status(200).json({
      year,
      month,
      currency: USD,
      amount_paid_out_cents: Math.max(0, Math.trunc(Number(amountPaidOutCents))),
      payout_count: Math.max(0, Math.trunc(Number(payoutCount))),
      period_start: periodStartIso,
      period_end: periodEndIso,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Stripe error";
    console.error("[monthly-payouts] Stripe list failed", msg);
    return res.status(502).json({ error: "Could not load payouts from Stripe" });
  }
}
