import { supabase } from "../lib/supabaseClient";
import { getCurrentUser } from "./auth";

/** One row in the broker’s office roster (read-only). */
export type OfficeRosterRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
};

/**
 * Profiles in the same office as the signed-in user, when their profile role is `broker`.
 * Requires RLS policy `user_profiles_select_same_office_broker` (see migrations).
 */
export async function getOfficeRosterForCurrentBroker(): Promise<OfficeRosterRow[]> {
  const user = await getCurrentUser();
  if (!user?.id) return [];

  const { data: viewer, error: viewerError } = await supabase
    .from("user_profiles")
    .select("office_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (viewerError) {
    console.warn("[getOfficeRosterForCurrentBroker] user_profiles:", viewerError.message);
    return [];
  }

  const role = ((viewer?.role as string | undefined) ?? "").trim().toLowerCase();
  if (role !== "broker") return [];

  const officeId = viewer?.office_id as string | null | undefined;
  if (officeId == null || officeId === "") return [];

  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, display_name, email, role")
    .eq("office_id", officeId)
    .order("display_name", { ascending: true, nullsFirst: false })
    .order("email", { ascending: true });

  if (error) {
    console.warn("[getOfficeRosterForCurrentBroker] roster:", error.message);
    return [];
  }

  return (data ?? []) as OfficeRosterRow[];
}
