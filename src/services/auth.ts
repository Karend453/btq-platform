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
 * UI role for legacy transaction flows (comments, controls, etc.).
 *
 * Canonical app role is always `public.user_profiles.role` (lowercase: admin | agent | broker).
 * Broker accounts must have `user_profiles.role = 'broker'` in Supabase.
 *
 * Transitional bridge: `getCurrentUserRole()` maps broker → Admin so existing screens keep working
 * until broker is first-class. Use {@link getUserProfileRoleKey} when you must distinguish broker.
 */
export type UserRole = "Admin" | "Agent";

const TEST_ROLE: UserRole = "Admin";

async function fetchUserProfileRoleRaw(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[fetchUserProfileRoleRaw] user_profiles:", error.message);
    return null;
  }

  return (data?.role as string | undefined) ?? null;
}

function mapProfileRoleToUserRole(raw: string | null | undefined): UserRole | null {
  const r = (raw ?? "").trim().toLowerCase();
  if (r === "admin") return "Admin";
  if (r === "agent") return "Agent";
  /** Transitional: broker → Admin for `getCurrentUserRole()` only; not a stable product model. */
  if (r === "broker") return "Admin";
  return null;
}

/**
 * Reads `public.user_profiles.role` (canonical). Broker users: ensure the column is `'broker'`.
 * Use for broker-only UI (e.g. dashboard). Returns null if unauthenticated, missing row, or unknown role.
 */
export async function getUserProfileRoleKey(): Promise<"admin" | "agent" | "broker" | null> {
  const raw = await fetchUserProfileRoleRaw();
  const r = (raw ?? "").trim().toLowerCase();
  if (r === "admin") return "admin";
  if (r === "agent") return "agent";
  if (r === "broker") return "broker";
  return null;
}

/**
 * Canonical runtime role for transaction screens (RLS + document engine). Does not map broker → admin.
 * Unknown/missing profile defaults to `"admin"` to match legacy fallback behavior.
 */
export type TransactionRuntimeRole = "agent" | "admin" | "broker";

/** PascalCase role used in transaction UI state and checklist comments. */
export type UiTransactionRole = "Admin" | "Agent" | "Broker";

export async function getTransactionRuntimeRole(): Promise<TransactionRuntimeRole> {
  const raw = await fetchUserProfileRoleRaw();
  const r = (raw ?? "").trim().toLowerCase();
  if (r === "agent") return "agent";
  if (r === "broker") return "broker";
  if (r === "admin") return "admin";
  return "admin";
}

export function transactionRuntimeRoleToUiRole(r: TransactionRuntimeRole): UiTransactionRole {
  if (r === "agent") return "Agent";
  if (r === "broker") return "Broker";
  return "Admin";
}

/** Single engine role for `buildEngineUser({ roles: [...] })` on transaction surfaces. */
export function uiTransactionRoleToEngineRole(
  r: UiTransactionRole
): "ADMIN" | "AGENT" | "BROKER" {
  if (r === "Broker") return "BROKER";
  if (r === "Admin") return "ADMIN";
  return "AGENT";
}

/**
 * Legacy `Admin` | `Agent` for transaction UI. Broker profiles map to `Admin` (transitional bridge).
 * Prefer {@link getUserProfileRoleKey} when the distinction matters.
 */
export async function getCurrentUserRole(): Promise<UserRole> {
  const raw = await fetchUserProfileRoleRaw();
  const mapped = mapProfileRoleToUserRole(raw);
  return mapped ?? TEST_ROLE;
}

/** Read-only account fields from `user_profiles` for Settings → Account Info (personal data, not office). */
export type AccountInfoReadonly = {
  display_name: string | null;
  email: string | null;
  role: string | null;
};

export async function getAccountInfoReadonly(): Promise<AccountInfoReadonly | null> {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("display_name, email, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[getAccountInfoReadonly] user_profiles:", error.message);
    return null;
  }

  return {
    display_name: (data?.display_name as string | undefined) ?? null,
    email: (data?.email as string | undefined) ?? null,
    role: (data?.role as string | undefined) ?? null,
  };
}