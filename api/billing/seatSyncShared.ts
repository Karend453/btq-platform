import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Paid seats = active memberships for admin + agent only (broker is included in base plan).
 */
export async function countPaidSeats(
  supabase: SupabaseClient,
  officeId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("office_memberships")
    .select("*", { count: "exact", head: true })
    .eq("office_id", officeId)
    .eq("status", "active")
    .in("role", ["admin", "agent"]);

  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

/**
 * Target Stripe paid-seat quantity after `broker_add_office_member` adds or upserts an admin/agent.
 *
 * - **Already active** `admin` or `agent`: do **not** increase seats (same billable seat; upsert only).
 * - **Inactive** `admin` or `agent`: **do** increase seats (reactivation restores a paid seat).
 * - **No membership row** (new member) or **no matching profile**: increase by one.
 *
 * This RPC only assigns `admin` or `agent` (not `broker`), so a separate “non-billable → billable” role-change
 * path is out of scope here.
 */
export async function resolveNextPaidSeatCountForAdd(
  supabase: SupabaseClient,
  officeId: string,
  email: string,
  prevPaidCount: number
): Promise<number> {
  const normEmail = email.trim().toLowerCase();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id")
    .ilike("email", normEmail)
    .maybeSingle();

  if (!profile?.id) {
    return prevPaidCount + 1;
  }

  const { data: om } = await supabase
    .from("office_memberships")
    .select("status, role")
    .eq("office_id", officeId)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!om) {
    return prevPaidCount + 1;
  }

  const st = (om.status ?? "").trim().toLowerCase();
  const r = (om.role ?? "").trim().toLowerCase();

  if (st === "active" && (r === "admin" || r === "agent")) {
    return prevPaidCount;
  }

  return prevPaidCount + 1;
}

export async function assertBrokerForOffice(
  supabase: SupabaseClient,
  officeId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("office_memberships")
    .select("id")
    .eq("office_id", officeId)
    .eq("user_id", userId)
    .eq("role", "broker")
    .eq("status", "active")
    .maybeSingle();
  return !!data;
}

function priceIdFromItem(item: Stripe.SubscriptionItem): string | null {
  const p = item.price;
  if (p == null) return null;
  return typeof p === "string" ? p : p.id;
}

/**
 * Finds the subscription item for paid seats by **exact** Stripe Price id match (`item.price.id === seatPriceId`).
 * Base plan line items use `STRIPE_PRICE_CORE` / `GROWTH` / `PRO` and never equal `seatPriceId`, so the base item is never selected.
 * Does not use item order, index, or “first line item”.
 */
function findSeatSubscriptionItem(
  items: Stripe.SubscriptionItem[],
  seatPriceId: string
): Stripe.SubscriptionItem | undefined {
  return items.find((item) => priceIdFromItem(item) === seatPriceId);
}

/**
 * Updates **only** the subscription item whose price id equals `seatPriceId` (BTQ Paid Seat Monthly).
 * Base plan quantity is never modified. Deleting at quantity 0 runs only on that matched item.
 */
export async function syncStripeSeatQuantity(
  stripe: Stripe,
  subscriptionId: string,
  seatPriceId: string,
  seatQuantity: number
): Promise<void> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });

  const seatItem = findSeatSubscriptionItem(sub.items.data, seatPriceId);

  if (seatQuantity <= 0) {
    if (seatItem) {
      await stripe.subscriptionItems.del(seatItem.id, {
        proration_behavior: "none",
      });
    }
    return;
  }

  if (seatItem) {
    await stripe.subscriptionItems.update(seatItem.id, {
      quantity: seatQuantity,
      proration_behavior: "none",
    });
    return;
  }

  await stripe.subscriptionItems.create({
    subscription: subscriptionId,
    price: seatPriceId,
    quantity: seatQuantity,
    proration_behavior: "none",
  });
}
