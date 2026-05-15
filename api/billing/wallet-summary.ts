import type { VercelRequest, VercelResponse } from "@vercel/node";
import type Stripe from "stripe";
import type { WalletBillingSummary } from "../../src/types/billing.js";
import { getStripeServer } from "../../src/lib/stripeServer.js";
import { getPlanPriceId, getSeatPriceId } from "../../src/lib/stripePrices.js";
import { getSupabaseServiceRole } from "../../src/lib/supabaseServer.js";
import {
  attachLogContext,
  logApiError,
  logApiStart,
  logApiSuccess,
} from "../../src/lib/server/observability.js";
import { getUserIdFromAuthHeader } from "./billingAuth.js";
import { resolveWalletReadOfficeId } from "./billingOfficeContext.js";
import {
  minorUnitsToMajorAmount,
  sumSubscriptionLineItemsMinor,
} from "./stripeSubscriptionAmount.js";

const ROUTE = "api/billing/wallet-summary";

function priceIdFromItem(item: Stripe.SubscriptionItem): string | null {
  const p = item.price;
  if (p == null) return null;
  return typeof p === "string" ? p : p.id;
}

function isBasePlanPriceId(id: string): boolean {
  try {
    return (
      id === getPlanPriceId("core") ||
      id === getPlanPriceId("growth") ||
      id === getPlanPriceId("pro")
    );
  } catch {
    return false;
  }
}

function findBasePlanItem(
  sub: Stripe.Subscription
): Stripe.SubscriptionItem | undefined {
  return sub.items.data.find((item) => {
    const pid = priceIdFromItem(item);
    return pid != null && isBasePlanPriceId(pid);
  });
}

function planLabelFromPriceId(priceId: string | null): string | null {
  if (!priceId) return null;
  try {
    if (priceId === getPlanPriceId("core")) return "Core";
    if (priceId === getPlanPriceId("growth")) return "Growth";
    if (priceId === getPlanPriceId("pro")) return "Pro";
  } catch {
    return null;
  }
  return null;
}

function seatQuantityFromSubscription(
  sub: Stripe.Subscription,
  seatPriceId: string
): number {
  const item = sub.items.data.find((i) => priceIdFromItem(i) === seatPriceId);
  if (!item) return 0;
  return item.quantity ?? 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = logApiStart({ route: ROUTE, method: req.method });

  if (req.method !== "GET") {
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

  const headerRaw = req.headers["x-btq-billing-office-id"];
  const billingOfficeHint =
    typeof headerRaw === "string"
      ? headerRaw
      : Array.isArray(headerRaw) && typeof headerRaw[0] === "string"
        ? headerRaw[0]
        : null;

  const resolved = await resolveWalletReadOfficeId(admin, userId, billingOfficeHint);
  if (!resolved.ok) {
    const r = resolved as {
      ok: false;
      reason: "no_office" | "db_error";
      btqAdminReadPath?: boolean;
    };
    if (r.reason === "db_error") {
      logApiError(ctx, "resolve_office_db_error", {
        status: 500,
        metadata: { stage: "resolve_office" },
      });
      return res.status(500).json({ error: "Could not resolve office" });
    }
    if ("btqAdminReadPath" in resolved && resolved.btqAdminReadPath) {
      logApiSuccess(ctx, {
        status: 404,
        metadata: { reason: "no_office_selected_admin" },
      });
      return res.status(404).json({
        error:
          "No office selected. Choose an office in the dashboard (top bar) to view that office’s billing.",
      });
    }
    logApiSuccess(ctx, { status: 404, metadata: { reason: "no_office" } });
    return res.status(404).json({ error: "No active office for this account" });
  }

  const officeId = resolved.officeId;
  attachLogContext(ctx, { officeId });

  const { data: office, error: officeErr } = await admin
    .from("offices")
    .select("stripe_subscription_id")
    .eq("id", officeId)
    .maybeSingle();

  if (officeErr) {
    console.error("[wallet-summary] offices select", officeErr);
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

  const subscriptionId =
    typeof office.stripe_subscription_id === "string"
      ? office.stripe_subscription_id.trim()
      : "";

  if (!subscriptionId) {
    const body: WalletBillingSummary = {
      connected: false,
      planName: null,
      subscriptionStatus: null,
      nextBillingDate: null,
      monthlyTotal: null,
      seatCount: null,
      currency: null,
    };
    logApiSuccess(ctx, { status: 200, metadata: { connected: false } });
    return res.status(200).json(body);
  }

  let seatPriceId: string;
  try {
    seatPriceId = getSeatPriceId();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Seat price not configured";
    console.error("[wallet-summary]", msg);
    logApiError(ctx, e, { status: 500, metadata: { stage: "seat_price_config" } });
    return res.status(500).json({ error: "Billing is not configured on the server" });
  }

  try {
    const stripe = getStripeServer();
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price"],
    });

    const currency = (sub.currency ?? "usd").toLowerCase();
    const baseItem = findBasePlanItem(sub);
    const basePriceId = baseItem ? priceIdFromItem(baseItem) : null;
    const planName = planLabelFromPriceId(basePriceId) ?? "Broker plan";

    const minorSum = sumSubscriptionLineItemsMinor(sub);
    const monthlyTotal = minorUnitsToMajorAmount(minorSum, currency);

    const seatCount = seatQuantityFromSubscription(sub, seatPriceId);

    const subWithLegacyPeriod = sub as Stripe.Subscription & { current_period_end?: number };
    const body: WalletBillingSummary = {
      connected: true,
      planName,
      subscriptionStatus: sub.status,
      nextBillingDate:
        subWithLegacyPeriod.current_period_end != null
          ? new Date(subWithLegacyPeriod.current_period_end * 1000).toISOString()
          : null,
      monthlyTotal,
      seatCount,
      currency,
    };
    logApiSuccess(ctx, {
      status: 200,
      metadata: {
        connected: true,
        subscriptionStatus: sub.status,
      },
    });
    return res.status(200).json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Stripe error";
    console.error("[wallet-summary] Stripe retrieve failed", msg);
    logApiError(ctx, e, { status: 502, metadata: { stage: "stripe_retrieve" } });
    return res.status(502).json({ error: "Could not load subscription from Stripe" });
  }
}
