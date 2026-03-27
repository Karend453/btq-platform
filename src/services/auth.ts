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
 * Canonical app role is always `public.user_profiles.role` (lowercase: admin | agent | broker | btq_admin).
 * Broker accounts must have `user_profiles.role = 'broker'` in Supabase.
 *
 * Transitional bridge: `getCurrentUserRole()` maps broker → Admin so existing screens keep working
 * until broker is first-class. Use {@link getUserProfileRoleKey} when you must distinguish broker.
 */
export type UserRole = "Admin" | "Agent";

const TEST_ROLE: UserRole = "Admin";

async function fetchUserProfileRoleRaw(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user?.id) {
    // TEMP DEBUG — remove after diagnosing profile role / RLS
    console.log("[DEBUG auth] fetchUserProfileRoleRaw: no auth user id", {
      hasUser: !!user,
      email: user?.email ?? null,
    });
    return null;
  }

  // TEMP DEBUG — remove after diagnosing profile role / RLS
  console.log("[DEBUG auth] fetchUserProfileRoleRaw: auth user", {
    id: user.id,
    email: user.email ?? null,
  });

  const { data, error } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const rawRole = (data?.role as string | undefined) ?? null;

  if (error) {
    console.warn("[fetchUserProfileRoleRaw] user_profiles:", error.message);
    // TEMP DEBUG — remove after diagnosing profile role / RLS
    console.log("[DEBUG auth] fetchUserProfileRoleRaw: Supabase error", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }

  // TEMP DEBUG — remove after diagnosing profile role / RLS
  console.log("[DEBUG auth] fetchUserProfileRoleRaw: user_profiles row", {
    rawRoleFromDb: rawRole,
    dataWasNull: data == null,
  });

  return rawRole;
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
export async function getUserProfileRoleKey(): Promise<"admin" | "agent" | "broker" | "btq_admin" | null> {
  const raw = await fetchUserProfileRoleRaw();
  const r = (raw ?? "").trim().toLowerCase();
  let key: "admin" | "agent" | "broker" | "btq_admin" | null = null;
  if (r === "admin") key = "admin";
  else if (r === "agent") key = "agent";
  else if (r === "broker") key = "broker";
  else if (r === "btq_admin") key = "btq_admin";

  // TEMP DEBUG — remove after diagnosing profile role / RLS
  console.log("[DEBUG auth] getUserProfileRoleKey", {
    rawRoleFromDb: raw,
    normalizedLower: r,
    key,
  });

  return key;
}

/**
 * Whether the signed-in user may access BTQ Back Office routes and nav (org management, etc.).
 *
 * Returns true only when the profile role key is `"btq_admin"` (Brokerteq internal). Other profile
 * roles, including `"admin"`, do not grant access here. This is intentionally separate from
 * transaction/runtime role mappings.
 *
 * Mirrors the authorization check inside `public.list_offices_for_back_office` (SECURITY DEFINER).
 */
export function canAccessBtqBackOffice(
  roleKey: "admin" | "agent" | "broker" | "btq_admin" | null
): boolean {
  return roleKey === "btq_admin";
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

/** Single-row profile for Settings: one query shared across `/settings` tabs (see SettingsProfileProvider). */
export type UserProfileSnapshot = {
  id: string;
  email: string | null;
  role: string | null;
  display_name: string | null;
  office_id: string | null;
};

export async function getCurrentUserProfileSnapshot(): Promise<UserProfileSnapshot | null> {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, email, role, display_name, office_id")
    .eq("id", user.id)
    .single();

    if (error) {
      throw new Error(error.message);
    }

  return data as UserProfileSnapshot;
}

/**
 * `user_profiles.office_id` for the signed-in user — use as canonical `p_office_id` for broker-only
 * RPCs that compare against the profile (e.g. `clone_btq_starter_to_office`).
 */
export async function getCurrentUserProfileOfficeId(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("office_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[getCurrentUserProfileOfficeId] user_profiles:", error.message);
    return null;
  }

  const oid = data?.office_id;
  if (oid == null || oid === "") return null;
  return typeof oid === "string" ? oid : String(oid);
}

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