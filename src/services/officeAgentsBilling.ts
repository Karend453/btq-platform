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

/** Read-model for wallet UI; populated from backend later. */
export type OfficeBillingView = {
  brokerPlanLabel: string;
  brokerPlanDetail: string | null;
  includedSeats: number | null;
  usedSeats: number | null;
  seatNote: string | null;
  estimatedTotalLabel: string | null;
  estimatedDetail: string | null;
  paymentMethodSummary: string | null;
  subscriptionStatusLabel: string | null;
  subscriptionStatusDetail: string | null;
  extraLineItems: { label: string; value: string }[];
};

export type AddOfficeAgentPreviewResult = {
  /** True while actions are mock-only; UI should not imply roster or billing changed. */
  isPreviewOnly: true;
};

export type RemoveOfficeAgentPreviewResult = {
  isPreviewOnly: true;
};

export type BillingPortalSessionResult = {
  url: string | null;
  unavailableReason: string | null;
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

// =============================================================================
// MOCK IMPLEMENTATION — no persistence, no Supabase writes, no Stripe.
// Replace this block with real API calls when backend + Stripe Customer Portal are ready.
// Pages should keep calling the exported functions above; only this section changes.
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

/**
 * Mock: static placeholder snapshot for layout and copy review. Not live billing data.
 */
export async function getOfficeBilling(officeId: string): Promise<ServiceResult<OfficeBillingView>> {
  await mockDelay();
  const id = officeId.trim();
  if (!id) {
    return { ok: false, error: "Office is required." };
  }
  return {
    ok: true,
    data: {
      brokerPlanLabel: "Broker team (preview)",
      brokerPlanDetail:
        "Plan details will appear here once your subscription is connected to the app.",
      includedSeats: null,
      usedSeats: null,
      seatNote: "Seat counts will sync when billing is connected. No manual seat overrides in BTQ.",
      estimatedTotalLabel: "—",
      estimatedDetail:
        "Estimates are unavailable until billing is connected. Nothing here is a quote or invoice.",
      paymentMethodSummary: "Not connected — manage with Brokerteq until the portal is live.",
      subscriptionStatusLabel: "Not connected",
      subscriptionStatusDetail: "Subscription status will show here after Stripe integration.",
      extraLineItems: [
        { label: "Add-ons", value: "None shown (preview)" },
        { label: "Notes", value: "Line items will list billable add-ons when available." },
      ],
    },
  };
}

/**
 * Mock: no Customer Portal URL. Real impl returns `{ url }` from your backend.
 */
export async function createBillingPortalSession(
  officeId: string
): Promise<ServiceResult<BillingPortalSessionResult>> {
  await mockDelay();
  const id = officeId.trim();
  if (!id) {
    return { ok: false, error: "Office is required." };
  }
  return {
    ok: true,
    data: {
      url: null,
      unavailableReason: "Self-serve billing is not connected yet. Use Contact Billing Support for now.",
    },
  };
}

// =============================================================================
// END MOCK IMPLEMENTATION
// =============================================================================
