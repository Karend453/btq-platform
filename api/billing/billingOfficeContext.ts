import type { SupabaseClient } from "@supabase/supabase-js";
import {
  pickActiveOfficeFromMembershipRows,
  type MembershipPickRow,
} from "../../src/services/officeMembershipOfficePick.js";

export type { MembershipPickRow };

export type ResolveWalletOfficeResult =
  | { ok: true; officeId: string }
  | { ok: false; reason: "no_office" | "db_error" };

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
