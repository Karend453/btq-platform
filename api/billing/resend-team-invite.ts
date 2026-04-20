import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseServiceRole } from "../../src/lib/supabaseServer.js";
import { getUserIdFromAuthHeader } from "./billingAuth.js";
import { assertBrokerForOffice } from "./seatSyncShared.js";
import { resolveAppBaseUrl } from "./appBaseUrl.js";

function parseJsonBody(req: VercelRequest): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = req.body as unknown;
  } catch {
    return {};
  }
  if (raw == null || raw === "") return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(raw)) {
    try {
      const parsed = JSON.parse(raw.toString("utf8")) as unknown;
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/**
 * Resend invitation email only. Does not change membership status (remains `pending`).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const brokerUserId = await getUserIdFromAuthHeader(req);
  if (!brokerUserId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = parseJsonBody(req);
  const officeId = typeof body.officeId === "string" ? body.officeId.trim() : "";
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";

  if (!officeId || !userId) {
    return res.status(400).json({ error: "officeId and userId are required" });
  }

  if (userId === brokerUserId) {
    return res.status(400).json({ error: "Invalid member" });
  }

  const admin = getSupabaseServiceRole();
  const isBroker = await assertBrokerForOffice(admin, officeId, brokerUserId);
  if (!isBroker) {
    return res.status(403).json({ error: "Not authorized for this office" });
  }

  const { data: membership, error: memErr } = await admin
    .from("office_memberships")
    .select("status, role")
    .eq("office_id", officeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memErr) {
    console.error("[resend-team-invite] membership select", memErr);
    return res.status(500).json({ error: "Could not load membership" });
  }

  if (!membership) {
    return res.status(404).json({ error: "Member not found in this office" });
  }

  const st = (membership.status ?? "").trim().toLowerCase();
  const r = (membership.role ?? "").trim().toLowerCase();
  if (st !== "pending" || (r !== "admin" && r !== "agent")) {
    return res.status(400).json({
      error: "Only pending admin or agent invites can be resent from here.",
    });
  }

  const { data: profile, error: profErr } = await admin
    .from("user_profiles")
    .select("email, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) {
    console.error("[resend-team-invite] profile select", profErr);
    return res.status(500).json({ error: "Could not load member profile" });
  }

  const email = typeof profile?.email === "string" ? profile.email.trim() : "";
  if (!email) {
    return res.status(400).json({ error: "Member has no email on file." });
  }

  const redirectTo = `${resolveAppBaseUrl(req)}/login`;
  const nameParts = (profile?.display_name ?? "").trim().split(/\s+/);
  const firstName = nameParts[0] ?? "Team";
  const lastName = nameParts.slice(1).join(" ") || "Member";

  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      first_name: firstName,
      last_name: lastName,
    },
    redirectTo,
  });

  if (inviteErr) {
    console.warn("[resend-team-invite] inviteUserByEmail:", inviteErr.message);
    return res.status(400).json({
      error: inviteErr.message || "Could not resend invitation email.",
    });
  }

  await admin
    .from("office_memberships")
    .update({ updated_at: new Date().toISOString() })
    .eq("office_id", officeId)
    .eq("user_id", userId)
    .eq("status", "pending");

  return res.status(200).json({ ok: true });
}
