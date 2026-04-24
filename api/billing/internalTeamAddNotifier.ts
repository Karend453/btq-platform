/**
 * Fire-and-forget internal notification for broker-initiated team member adds
 * (new pending invite or reactivation). Never throws; never blocks the caller.
 *
 * Sends via Resend's HTTP API (no SDK dependency). Skips silently if
 * RESEND_API_KEY is unset so local/dev environments are unaffected.
 */

// Hardcoded internal recipient for now. Move to env if needed later.
const INTERNAL_RECIPIENT = "Admin@brokerteq.com";

export type InternalTeamAddPayload = {
  officeName: string | null;
  displayName: string;
  displayEmail: string;
  role: string;
  planTier: string | null;
};

export async function sendInternalTeamAddNotification(
  payload: InternalTeamAddPayload
): Promise<void> {
  try {
    console.log("Internal team add notifier invoked");
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      console.warn(
        "Internal team add notification skipped: RESEND_API_KEY missing"
      );
      return;
    }
    const from =
      process.env.INTERNAL_NOTIFY_EMAIL_FROM?.trim() ||
      "notifications@brokerteq.com";

    const body =
      `A broker added a new team member in BTQ.\n\n` +
      `Office: ${payload.officeName?.trim() || "—"}\n` +
      `Name: ${payload.displayName}\n` +
      `Email: ${payload.displayEmail}\n` +
      `Role: ${payload.role}\n` +
      `Plan: ${payload.planTier?.trim() || "—"}\n\n` +
      `Action needed:\n` +
      `- Add to Lofty\n` +
      `- If Pro plan → add to SkySlope\n`;

    console.log("Sending internal team add notification", {
      to: INTERNAL_RECIPIENT,
      from,
      subject: "New BTQ team member added",
    });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [INTERNAL_RECIPIENT],
        subject: "New BTQ team member added",
        text: body,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Failed to send internal team add notification", {
        status: res.status,
        detail,
      });
    } else {
      console.log("Internal team add notification sent");
    }
  } catch (error) {
    console.error("Failed to send internal team add notification", error);
  }
}
