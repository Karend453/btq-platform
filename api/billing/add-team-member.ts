import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getStripeServer } from "../../src/lib/stripeServer.js";
import { getSeatPriceId } from "../../src/lib/stripePrices.js";
import { getSupabaseServiceRole } from "../../src/lib/supabaseServer.js";
import { getUserIdFromAuthHeader } from "./billingAuth.js";
import {
  assertBrokerForOffice,
  countPaidSeats,
  resolveNextPaidSeatCountForAdd,
  syncStripeSeatQuantity,
} from "./seatSyncShared.js";
import { resolveAppBaseUrl } from "./appBaseUrl.js";
import type { SupabaseClient } from "@supabase/supabase-js";

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

function basicEmailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function findProfileIdByEmail(
  admin: SupabaseClient,
  email: string
): Promise<string | null> {
  const norm = email.trim().toLowerCase();
  const { data, error } = await admin
    .from("user_profiles")
    .select("id")
    .ilike("email", norm)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data?.id?.trim() ?? null;
}

/** True when this user already has a non-accepted invite for the office (duplicate add blocked). */
async function hasPendingAdminAgentMembership(
  admin: SupabaseClient,
  officeId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("office_memberships")
    .select("status, role")
    .eq("office_id", officeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) return false;
  const st = (data.status ?? "").trim().toLowerCase();
  const r = (data.role ?? "").trim().toLowerCase();
  return st === "pending" && (r === "admin" || r === "agent");
}

function isInviteDuplicateError(err: { message?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("user already exists") ||
    m.includes("duplicate")
  );
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
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim().toLowerCase() : "";

  if (!officeId || !firstName || !lastName || !email || !role) {
    return res.status(400).json({
      error: "officeId, firstName, lastName, email, and role are required",
    });
  }
  if (role !== "admin" && role !== "agent") {
    return res.status(400).json({ error: "role must be admin or agent" });
  }
  if (!basicEmailValid(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  const admin = getSupabaseServiceRole();
  const isBroker = await assertBrokerForOffice(admin, officeId, brokerUserId);
  if (!isBroker) {
    return res.status(403).json({ error: "Not authorized for this office" });
  }

  const { data: office, error: officeErr } = await admin
    .from("offices")
    .select("stripe_subscription_id")
    .eq("id", officeId)
    .maybeSingle();

  if (officeErr) {
    console.error("[add-team-member] offices select", officeErr);
    return res.status(500).json({ error: "Could not load office" });
  }

  const subscriptionId =
    typeof office?.stripe_subscription_id === "string"
      ? office.stripe_subscription_id.trim()
      : "";

  let prevCount: number;
  try {
    prevCount = await countPaidSeats(admin, officeId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[add-team-member] countPaidSeats", msg);
    return res.status(500).json({ error: "Could not count paid seats" });
  }

  let existingProfileId: string | null = null;
  try {
    existingProfileId = await findProfileIdByEmail(admin, email);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[add-team-member] profile lookup", msg);
    return res.status(500).json({ error: "Could not look up user" });
  }

  if (existingProfileId === brokerUserId) {
    return res.status(400).json({ error: "You cannot add yourself." });
  }

  if (existingProfileId) {
    try {
      if (await hasPendingAdminAgentMembership(admin, officeId, existingProfileId)) {
        return res.status(409).json({
          error: "This person already has a pending invite.",
          code: "PENDING_MEMBERSHIP",
          targetUserId: existingProfileId,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[add-team-member] pending membership check", msg);
      return res.status(500).json({ error: "Could not verify existing membership" });
    }
  }

  let nextCount: number;
  try {
    if (existingProfileId) {
      nextCount = await resolveNextPaidSeatCountForAdd(admin, officeId, email, prevCount);
    } else {
      // New email: invite flow inserts `pending` until the user accepts (no paid seat until active).
      nextCount = prevCount;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[add-team-member] resolveNextPaidSeatCountForAdd", msg);
    return res.status(500).json({ error: "Could not determine seat count for this add" });
  }

  const needsBillingDelta = nextCount !== prevCount;

  if (needsBillingDelta && !subscriptionId) {
    return res.status(400).json({
      error:
        "No Stripe subscription is linked to this office. Complete billing setup before adding team members.",
    });
  }

  let seatPriceId: string | undefined;
  if (needsBillingDelta) {
    try {
      seatPriceId = getSeatPriceId();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[add-team-member] STRIPE_PRICE_SEAT missing or invalid", msg);
      return res.status(503).json({
        error: "Billing seat price is not configured (STRIPE_PRICE_SEAT).",
      });
    }
  }

  const stripe = needsBillingDelta ? getStripeServer() : null;

  if (needsBillingDelta && stripe && seatPriceId) {
    try {
      await syncStripeSeatQuantity(stripe, subscriptionId, seatPriceId, nextCount);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[add-team-member] Stripe seat update failed", msg);
      return res.status(502).json({
        error: `Billing update failed: ${msg}`,
      });
    }
  }

  const displayName = `${firstName} ${lastName}`.trim();

  async function rollbackStripeIfNeeded(): Promise<void> {
    if (!needsBillingDelta || !stripe || !seatPriceId) return;
    try {
      await syncStripeSeatQuantity(stripe, subscriptionId, seatPriceId, prevCount);
    } catch (rollbackErr) {
      console.error(
        "[add-team-member] Stripe rollback failed; manual reconciliation may be needed",
        { officeId, prevCount, rollbackErr }
      );
    }
  }

  let targetUserId: string | null = existingProfileId;
  let createdNewAuthUser = false;

  try {
    if (targetUserId) {
      const { error: memErr } = await admin.from("office_memberships").upsert(
        {
          office_id: officeId,
          user_id: targetUserId,
          role,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "office_id,user_id" }
      );
      if (memErr) {
        throw new Error(memErr.message);
      }
    } else {
      const redirectTo = `${resolveAppBaseUrl(req)}/login`;
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
        email,
        {
          data: {
            first_name: firstName,
            last_name: lastName,
          },
          redirectTo,
        }
      );

      if (inviteErr) {
        if (isInviteDuplicateError(inviteErr)) {
          const retryId = await findProfileIdByEmail(admin, email);
          if (retryId) {
            if (retryId === brokerUserId) {
              throw new Error("You cannot add yourself.");
            }
            targetUserId = retryId;
            createdNewAuthUser = false;
            if (await hasPendingAdminAgentMembership(admin, officeId, retryId)) {
              await rollbackStripeIfNeeded();
              return res.status(409).json({
                error: "This person already has a pending invite.",
                code: "PENDING_MEMBERSHIP",
                targetUserId: retryId,
              });
            }

            const retryNextCount = await resolveNextPaidSeatCountForAdd(
              admin,
              officeId,
              email,
              prevCount
            );
            if (retryNextCount !== prevCount) {
              if (!subscriptionId) {
                throw new Error(
                  "No Stripe subscription is linked to this office. Complete billing setup before adding team members."
                );
              }
              let dupSeatPriceId: string;
              try {
                dupSeatPriceId = getSeatPriceId();
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(
                  msg.includes("STRIPE") ? msg : "Billing seat price is not configured (STRIPE_PRICE_SEAT)."
                );
              }
              const dupStripe = getStripeServer();
              try {
                await syncStripeSeatQuantity(dupStripe, subscriptionId, dupSeatPriceId, retryNextCount);
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`Billing update failed: ${msg}`);
              }
            }

            const { error: memErr2 } = await admin.from("office_memberships").upsert(
              {
                office_id: officeId,
                user_id: targetUserId,
                role,
                status: "active",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "office_id,user_id" }
            );
            if (memErr2) {
              if (retryNextCount !== prevCount) {
                try {
                  const dupSeatPriceId = getSeatPriceId();
                  const dupStripe = getStripeServer();
                  await syncStripeSeatQuantity(dupStripe, subscriptionId, dupSeatPriceId, prevCount);
                } catch {
                  /* best-effort rollback */
                }
              }
              throw new Error(memErr2.message);
            }
          } else {
            throw new Error(
              inviteErr.message ||
                "This email is already registered but could not be linked. Try again or contact support."
            );
          }
        } else {
          throw new Error(inviteErr.message || "Could not send invitation.");
        }
      } else {
        const uid = invited?.user?.id?.trim();
        if (!uid) {
          throw new Error("Invitation did not return a user id.");
        }
        targetUserId = uid;
        createdNewAuthUser = true;

        const { error: memErr } = await admin.from("office_memberships").upsert(
          {
            office_id: officeId,
            user_id: targetUserId,
            role,
            status: "pending",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "office_id,user_id" }
        );
        if (memErr) {
          throw new Error(memErr.message);
        }
      }
    }

    if (targetUserId) {
      const { error: profErr } = await admin
        .from("user_profiles")
        .update({ display_name: displayName })
        .eq("id", targetUserId);
      if (profErr) {
        console.warn("[add-team-member] display_name update skipped", profErr.message);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await rollbackStripeIfNeeded();

    if (createdNewAuthUser && targetUserId) {
      const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
      if (delErr) {
        console.error("[add-team-member] failed to delete user after membership error", {
          targetUserId,
          delErr,
        });
      }
    }

    return res.status(400).json({ error: msg });
  }

  return res.status(200).json({ ok: true });
}
