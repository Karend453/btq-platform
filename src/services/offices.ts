import { supabase } from "../lib/supabaseClient";
import { getCurrentUser } from "./auth";

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
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  /** Last tier from Stripe metadata / webhook; overrides display when set. */
  billing_plan_tier?: string | null;
  billing_status?: string | null;
  billing_seat_quantity?: number | null;
  billing_current_period_end?: string | null;
  billing_cancel_at_period_end?: boolean | null;
  billing_email?: string | null;
  app_access_status?: string | null;
};

/**
 * Picks which `offices.id` to treat as the signed-in user's current office.
 * Prefers active `office_memberships`; uses `user_profiles.office_id` when there are no memberships
 * or (if multiple memberships) when the legacy field matches one of them; otherwise oldest membership wins.
 */
function resolveCurrentOfficeIdFromMembershipsAndProfile(
  membershipRows: { office_id: string }[],
  profileOfficeId: string | null,
  membershipError: Error | null,
): string | null {
  if (membershipError) {
    console.warn("[getCurrentOffice] office_memberships:", membershipError.message);
    return profileOfficeId;
  }

  const ids = membershipRows.map((r) => r.office_id).filter((id) => id != null && String(id).trim() !== "");
  if (ids.length === 0) return profileOfficeId;
  if (ids.length === 1) return ids[0] ?? null;

  if (profileOfficeId && ids.includes(profileOfficeId)) return profileOfficeId;
  return ids[0] ?? null;
}

/**
 * Read-only: loads the office for the signed-in user. Resolves office id from active
 * `office_memberships` first, then falls back to legacy `user_profiles.office_id` when needed.
 * Returns null if unauthenticated, no resolvable office id, missing `offices` row, or query error (e.g. RLS).
 */
export async function getCurrentOffice(): Promise<Office | null> {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const [{ data: profile, error: profileError }, { data: membershipRows, error: membershipError }] =
    await Promise.all([
      supabase.from("user_profiles").select("office_id").eq("id", user.id).maybeSingle(),
      supabase
        .from("office_memberships")
        .select("office_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
    ]);

  if (profileError) {
    console.warn("[getCurrentOffice] user_profiles:", profileError.message);
  }

  const rawProfileOid = profile?.office_id;
  const profileOfficeId =
    rawProfileOid == null || rawProfileOid === "" ? null : String(rawProfileOid);

  const memErr = membershipError ? new Error(membershipError.message) : null;
  const officeId = resolveCurrentOfficeIdFromMembershipsAndProfile(
    (membershipRows ?? []) as { office_id: string }[],
    profileOfficeId,
    memErr,
  );

  if (officeId == null || officeId === "") return null;

  const { data: office, error: officeError } = await supabase
    .from("offices")
    .select(
      "id, name, display_name, state, address_line1, city, postal_code, broker_name, broker_email, mls_name, plan_tier, stripe_customer_id, stripe_subscription_id, billing_plan_tier, billing_status, billing_seat_quantity, billing_current_period_end, billing_cancel_at_period_end, billing_email, app_access_status"
    )
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
    .select(
      "id, name, display_name, state, address_line1, city, postal_code, broker_name, broker_email, mls_name, plan_tier, stripe_customer_id, stripe_subscription_id, billing_plan_tier, billing_status, billing_seat_quantity, billing_current_period_end, billing_cancel_at_period_end, billing_email, app_access_status"
    )
    .eq("id", id)
    .maybeSingle();

  if (officeError) {
    console.warn("[getOfficeById] offices:", officeError.message);
    return null;
  }

  return office;
}

/**
 * Back Office: full office list **only** via `list_offices_for_back_office` (no client `select` on
 * `public.offices` for the list). The RPC enforces a temporary **`admin`-only** BTQ wall in the DB
 * (same semantics as `canAccessBtqBackOffice` in `auth.ts`); not the final role model.
 */
export async function listOfficesForBackOffice(): Promise<{
  offices: Office[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("list_offices_for_back_office");

  if (error) {
    console.warn("[listOfficesForBackOffice]", error.message);
    return { offices: [], error: error.message };
  }

  return { offices: (data ?? []) as Office[], error: null };
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
 * Back Office: insert via `create_office_for_back_office` only (temporary `admin` gate in DB).
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
