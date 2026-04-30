import { supabase } from "../lib/supabaseClient";
import { getCurrentUser } from "./auth";
import {
  normalizeOfficeIdKey,
  pickActiveOfficeFromMembershipRows,
  type MembershipPickRow,
} from "./officeMembershipOfficePick";

/** Canonical keys for office membership role (lowercase); stored on `office_memberships.role`. */
export type OfficeRole = "agent" | "admin" | "broker" | "btq_admin";

export type OfficeRosterMember = {
  id: string;
  office_id: string;
  email: string | null;
  role: string | null;
  display_name: string | null;
  created_at: string;
  invite_email?: string | null;
  /** `office_memberships.status` when loaded (e.g. `active`, `pending`). */
  status?: string | null;
};

export type OfficeRosterSummary = {
  brokerCount: number;
  adminCount: number;
  agentCount: number;
  /** `admin` + `agent` — billable seats (broker is included in base plan, not an extra seat). */
  projectedBillableSeats: number;
  /** Internal BTQ users excluded from customer-facing roster and billing counts. */
  btqAdminExcludedCount: number;
};

function normalizeRole(role: string | null | undefined): string {
  return (role ?? "").trim().toLowerCase();
}

/** `agent` and `admin` count toward billable seats; `broker` is base plan; `btq_admin` is internal. */
export function isBillableSeatRole(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return r === "agent" || r === "admin";
}

/** Roles shown on broker-facing roster UIs (`btq_admin` hidden). */
export function isVisibleCustomerRosterRole(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return r === "broker" || r === "admin" || r === "agent";
}

export function memberDisplayName(
  m: Pick<OfficeRosterMember, "display_name" | "email" | "invite_email">,
): string {
  const name = m.display_name?.trim();
  if (name) return name;
  const email = m.email?.trim();
  if (email) return email;
  const invite = m.invite_email?.trim();
  if (invite) return invite;
  return "—";
}

/** Human-readable label for an office membership role (settings, roster tables, back office). */
export function formatOfficeRoleLabel(role: string | null | undefined): string {
  const r = normalizeRole(role);
  if (r === "admin") return "Admin";
  if (r === "agent") return "Agent";
  if (r === "broker") return "Broker";
  if (r === "btq_admin") return "BTQ Admin";
  return "—";
}

/**
 * Split roster members into broker / admin / agent buckets for UI. Only includes roles allowed by
 * {@link isVisibleCustomerRosterRole}; other roles are omitted.
 */
export function partitionCustomerRosterByRole(members: OfficeRosterMember[]): {
  brokers: OfficeRosterMember[];
  admins: OfficeRosterMember[];
  agents: OfficeRosterMember[];
} {
  const visible = members.filter((m) => isVisibleCustomerRosterRole(m.role));
  const brokers: OfficeRosterMember[] = [];
  const admins: OfficeRosterMember[] = [];
  const agents: OfficeRosterMember[] = [];
  for (const m of visible) {
    const r = normalizeRole(m.role);
    if (r === "broker") brokers.push(m);
    else if (r === "admin") admins.push(m);
    else if (r === "agent") agents.push(m);
  }
  return { brokers, admins, agents };
}

export function summarizeOfficeRoster(members: OfficeRosterMember[]): OfficeRosterSummary {
  let brokerCount = 0;
  let adminCount = 0;
  let agentCount = 0;
  let btqAdminExcludedCount = 0;

  for (const m of members) {
    const r = normalizeRole(m.role);
    if (r === "btq_admin") {
      btqAdminExcludedCount += 1;
      continue;
    }
    if (r === "broker") brokerCount += 1;
    else if (r === "admin") adminCount += 1;
    else if (r === "agent") agentCount += 1;
  }

  return {
    brokerCount,
    adminCount,
    agentCount,
    projectedBillableSeats: adminCount + agentCount,
    btqAdminExcludedCount,
  };
}

type MembershipProfileJoin = {
  email: string | null;
  display_name: string | null;
};

type OfficeMembershipQueryRow = {
  id: string;
  office_id: string;
  user_id: string;
  role: string | null;
  status: string;
  created_at: string;
  invite_email: string | null;
  user_profiles: MembershipProfileJoin | MembershipProfileJoin[] | null;
};

function unwrapJoinedProfile(
  profile: OfficeMembershipQueryRow["user_profiles"],
): MembershipProfileJoin | null {
  if (profile == null) return null;
  return Array.isArray(profile) ? profile[0] ?? null : profile;
}

/** Maps active `office_memberships` rows (+ joined profile) to the flat roster shape used across the app. */
function mapOfficeMembershipToRosterMember(row: OfficeMembershipQueryRow): OfficeRosterMember {
  const p = unwrapJoinedProfile(row.user_profiles);
  const userId = row.user_id?.trim();
  return {
    id: userId ? userId : row.id,
    office_id: row.office_id,
    email: p?.email ?? null,
    role: row.role ?? null,
    display_name: p?.display_name ?? null,
    created_at: row.created_at,
    invite_email: row.invite_email ?? null,
    status: row.status ?? null,
  };
}

/** Display order: broker → btq_admin → admin → agent; unknown roles last. */
const ROSTER_ROLE_PRIORITY: Record<string, number> = {
  broker: 1,
  btq_admin: 2,
  admin: 3,
  agent: 4,
};

function rosterRolePriority(role: string | null | undefined): number {
  return ROSTER_ROLE_PRIORITY[normalizeRole(role)] ?? 99;
}

function compareRosterMembersByRoleThenName(a: OfficeRosterMember, b: OfficeRosterMember): number {
  const pr = rosterRolePriority(a.role) - rosterRolePriority(b.role);
  if (pr !== 0) return pr;
  return memberDisplayName(a).localeCompare(memberDisplayName(b), undefined, { sensitivity: "base" });
}

/** Same ordering used for active and pending roster lists: role rank, then display name. */
export function sortOfficeRosterMembers(members: OfficeRosterMember[]): OfficeRosterMember[] {
  return [...members].sort(compareRosterMembersByRoleThenName);
}

/**
 * Office roster from `office_memberships` (active only), joined to `user_profiles` for identity fields.
 * Same office scope as {@link getCurrentOffice} when listing the broker’s office.
 */
export async function listOfficeRoster(officeId: string): Promise<{
  members: OfficeRosterMember[];
  error: string | null;
}> {
  const id = officeId.trim();
  if (!id) return { members: [], error: null };

  const { data, error } = await supabase
    .from("office_memberships")
    .select(
      `
      id,
      office_id,
      user_id,
      role,
      status,
      created_at,
      invite_email,
      user_profiles (
        display_name,
        email
      )
    `,
    )
    .eq("office_id", id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    return { members: [], error: error.message };
  }

  const rows = (data ?? []) as OfficeMembershipQueryRow[];
  return {
    members: sortOfficeRosterMembers(rows.map(mapOfficeMembershipToRosterMember)),
    error: null,
  };
}

/**
 * Pending admin/agent invites (`status = pending`): invitation sent, not yet accepted.
 * Removed/deactivated members use `inactive` and do not appear here.
 */
export async function listOfficePendingRoster(officeId: string): Promise<{
  members: OfficeRosterMember[];
  error: string | null;
}> {
  const id = officeId.trim();
  if (!id) return { members: [], error: null };

  const { data, error } = await supabase
    .from("office_memberships")
    .select(
      `
      id,
      office_id,
      user_id,
      role,
      status,
      created_at,
      invite_email,
      user_profiles (
        display_name,
        email
      )
    `,
    )
    .eq("office_id", id)
    .eq("status", "pending")
    .in("role", ["admin", "agent"])
    .order("created_at", { ascending: true });

  if (error) {
    return { members: [], error: error.message };
  }

  const rows = (data ?? []) as OfficeMembershipQueryRow[];
  return {
    members: sortOfficeRosterMembers(rows.map(mapOfficeMembershipToRosterMember)),
    error: null,
  };
}

/** Same rows as {@link listOfficeRoster}; kept for call sites that expect `{ rows }`. */
export type OfficeRosterRow = OfficeRosterMember;

export async function getOfficeRosterForOfficeId(officeId: string): Promise<{
  rows: OfficeRosterMember[];
  error: string | null;
}> {
  const { members, error } = await listOfficeRoster(officeId);
  return { rows: members, error };
}

/**
 * Profiles in the same office as the signed-in user when their profile role is `broker`.
 * Office scope: active `office_memberships` first (same pick as billing/offices), then legacy
 * `user_profiles.office_id` with a warning. Requires RLS allowing brokers to read same-office data.
 */
export async function getOfficeRosterForCurrentBroker(): Promise<OfficeRosterMember[]> {
  const user = await getCurrentUser();
  if (!user?.id) return [];

  const [{ data: viewer, error: viewerError }, { data: memRows, error: memError }] = await Promise.all([
    supabase.from("user_profiles").select("office_id, role").eq("id", user.id).maybeSingle(),
    supabase
      .from("office_memberships")
      .select("office_id, role, created_at")
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);

  if (viewerError) {
    console.warn("[getOfficeRosterForCurrentBroker] user_profiles:", viewerError.message);
    return [];
  }

  const role = normalizeRole(viewer?.role as string | undefined);
  if (role !== "broker") return [];

  if (memError) {
    console.warn("[getOfficeRosterForCurrentBroker] office_memberships:", memError.message);
  }

  let officeId: string | null = null;
  if (!memError && memRows) {
    officeId = pickActiveOfficeFromMembershipRows((memRows ?? []) as MembershipPickRow[]);
  }

  const profileOidRaw = viewer?.office_id;
  const profileOfficeId =
    profileOidRaw == null || profileOidRaw === "" ? null : String(profileOidRaw).trim();

  if (officeId) {
    if (
      profileOfficeId &&
      normalizeOfficeIdKey(profileOfficeId) !== normalizeOfficeIdKey(officeId)
    ) {
      console.warn("⚠️ profile.office_id mismatch with membership — ignoring profile fallback");
    }
  } else if (profileOfficeId) {
    console.warn(
      "[getOfficeRosterForCurrentBroker] Legacy fallback: user_profiles.office_id (no active office_memberships)"
    );
    officeId = profileOfficeId;
  }

  if (officeId == null || officeId === "") return [];

  const { members, error } = await listOfficeRoster(officeId);
  if (error) {
    console.warn("[getOfficeRosterForCurrentBroker] roster:", error);
    return [];
  }

  return members;
}

/** Roles a broker can assign when adding someone to the office (`broker_add_office_member`). */
export type TeamAddableOfficeRole = "admin" | "agent";

async function billingApiHeaders(): Promise<
  { ok: true; headers: Record<string, string> } | { ok: false; error: string }
> {
  if (!supabase) return { ok: false, error: "Supabase client unavailable" };
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    return { ok: false, error: "Not signed in." };
  }
  return {
    ok: true,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
    },
  };
}

function parseApiErrorJson(body: unknown): string | null {
  if (
    body &&
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return null;
}

function parseBillingSyncWarning(body: unknown): string | null {
  if (!body || typeof body !== "object" || body === null) return null;
  const w = (body as { billingSyncWarning?: unknown }).billingSyncWarning;
  if (typeof w !== "string") return null;
  const s = w.trim();
  return s.length > 0 ? s : null;
}

function parseApiErrorMeta(body: unknown): { code?: string; targetUserId?: string } {
  if (!body || typeof body !== "object" || body === null) return {};
  const o = body as { code?: unknown; targetUserId?: unknown };
  return {
    code: typeof o.code === "string" ? o.code : undefined,
    targetUserId: typeof o.targetUserId === "string" ? o.targetUserId : undefined,
  };
}

/**
 * Adds or reactivates a team member: validates, updates Stripe when seat count increases, then invites new
 * users or attaches existing users via `office_memberships` (service role on the server).
 */
export async function brokerAddOfficeMember(params: {
  officeId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: TeamAddableOfficeRole;
}): Promise<{ error: string | null; code?: string; targetUserId?: string }> {
  const officeId = params.officeId.trim();
  const firstName = params.firstName.trim();
  const lastName = params.lastName.trim();
  const email = params.email.trim();
  if (!officeId) return { error: "Office is required." };
  if (!firstName || !lastName) return { error: "First and last name are required." };
  if (!email) return { error: "Email is required." };

  const h = await billingApiHeaders();
  if (!h.ok) return { error: h.error };

  const res = await fetch("/api/billing/add-team-member", {
    method: "POST",
    headers: h.headers,
    body: JSON.stringify({
      officeId,
      firstName,
      lastName,
      email,
      role: params.role,
    }),
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const meta = parseApiErrorMeta(body);
    return {
      error: parseApiErrorJson(body) || `Request failed (${res.status})`,
      code: meta.code,
      targetUserId: meta.targetUserId,
    };
  }
  return { error: null };
}

export async function brokerResendTeamInvite(params: {
  officeId: string;
  userId: string;
}): Promise<{ error: string | null }> {
  const officeId = params.officeId.trim();
  const userId = params.userId.trim();
  if (!officeId || !userId) return { error: "Office and member are required." };

  const h = await billingApiHeaders();
  if (!h.ok) return { error: h.error };

  const res = await fetch("/api/billing/resend-team-invite", {
    method: "POST",
    headers: h.headers,
    body: JSON.stringify({ officeId, userId }),
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    return { error: parseApiErrorJson(body) || `Request failed (${res.status})` };
  }

  return { error: null };
}

/**
 * After login: promote own `pending` admin/agent memberships to `active`, then sync Stripe seats per office.
 */
export async function activatePendingOfficeMembershipsForSession(): Promise<void> {
  if (!supabase) return;
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData.session?.access_token) return;

  const { data: rows, error: rpcErr } = await supabase.rpc("activate_pending_office_memberships_for_user");
  if (rpcErr) {
    console.warn("[officeRoster] activate_pending_office_memberships_for_user:", rpcErr.message);
    return;
  }

  const raw = rows as unknown;
  const officeIds: string[] = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string")
    : [];

  const token = sessionData.session.access_token;
  for (const officeId of officeIds) {
    const res = await fetch("/api/billing/sync-subscription-seats", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ officeId }),
    });
    if (!res.ok) {
      console.warn("[officeRoster] sync-subscription-seats after pending activation", officeId, res.status);
    }
  }
}

export async function brokerRemoveTeamInvite(params: {
  officeId: string;
  userId: string;
}): Promise<{ error: string | null; billingSyncWarning?: string | null }> {
  const officeId = params.officeId.trim();
  const userId = params.userId.trim();
  if (!officeId || !userId) return { error: "Office and member are required." };

  const h = await billingApiHeaders();
  if (!h.ok) return { error: h.error };

  const res = await fetch("/api/billing/remove-team-invite", {
    method: "POST",
    headers: h.headers,
    body: JSON.stringify({ officeId, userId }),
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    return { error: parseApiErrorJson(body) || `Request failed (${res.status})` };
  }
  const billingSyncWarning = parseBillingSyncWarning(body);
  return billingSyncWarning ? { error: null, billingSyncWarning } : { error: null };
}

/**
 * Soft-removes a member: sets `office_memberships.status = inactive` (no delete, no `user_profiles` changes).
 * Then syncs Stripe seat quantity to match admin+agent memberships with status active or pending. If Stripe sync fails, deactivation still stands.
 */
export async function brokerDeactivateOfficeMember(params: {
  officeId: string;
  userId: string;
}): Promise<{ error: string | null; billingSyncWarning?: string | null }> {
  if (!supabase) return { error: "Supabase client unavailable" };
  const officeId = params.officeId.trim();
  const userId = params.userId.trim();
  if (!officeId || !userId) return { error: "Office and member are required." };

  const { error } = await supabase.rpc("broker_deactivate_office_member", {
    p_office_id: officeId,
    p_user_id: userId,
  });
  if (error) return { error: error.message };

  const h = await billingApiHeaders();
  if (!h.ok) {
    return { error: null, billingSyncWarning: h.error };
  }

  const res = await fetch("/api/billing/sync-subscription-seats", {
    method: "POST",
    headers: h.headers,
    body: JSON.stringify({ officeId }),
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const msg = parseApiErrorJson(body) || `Billing sync failed (${res.status})`;
    return { error: null, billingSyncWarning: msg };
  }

  if (
    body &&
    typeof body === "object" &&
    body !== null &&
    "billingMismatch" in body &&
    (body as { billingMismatch?: boolean }).billingMismatch === true
  ) {
    const detail =
      typeof (body as { message?: string }).message === "string"
        ? (body as { message: string }).message
        : "Stripe seat count could not be updated.";
    return {
      error: null,
      billingSyncWarning: `Team updated, but billing may be out of sync: ${detail}`,
    };
  }

  return { error: null };
}
