import type { SupabaseClient } from "@supabase/supabase-js";

async function assertActiveOfficeMember(
  admin: SupabaseClient,
  officeId: string,
  userId: string
): Promise<boolean> {
  const { data } = await admin
    .from("office_memberships")
    .select("id")
    .eq("office_id", officeId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return !!data;
}

export type MembershipPickRow = {
  office_id: string;
  role: string | null;
  created_at: string;
};

function pickActiveOfficeFromMembershipRows(rows: MembershipPickRow[]): string | null {
  if (rows.length === 0) return null;
  const broker = rows.find((r) => (r.role ?? "").trim().toLowerCase() === "broker");
  if (broker) return broker.office_id;
  const sorted = [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return sorted[0]?.office_id ?? null;
}

export type ResolveWalletOfficeResult =
  | { ok: true; officeId: string }
  | { ok: false; reason: "no_office" | "db_error" };

/**
 * Prefer `user_profiles.office_id` when the user still has an active membership there; otherwise one
 * active `office_memberships` row (broker first, else newest).
 */
export async function resolveWalletOfficeId(
  admin: SupabaseClient,
  userId: string
): Promise<ResolveWalletOfficeResult> {
  const { data: profile, error: pErr } = await admin
    .from("user_profiles")
    .select("office_id")
    .eq("id", userId)
    .maybeSingle();

  if (pErr) {
    console.error("[billingOfficeContext] user_profiles", pErr);
    return { ok: false, reason: "db_error" };
  }

  const fromProfile = typeof profile?.office_id === "string" ? profile.office_id.trim() : "";
  if (fromProfile) {
    const ok = await assertActiveOfficeMember(admin, fromProfile, userId);
    if (ok) return { ok: true, officeId: fromProfile };
  }

  const { data: rows, error: mErr } = await admin
    .from("office_memberships")
    .select("office_id, role, created_at")
    .eq("user_id", userId)
    .eq("status", "active");

  if (mErr) {
    console.error("[billingOfficeContext] office_memberships", mErr);
    return { ok: false, reason: "db_error" };
  }

  const picked = pickActiveOfficeFromMembershipRows((rows ?? []) as MembershipPickRow[]);
  if (!picked) return { ok: false, reason: "no_office" };
  return { ok: true, officeId: picked };
}
