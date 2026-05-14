import { supabase } from "../lib/supabaseClient";

/**
 * Result for a single office in the sync batch. `status: "updated"` means
 * `billing_monthly_amount_cents` and `billing_currency` were written from the live Stripe
 * subscription. `error` rows include a short message (e.g. Stripe sub deleted, currency mismatch).
 */
export type SyncSnapshotOfficeResult = {
  officeId: string;
  subscriptionId: string;
  status: "updated" | "skipped" | "error";
  amountMinor?: number;
  currency?: string;
  message?: string;
};

export type SyncSnapshotSummary = {
  requestedOfficeId: string | null;
  total: number;
  updated: number;
  skipped: number;
  failed: number;
  results: SyncSnapshotOfficeResult[];
};

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function parseApiErrorJson(body: unknown): string | null {
  if (
    body &&
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return null;
}

/**
 * Triggers `POST /api/billing/sync-subscription-snapshot`. Used by the Back Office Business
 * Overview "Sync from Stripe" button so a btq_admin can populate `billing_monthly_amount_cents`
 * on every office (or one) without waiting for the next Stripe webhook event.
 *
 * `officeId` undefined / null → server backfills every office with a `stripe_subscription_id`.
 * `officeId` non-empty string → server limits the sync to that office.
 *
 * Server-side gate: btq_admin only. Anything else returns 403 here.
 */
export async function syncBackOfficeStripeSnapshots(
  officeId?: string | null
): Promise<ServiceResult<SyncSnapshotSummary>> {
  if (!supabase) return { ok: false, error: "Supabase client unavailable." };

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    return { ok: false, error: "Not signed in." };
  }

  const trimmed = typeof officeId === "string" ? officeId.trim() : "";
  const body = trimmed ? JSON.stringify({ officeId: trimmed }) : "{}";

  let res: Response;
  try {
    res = await fetch("/api/billing/sync-subscription-snapshot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body,
    });
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection." };
  }

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    return {
      ok: false,
      error: parseApiErrorJson(parsed) ?? `Sync failed (${res.status})`,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Invalid response from server." };
  }

  return { ok: true, data: parsed as SyncSnapshotSummary };
}
