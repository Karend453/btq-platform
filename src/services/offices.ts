import { supabase } from "../lib/supabaseClient";
import {
  getBtqAdminActiveOfficeScopeId,
  getCurrentUser,
  getCurrentUserProfileOfficeId,
  getUserProfileRoleKey,
} from "./auth";
import {
  normalizeOfficeIdKey,
  pickActiveOfficeFromMembershipRows,
  type MembershipPickRow,
} from "./officeMembershipOfficePick";

/** Shared projection for `public.offices` reads (single-row fetches). */
const OFFICE_DETAIL_SELECT =
  "id, name, display_name, state, address_line1, city, postal_code, broker_name, broker_email, mls_name, plan_tier, signup_billing_cycle, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_latest_invoice_status, billing_plan_tier, billing_status, billing_seat_quantity, billing_current_period_end, billing_cancel_at_period_end, billing_email, billing_last_invoice_id, billing_last_payment_status, billing_amount_due_cents, billing_currency, billing_last_payment_failed_at, billing_last_payment_succeeded_at, billing_grace_period_ends_at, billing_restricted_at, billing_locked_at, billing_admin_note, billing_updated_at, app_access_status, display_plan_label";

/** Row from `public.offices`. Current office resolution prefers `office_memberships`, with legacy `user_profiles.office_id` fallback. */
export type Office = {
  id: string;
  name: string;
  display_name: string | null;
  state: string | null;
  address_line1: string | null;
  city: string | null;
  postal_code: string | null;
  broker_name: string | null;
  broker_email: string | null;
  mls_name: string | null;
  /** Signup / marketing tier (`complete_broker_signup`). */
  plan_tier?: string | null;
  /**
   * Broker's originally-selected billing cadence at signup (`"monthly"` | `"annual"`). Written
   * once by `resume_pending_broker_signup`; never touched by the Stripe webhook. Used by the
   * `/billing-required` retry screen so an annual pick stays annual through checkout.
   */
  signup_billing_cycle?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_subscription_status?: string | null;
  stripe_latest_invoice_status?: string | null;
  /** Last tier from Stripe metadata / webhook; overrides display when set. */
  billing_plan_tier?: string | null;
  /** BTQ enforcement billing state (not raw Stripe status). */
  billing_status?: string | null;
  billing_seat_quantity?: number | null;
  billing_current_period_end?: string | null;
  billing_cancel_at_period_end?: boolean | null;
  billing_email?: string | null;
  billing_last_invoice_id?: string | null;
  billing_last_payment_status?: string | null;
  billing_amount_due_cents?: number | null;
  billing_currency?: string | null;
  billing_last_payment_failed_at?: string | null;
  billing_last_payment_succeeded_at?: string | null;
  billing_grace_period_ends_at?: string | null;
  billing_restricted_at?: string | null;
  billing_locked_at?: string | null;
  billing_admin_note?: string | null;
  billing_updated_at?: string | null;
  app_access_status?: string | null;
  /** When set, My Subscriptions shows this as the plan name and hides list-price lines (display-only). */
  display_plan_label?: string | null;
};

/**
 * Picks `offices.id` for the signed-in user: active `office_memberships` first (broker first, else
 * newest). `user_profiles.office_id` only when there is no usable membership row — never overrides membership.
 */
function resolveCurrentOfficeIdFromMembershipsAndProfile(
  membershipRows: MembershipPickRow[],
  profileOfficeId: string | null,
  membershipError: Error | null
): string | null {
  if (!membershipError) {
    const picked = pickActiveOfficeFromMembershipRows(membershipRows);
    if (picked) {
      if (
        profileOfficeId &&
        normalizeOfficeIdKey(profileOfficeId) !== normalizeOfficeIdKey(picked)
      ) {
        console.warn("⚠️ profile.office_id mismatch with membership — ignoring profile fallback");
      }
      return picked;
    }
  } else {
    console.warn("[getCurrentOffice] office_memberships:", membershipError.message);
  }

  if (profileOfficeId) {
    console.warn(
      "[getCurrentOffice] Legacy fallback: user_profiles.office_id (no active office_memberships)"
    );
  }
  return profileOfficeId;
}

/**
 * Read-only: loads the office for the signed-in user. Resolves office id from active
 * `office_memberships` first, then falls back to legacy `user_profiles.office_id` when needed.
 * Returns null if unauthenticated, no resolvable office id, missing `offices` row, or query error (e.g. RLS).
 */
export async function getCurrentOffice(): Promise<Office | null> {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const roleKey = await getUserProfileRoleKey();
  if (roleKey === "btq_admin") {
    const activeScopeId = await getBtqAdminActiveOfficeScopeId();
    if (activeScopeId) {
      return getOfficeById(activeScopeId);
    }
  }

  const [{ data: profile, error: profileError }, { data: membershipRows, error: membershipError }] =
    await Promise.all([
      supabase.from("user_profiles").select("office_id").eq("id", user.id).maybeSingle(),
      supabase
        .from("office_memberships")
        .select("office_id, role, created_at")
        .eq("user_id", user.id)
        .eq("status", "active"),
    ]);

  if (profileError) {
    console.warn("[getCurrentOffice] user_profiles:", profileError.message);
  }

  const rawProfileOid = profile?.office_id;
  const profileOfficeId =
    rawProfileOid == null || rawProfileOid === "" ? null : String(rawProfileOid);

  const memErr = membershipError ? new Error(membershipError.message) : null;
  const officeId = resolveCurrentOfficeIdFromMembershipsAndProfile(
    (membershipRows ?? []) as MembershipPickRow[],
    profileOfficeId,
    memErr
  );

  if (officeId == null || officeId === "") return null;

  const { data: office, error: officeError } = await supabase
    .from("offices")
    .select(OFFICE_DETAIL_SELECT)
    .eq("id", officeId)
    .maybeSingle();

  if (officeError) {
    console.warn("[getCurrentOffice] offices:", officeError.message);
    return null;
  }

  return office;
}

/**
 * Read-only: load `public.offices` by primary key (e.g. `transactions.office` UUID).
 * Returns null on empty id, missing row, or query error (e.g. RLS).
 */
export async function getOfficeById(officeId: string): Promise<Office | null> {
  const id = officeId.trim();
  if (!id) return null;

  const { data: office, error: officeError } = await supabase
    .from("offices")
    .select(OFFICE_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (officeError) {
    console.warn("[getOfficeById] offices:", officeError.message);
    return null;
  }

  return office;
}

/**
 * Settings UI: office row for tabs that are office-scoped (My Office, subscriptions snapshot, etc.).
 * Order: {@link getCurrentOffice} (membership-primary + btq_admin session) → legacy profile column
 * via {@link getCurrentUserProfileOfficeId} (logged) → optional `profileOfficeId` from settings context (logged).
 */
export async function getOfficeForSettingsTabs(
  profileOfficeId: string | null | undefined
): Promise<Office | null> {
  const fromSession = await getCurrentOffice();
  if (fromSession) return fromSession;

  const fromProfileColumn = await getCurrentUserProfileOfficeId();
  if (fromProfileColumn) {
    console.warn(
      "[getOfficeForSettingsTabs] Legacy fallback: user_profiles.office_id (after getCurrentOffice returned null)"
    );
    const fromProfile = await getOfficeById(fromProfileColumn);
    if (fromProfile) return fromProfile;
  }

  const oid = typeof profileOfficeId === "string" ? profileOfficeId.trim() : "";
  if (!oid) return null;
  console.warn(
    "[getOfficeForSettingsTabs] Last-resort fallback: settings context office id (membership/session/profile resolution unavailable or offices row missing)"
  );
  return getOfficeById(oid);
}

/**
 * Back Office: row shape returned by `list_offices_for_back_office` (v1),
 * `list_offices_for_back_office_v2`, and `list_offices_for_back_office_v3`.
 * Older RPC callers fill newer columns with null via the V1/V2 mappers.
 */
export type BackOfficeListOfficeRow = {
  id: string;
  name: string;
  display_name: string | null;
  state: string | null;
  address_line1: string | null;
  city: string | null;
  postal_code: string | null;
  broker_name: string | null;
  broker_email: string | null;
  mls_name: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_status: string | null;
  billing_last_payment_failed_at: string | null;
  billing_last_payment_succeeded_at: string | null;
  billing_amount_due_cents: number | null;
  plan_tier: string | null;
  billing_plan_tier: string | null;
  display_plan_label: string | null;
  /** Active `office_memberships` rows for this office. */
  active_member_count: number;
  /** Present when loaded via {@link listOfficesForBackOfficeV2} or v3; otherwise null. */
  signup_billing_cycle: string | null;
  /** Present when loaded via {@link listOfficesForBackOfficeV2} or v3; otherwise null. */
  billing_seat_quantity: number | null;
  /** Present when loaded via {@link listOfficesForBackOfficeV2} or v3; otherwise null. */
  app_access_status: string | null;
  /**
   * Stripe-derived recurring monthly amount in minor units of {@link billing_currency}.
   * Authoritative for "monthly revenue" displays (Wallet, Billing, Business Overview).
   * Present when loaded via {@link listOfficesForBackOfficeV3}; otherwise null.
   */
  billing_monthly_amount_cents: number | null;
  /** ISO currency code for `billing_monthly_amount_cents` (e.g. "usd"). v3 only. */
  billing_currency: string | null;
};

function coerceInt(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

function coerceMemberCount(v: unknown): number {
  const n = coerceInt(v);
  return n != null && n >= 0 ? n : 0;
}

function mapBackOfficeListRowFromV1Rpc(raw: Record<string, unknown>): BackOfficeListOfficeRow {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    display_name: (raw.display_name as string | null) ?? null,
    state: (raw.state as string | null) ?? null,
    address_line1: (raw.address_line1 as string | null) ?? null,
    city: (raw.city as string | null) ?? null,
    postal_code: (raw.postal_code as string | null) ?? null,
    broker_name: (raw.broker_name as string | null) ?? null,
    broker_email: (raw.broker_email as string | null) ?? null,
    mls_name: (raw.mls_name as string | null) ?? null,
    stripe_customer_id: (raw.stripe_customer_id as string | null) ?? null,
    stripe_subscription_id: (raw.stripe_subscription_id as string | null) ?? null,
    billing_status: (raw.billing_status as string | null) ?? null,
    billing_last_payment_failed_at: (raw.billing_last_payment_failed_at as string | null) ?? null,
    billing_last_payment_succeeded_at: (raw.billing_last_payment_succeeded_at as string | null) ?? null,
    billing_amount_due_cents: coerceInt(raw.billing_amount_due_cents),
    plan_tier: (raw.plan_tier as string | null) ?? null,
    billing_plan_tier: (raw.billing_plan_tier as string | null) ?? null,
    display_plan_label: (raw.display_plan_label as string | null) ?? null,
    active_member_count: coerceMemberCount(raw.active_member_count),
    signup_billing_cycle: null,
    billing_seat_quantity: null,
    app_access_status: null,
    billing_monthly_amount_cents: null,
    billing_currency: null,
  };
}

function mapBackOfficeListRowFromV2Rpc(raw: Record<string, unknown>): BackOfficeListOfficeRow {
  return {
    ...mapBackOfficeListRowFromV1Rpc(raw),
    signup_billing_cycle: (raw.signup_billing_cycle as string | null) ?? null,
    billing_seat_quantity: coerceInt(raw.billing_seat_quantity),
    app_access_status: (raw.app_access_status as string | null) ?? null,
  };
}

function mapBackOfficeListRowFromV3Rpc(raw: Record<string, unknown>): BackOfficeListOfficeRow {
  return {
    ...mapBackOfficeListRowFromV2Rpc(raw),
    billing_monthly_amount_cents: coerceInt(raw.billing_monthly_amount_cents),
    billing_currency: (raw.billing_currency as string | null) ?? null,
  };
}

/**
 * Back Office list via legacy RPC `list_offices_for_back_office` (production-stable return shape).
 * For dashboards that need billing-enrichment columns, prefer {@link listOfficesForBackOfficeV2}
 * when `list_offices_for_back_office_v2` is deployed (v1 may be an older RETURNS TABLE on some DBs).
 */
export async function listOfficesForBackOffice(): Promise<{
  offices: BackOfficeListOfficeRow[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("list_offices_for_back_office");

  if (error) {
    console.warn("[listOfficesForBackOffice]", error.message);
    return { offices: [], error: error.message };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return { offices: rows.map(mapBackOfficeListRowFromV1Rpc), error: null };
}

/**
 * Back Office list via `list_offices_for_back_office_v2`: same columns as v1 plus signup cadence,
 * seat quantity, and app access status (Business Overview revenue modeling).
 */
export async function listOfficesForBackOfficeV2(): Promise<{
  offices: BackOfficeListOfficeRow[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("list_offices_for_back_office_v2");

  if (error) {
    console.warn("[listOfficesForBackOfficeV2]", error.message);
    return { offices: [], error: error.message };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return { offices: rows.map(mapBackOfficeListRowFromV2Rpc), error: null };
}

/**
 * Back Office list via `list_offices_for_back_office_v3`: same columns as v2 plus the
 * Stripe-derived `billing_monthly_amount_cents` + `billing_currency`. This is the read
 * path Business Overview and Billing should use for ACTUAL monthly revenue.
 */
export async function listOfficesForBackOfficeV3(): Promise<{
  offices: BackOfficeListOfficeRow[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("list_offices_for_back_office_v3");

  if (error) {
    console.warn("[listOfficesForBackOfficeV3]", error.message);
    return { offices: [], error: error.message };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return { offices: rows.map(mapBackOfficeListRowFromV3Rpc), error: null };
}

export type CreateOfficeForBackOfficeInput = {
  name: string;
  display_name?: string | null;
  state?: string | null;
  address_line1?: string | null;
  city?: string | null;
  postal_code?: string | null;
  broker_name?: string | null;
  broker_email?: string | null;
  mls_name?: string | null;
};

/**
 * Back Office: insert via `create_office_for_back_office` only (same gate as list RPC).
 */
export async function createOfficeForBackOffice(
  input: CreateOfficeForBackOfficeInput
): Promise<{ id: string | null; error: string | null }> {
  const name = input.name.trim();
  if (!name) {
    return { id: null, error: "Name is required." };
  }

  const { data, error } = await supabase.rpc("create_office_for_back_office", {
    p_name: name,
    p_display_name: input.display_name ?? null,
    p_state: input.state ?? null,
    p_address_line1: input.address_line1 ?? null,
    p_city: input.city ?? null,
    p_postal_code: input.postal_code ?? null,
    p_broker_name: input.broker_name ?? null,
    p_broker_email: input.broker_email ?? null,
    p_mls_name: input.mls_name ?? null,
  });

  if (error) {
    console.warn("[createOfficeForBackOffice]", error.message);
    return { id: null, error: error.message };
  }

  const id = data as string | undefined;
  return { id: id ?? null, error: null };
}
