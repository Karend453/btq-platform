import type { VercelRequest, VercelResponse } from "@vercel/node";
import type Stripe from "stripe";
import { getStripeServer } from "../../src/lib/stripeServer.js";
import { getSupabaseServiceRole } from "../../src/lib/supabaseServer.js";
import { getUserIdFromAuthHeader } from "./billingAuth.js";
import { getUserProfileRoleKeyForBilling } from "./billingOfficeContext.js";

const USD = "usd";

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

/** Calendar month in UTC; Stripe `created` filter uses unix seconds. */
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

async function sumPaidUsdInvoicesForCreatedRange(
  stripe: Stripe,
  periodStartSec: number,
  periodEndExclusiveSec: number
): Promise<{ amountPaidCents: number; invoiceCount: number }> {
  let amountPaidCents = 0;
  let invoiceCount = 0;
  let startingAfter: string | undefined;

  for (;;) {
    const page = await stripe.invoices.list({
      status: "paid",
      created: { gte: periodStartSec, lt: periodEndExclusiveSec },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const inv of page.data) {
      if ((inv.currency ?? "").toLowerCase() !== USD) continue;
      amountPaidCents += inv.amount_paid ?? 0;
      invoiceCount += 1;
    }

    if (!page.has_more) break;
    const last = page.data[page.data.length - 1];
    if (!last?.id) break;
    startingAfter = last.id;
  }

  return { amountPaidCents, invoiceCount };
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
    console.error("[monthly-revenue] Supabase init", msg);
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
    console.error("[monthly-revenue] Stripe init", msg);
    return res.status(500).json({ error: "Billing is not configured on the server" });
  }

  try {
    const { amountPaidCents, invoiceCount } = await sumPaidUsdInvoicesForCreatedRange(
      stripe,
      periodStartSec,
      periodEndExclusiveSec
    );

    return res.status(200).json({
      year,
      month,
      currency: USD,
      amount_paid_cents: amountPaidCents,
      invoice_count: invoiceCount,
      period_start: periodStartIso,
      period_end: periodEndIso,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Stripe error";
    console.error("[monthly-revenue] Stripe list failed", msg);
    return res.status(502).json({ error: "Could not load invoices from Stripe" });
  }
}
