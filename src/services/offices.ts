import { supabase } from "../lib/supabaseClient";
import { getCurrentUser } from "./auth";

/** Row from `public.offices`, keyed by `user_profiles.office_id` → `offices.id`. */
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
};

/**
 * Read-only: loads the office linked to the signed-in user (`user_profiles.office_id` = `offices.id`).
 * Returns null if unauthenticated, no link, missing row, or query error (e.g. RLS).
 */
export async function getCurrentOffice(): Promise<Office | null> {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("office_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.warn("[getCurrentOffice] user_profiles:", profileError.message);
    return null;
  }

  const officeId = profile?.office_id;
  if (officeId == null || officeId === "") return null;

  const { data: office, error: officeError } = await supabase
    .from("offices")
    .select(
      "id, name, display_name, state, address_line1, city, postal_code, broker_name, broker_email, mls_name"
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
      "id, name, display_name, state, address_line1, city, postal_code, broker_name, broker_email, mls_name"
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
