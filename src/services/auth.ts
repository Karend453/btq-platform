import { supabase } from "../lib/supabaseClient";

export type AuthResult =
  | { success: true }
  | { success: false; message: string };

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true };
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

/**
 * UI role for permission logic. Prefer `public.user_profiles.role` (admin | agent).
 * Falls back to TEST_ROLE when unauthenticated or no profile row.
 */
export type UserRole = "Admin" | "Agent";

const TEST_ROLE: UserRole = "Admin";

function mapProfileRoleToUserRole(raw: string | null | undefined): UserRole | null {
  const r = (raw ?? "").trim().toLowerCase();
  if (r === "admin") return "Admin";
  if (r === "agent") return "Agent";
  return null;
}

/**
 * Resolves role from `public.user_profiles` for the signed-in user.
 * Uses TEST_ROLE only when there is no session or no matching profile / unknown role.
 */
export async function getCurrentUserRole(): Promise<UserRole> {
  const user = await getCurrentUser();
  if (!user?.id) return TEST_ROLE;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[getCurrentUserRole] user_profiles:", error.message);
    return TEST_ROLE;
  }

  const mapped = mapProfileRoleToUserRole(data?.role as string | undefined);
  return mapped ?? TEST_ROLE;
}