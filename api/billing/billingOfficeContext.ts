import type { SupabaseClient } from "@supabase/supabase-js";
import {
  pickActiveOfficeFromMembershipRows,
  type MembershipPickRow,
} from "../../src/services/officeMembershipOfficePick.js";

export type { MembershipPickRow };

export type ResolveWalletOfficeResult =
  | { ok: true; officeId: string }
  | { ok: false; reason: "no_office" | "db_error" };

/** Service-role lookup for billing routes (JWT does not carry app role). */
export async function getUserProfileRoleKeyForBilling(
  admin: SupabaseClient,
  userId: string
): Promise<{ ok: true; role: string | null } | { ok: false; reason: "db_error" }> {
  const { data, error } = await admin.from("user_profiles").select("role").eq("id", userId).maybeSingle();
  if (error) {
    console.error("[billingOfficeContext] user_profiles role", error);
    return { ok: false, reason: "db_error" };
  }
  const raw = typeof data?.role === "string" ? data.role.trim().toLowerCase() : "";
  return { ok: true, role: raw || null };
}

/**
 * READ-only billing scope. For `btq_admin`, uses `billingOfficeIdFromClient` (ghosted dashboard office)
 * validated against `public.offices` — no `office_memberships` and no `user_profiles.office_id` fallback.
 * For all other roles, `billingOfficeIdFromClient` is ignored (clients cannot pick another office’s billing).
 */
export async function resolveWalletReadOfficeId(
  admin: SupabaseClient,
  userId: string,
  billingOfficeIdFromClient: string | null | undefined
): Promise<
  ResolveWalletOfficeResult & {
    /** When false, `no_office` is for non–btq_admin membership/profile resolution. */
    btqAdminReadPath?: boolean;
  }
> {
  const roleResult = await getUserProfileRoleKeyForBilling(admin, userId);
  if (!roleResult.ok) {
    return { ok: false, reason: "db_error" };
  }

  if (roleResult.role === "btq_admin") {
    const oid = typeof billingOfficeIdFromClient === "string" ? billingOfficeIdFromClient.trim() : "";
    if (!oid) {
      return { ok: false, reason: "no_office", btqAdminReadPath: true };
    }
    const { data: officeRow, error: officeErr } = await admin
      .from("offices")
      .select("id")
      .eq("id", oid)
      .maybeSingle();
    if (officeErr) {
      console.error("[billingOfficeContext] offices (btq_admin read scope)", officeErr);
      return { ok: false, reason: "db_error" };
    }
    if (!officeRow?.id) {
      return { ok: false, reason: "no_office", btqAdminReadPath: true };
    }
    return { ok: true, officeId: oid };
  }

  return resolveWalletOfficeId(admin, userId);
}

/**
 * Resolves wallet/billing office from `office_memberships` (broker first, else newest).
 * `user_profiles.office_id` is used only when there are no active memberships — never overrides membership.
 */
export async function resolveWalletOfficeId(
  admin: SupabaseClient,
  userId: string
): Promise<ResolveWalletOfficeResult> {
  const [{ data: rows, error: mErr }, { data: profile, error: pErr }] = await Promise.all([
    admin
      .from("office_memberships")
      .select("office_id, role, created_at")
      .eq("user_id", userId)
      .eq("status", "active"),
    admin.from("user_profiles").select("office_id").eq("id", userId).maybeSingle(),
  ]);

  if (mErr) {
    console.error("[billingOfficeContext] office_memberships", mErr);
    return { ok: false, reason: "db_error" };
  }

  const picked = pickActiveOfficeFromMembershipRows((rows ?? []) as MembershipPickRow[]);
  if (picked) {
    const fromProfile = typeof profile?.office_id === "string" ? profile.office_id.trim() : "";
    if (
      fromProfile &&
      fromProfile.toLowerCase() !== picked.toLowerCase()
    ) {
      console.warn("⚠️ profile.office_id mismatch with membership — ignoring profile fallback");
    }
    return { ok: true, officeId: picked };
  }

  if (pErr) {
    console.error("[billingOfficeContext] user_profiles", pErr);
    return { ok: false, reason: "db_error" };
  }

  const fromProfile = typeof profile?.office_id === "string" ? profile.office_id.trim() : "";
  if (fromProfile) {
    console.warn(
      "[billingOfficeContext] Legacy fallback: user_profiles.office_id (no active office_memberships)"
    );
    return { ok: true, officeId: fromProfile };
  }

  return { ok: false, reason: "no_office" };
}
