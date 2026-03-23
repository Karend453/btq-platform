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
