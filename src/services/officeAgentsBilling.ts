import { supabase } from "../lib/supabaseClient";
import type { BillingPortalSessionResponse, WalletBillingSummary } from "../types/billing";
import { getOfficeRosterForOfficeId, type OfficeRosterRow } from "./officeRoster";

/** Roster row shape; single source of truth remains `user_profiles` via {@link getOfficeRosterForOfficeId}. */
export type OfficeAgent = OfficeRosterRow;

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type AddOfficeAgentPayload = {
  email: string;
  display_name?: string | null;
};

export type AddOfficeAgentPreviewResult = {
  /** True while actions are mock-only; UI should not imply roster or billing changed. */
  isPreviewOnly: true;
};

export type RemoveOfficeAgentPreviewResult = {
  isPreviewOnly: true;
};

/**
 * Live roster read — delegates to `officeRoster` (Supabase / `user_profiles` only).
 */
export async function getOfficeAgents(officeId: string): Promise<{
  agents: OfficeAgent[];
  error: string | null;
}> {
  const id = officeId.trim();
  if (!id) return { agents: [], error: null };
  const { rows, error } = await getOfficeRosterForOfficeId(id);
  return { agents: rows, error };
}

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
 * Live wallet summary: server resolves the user’s office from profile + memberships, then reads
 * `offices.stripe_subscription_id` and Stripe (no browser Stripe calls).
 */
export async function getWalletBillingSummary(): Promise<ServiceResult<WalletBillingSummary>> {
  if (!supabase) return { ok: false, error: "Supabase client unavailable." };

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    return { ok: false, error: "Not signed in." };
  }

  const res = await fetch("/api/billing/wallet-summary", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    return { ok: false, error: parseApiErrorJson(body) ?? `Request failed (${res.status})` };
  }

  if (!body || typeof body !== "object" || body === null || !("connected" in body)) {
    return { ok: false, error: "Invalid response from server." };
  }

  return { ok: true, data: body as WalletBillingSummary };
}

/**
 * Stripe Customer Portal — server resolves office and `stripe_customer_id`; returns a hosted session URL.
 */
export async function createBillingPortalSession(): Promise<
  ServiceResult<BillingPortalSessionResponse>
> {
  if (!supabase) return { ok: false, error: "Supabase client unavailable." };

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    return { ok: false, error: "Not signed in." };
  }

  const res = await fetch("/api/billing/create-billing-portal-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: "{}",
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    return { ok: false, error: parseApiErrorJson(body) ?? `Request failed (${res.status})` };
  }

  if (
    !body ||
    typeof body !== "object" ||
    body === null ||
    !("url" in body) ||
    typeof (body as { url: unknown }).url !== "string"
  ) {
    return { ok: false, error: "Invalid response from server." };
  }

  return { ok: true, data: { url: (body as { url: string }).url } };
}

// =============================================================================
// MOCK — team add/remove only (no persistence). Replace when team APIs are wired.
// =============================================================================

const MOCK_LATENCY_MS = 450;

function mockDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Mock: simulates validation only. Does not create users or change `user_profiles`.
 */
export async function addOfficeAgent(
  officeId: string,
  payload: AddOfficeAgentPayload
): Promise<ServiceResult<AddOfficeAgentPreviewResult>> {
  await mockDelay();
  const id = officeId.trim();
  if (!id) {
    return { ok: false, error: "Office is required." };
  }
  const email = normalizeEmail(payload.email);
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }
  return { ok: true, data: { isPreviewOnly: true } };
}

/**
 * Mock: no database delete. Safe to swap for a real endpoint later.
 */
export async function removeOfficeAgent(
  officeId: string,
  agentId: string
): Promise<ServiceResult<RemoveOfficeAgentPreviewResult>> {
  await mockDelay();
  const oid = officeId.trim();
  const aid = agentId.trim();
  if (!oid) return { ok: false, error: "Office is required." };
  if (!aid) return { ok: false, error: "Agent is required." };
  return { ok: true, data: { isPreviewOnly: true } };
}

// =============================================================================
// END MOCK IMPLEMENTATION
// =============================================================================
