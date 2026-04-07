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

/** Sends Supabase password recovery email. Add `redirectTo` origin + `/reset-password` in Supabase Auth → URL Configuration. */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) {
    return { success: false, message: "Supabase client unavailable" };
  }
  const trimmed = email.trim();
  if (!trimmed) {
    return { success: false, message: "Enter your email address." };
  }
  const redirectTo = `${window.location.origin}/reset-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });
  if (error) {
    return { success: false, message: error.message };
  }
  return { success: true };
}

/** Call while a recovery session is active (after following the email link). */
export async function updatePasswordFromRecovery(newPassword: string): Promise<AuthResult> {
  if (!supabase) {
    return { success: false, message: "Supabase client unavailable" };
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { success: false, message: error.message };
  }
  return { success: true };
}

export type SignUpWithPasswordResult =
  | { success: true; sessionEstablished: boolean }
  | { success: false; message: string };

/** Email/password registration (broker onboarding). */
export async function signUpWithPassword(
  email: string,
  password: string,
  options?: { displayName?: string }
): Promise<SignUpWithPasswordResult> {
  if (!supabase) {
    return { success: false, message: "Supabase client unavailable" };
  }

  console.log("about to call supabase.auth.signUp", email);
  const { error, data } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: options?.displayName
        ? { display_name: options.displayName }
        : undefined,
    },
  });

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true, sessionEstablished: !!data.session };
}

export type CompleteBrokerSignupResult =
  | { success: true; officeId: string }
  | { success: false; message: string };

/**
 * After successful auth session, provisions `offices` row and sets `user_profiles.role = broker`.
 * Returns the new `offices.id` from `complete_broker_signup` for Stripe Checkout metadata.
 */
export async function completeBrokerSignup(input: {
  displayName: string;
  officeName: string;
  teamName: string;
  firmAddress: string;
  state: string;
  mlsName: string;
  mlsUrl: string;
  landvoiceLeads: string;
  /** Optional; empty omitted in RPC as null. */
  referral: string | null;
  brokerPhone?: string | null;
  planKey: string | null;
}): Promise<CompleteBrokerSignupResult> {
  if (!supabase) {
    return { success: false, message: "Supabase client unavailable" };
  }

  const { data, error } = await supabase.rpc("complete_broker_signup", {
    p_display_name: input.displayName,
    p_office_name: input.officeName,
    p_team_name: input.teamName,
    p_firm_address: input.firmAddress,
    p_state: input.state,
    p_mls_name: input.mlsName,
    p_mls_url: input.mlsUrl,
    p_landvoice_leads: input.landvoiceLeads,
    p_referral: input.referral?.trim() || null,
    p_broker_phone: input.brokerPhone?.trim() || null,
    p_plan_key: input.planKey?.trim().toLowerCase() || null,
  });

  if (error) {
    return { success: false, message: error.message };
  }

  const raw = data as unknown;
  const officeId =
    typeof raw === "string"
      ? raw.trim()
      : raw != null
        ? String(raw).trim()
        : "";
  if (!officeId) {
    return { success: false, message: "Office id missing from signup response" };
  }

  return { success: true, officeId };
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
  const r = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
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
  if (roleKey === "btq_admin") return true;
  return false;
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

/** Default GCI goal when `user_profiles.personal_gci_goal` is null (analytics / client portfolio). */
export const DEFAULT_PERSONAL_GCI_GOAL = 3_000_000;

/** Map stored profile value to the dollar amount used for progress (positive number, or default). */
export function resolvePersonalGciGoalAmount(
  raw: number | string | null | undefined
): number {
  if (raw == null || raw === "") return DEFAULT_PERSONAL_GCI_GOAL;
  const n = typeof raw === "string" ? Number(raw) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PERSONAL_GCI_GOAL;
  return n;
}

/** Single-row profile for Settings: one query shared across `/settings` tabs (see SettingsProfileProvider). */
export type UserProfileSnapshot = {
  id: string;
  email: string | null;
  role: string | null;
  display_name: string | null;
  office_id: string | null;
  personal_gci_goal: number | null;
};

export async function getCurrentUserProfileSnapshot(): Promise<UserProfileSnapshot | null> {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, email, role, display_name, office_id, personal_gci_goal")
    .eq("id", user.id)
    .single();

    if (error) {
      throw new Error(error.message);
    }

  return data as UserProfileSnapshot;
}

/** Persist nullable personal GCI goal; use RPC so RLS does not require broad `user_profiles` UPDATE. */
export async function setPersonalGciGoal(
  goal: number | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!supabase) {
    return { ok: false, message: "Supabase client unavailable" };
  }
  const { error } = await supabase.rpc("set_my_personal_gci_goal", { p_goal: goal });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
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

/**
 * Office-scoped reads/writes (transactions, client_portfolio, analytics): filter by
 * `user_profiles.office_id` whenever it is set — not only when `role === "broker"`.
 * Otherwise a null/unknown role with a valid `office_id` skipped filtering and returned all rows.
 *
 * - `btq_admin`: client-side scope is omitted (rely on RLS for internal operators).
 * - `broker` with no `office_id`: `denyAll` — empty lists / denied access for office-bound resources.
 */
export async function resolveOfficeScopedDataAccess(): Promise<{
  scopeOfficeId: string | null;
  denyAll: boolean;
}> {
  const roleKey = await getUserProfileRoleKey();
  const profileOfficeId = await getCurrentUserProfileOfficeId();

  if (roleKey === "btq_admin") {
    return { scopeOfficeId: null, denyAll: false };
  }
  if (profileOfficeId) {
    return { scopeOfficeId: profileOfficeId, denyAll: false };
  }
  if (roleKey === "broker") {
    return { scopeOfficeId: null, denyAll: true };
  }
  return { scopeOfficeId: null, denyAll: false };
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