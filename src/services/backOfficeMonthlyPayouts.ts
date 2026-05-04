import { supabase } from "../lib/supabaseClient";

export type MonthlyPayoutsApiResponse = {
  year: number;
  month: number;
  currency: string;
  amount_paid_out_cents: number;
  payout_count: number;
  period_start: string;
  period_end: string;
};

/** Names the API returns (not amount_paid_cents / invoice_count / count). */
const REQUIRED_KEYS = [
  "year",
  "month",
  "currency",
  "amount_paid_out_cents",
  "payout_count",
  "period_start",
  "period_end",
] as const;

function parseApiError(body: unknown): string | null {
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

function hasOwnPresent(o: Record<string, unknown>, key: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(o, key)) return false;
  const v = o[key];
  return v !== undefined && v !== null;
}

/** Truncate to integer; accepts JSON numbers or numeric strings. */
function toIntLoose(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return 0;
}

/**
 * Maps API JSON to {@link MonthlyPayoutsApiResponse}.
 * Invalid only when body is not a plain object or any required key is absent / nullish.
 */
function parseMonthlyPayoutsSuccessBody(body: unknown): MonthlyPayoutsApiResponse | null {
  if (!body || typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const o = body as Record<string, unknown>;

  for (const key of REQUIRED_KEYS) {
    if (!hasOwnPresent(o, key)) return null;
  }

  const currencyRaw = o.currency;
  const currency =
    typeof currencyRaw === "string" && currencyRaw.trim()
      ? currencyRaw.trim().toLowerCase()
      : "usd";

  return {
    year: toIntLoose(o.year),
    month: toIntLoose(o.month),
    currency,
    amount_paid_out_cents: Math.max(0, toIntLoose(o.amount_paid_out_cents)),
    payout_count: Math.max(0, toIntLoose(o.payout_count)),
    period_start: String(o.period_start),
    period_end: String(o.period_end),
  };
}

/**
 * BTQ Back Office: paid Stripe payouts summed for a calendar month (USD). Requires `btq_admin`;
 * uses Supabase session bearer token (same pattern as wallet-summary).
 */
export async function fetchMonthlyPayoutsSummary(
  year: number,
  month: number
): Promise<{ ok: true; data: MonthlyPayoutsApiResponse } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: "Supabase client unavailable." };

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    return { ok: false, error: "Not signed in." };
  }

  const accessToken =
    typeof session?.access_token === "string" ? session.access_token.trim() : "";
  if (!accessToken) {
    return { ok: false, error: "Not signed in." };
  }

  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  });

  const res = await fetch(`/api/billing/monthly-payouts?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
    },
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Unauthorized" };
  }

  if (!res.ok) {
    return { ok: false, error: parseApiError(body) ?? `Request failed (${res.status})` };
  }

  const parsed = parseMonthlyPayoutsSuccessBody(body);
  if (!parsed) {
    return { ok: false, error: "Invalid response from server." };
  }

  return { ok: true, data: parsed };
}
