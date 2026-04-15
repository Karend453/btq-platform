import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseServiceRole } from "../../src/lib/supabaseServer.js";
import { getUserIdFromAuthHeader } from "./billingAuth.js";
import { assertBrokerForOffice } from "./seatSyncShared.js";

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
    .select("id, status, role")
    .eq("office_id", officeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memErr) {
    console.error("[remove-team-invite] membership select", memErr);
    return res.status(500).json({ error: "Could not load membership" });
  }

  if (!membership?.id) {
    return res.status(404).json({ error: "Member not found in this office" });
  }

  const st = (membership.status ?? "").trim().toLowerCase();
  const r = (membership.role ?? "").trim().toLowerCase();
  if (st !== "pending" || (r !== "admin" && r !== "agent")) {
    return res.status(400).json({
      error: "Only pending admin or agent invites can be removed here.",
    });
  }

  const { error: delErr } = await admin.from("office_memberships").delete().eq("id", membership.id);

  if (delErr) {
    console.error("[remove-team-invite] delete", delErr);
    return res.status(500).json({ error: "Could not remove invite" });
  }

  return res.status(200).json({ ok: true });
}
