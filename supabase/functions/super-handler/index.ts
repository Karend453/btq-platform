/**
 * Resend inbound webhook (email.received): same pipeline as manual uploads and `resend-inbound`:
 * bucket `transaction-documents`, path `{transactionId}/{uuid}-{safeName}`, `transaction_documents` row.
 * Requires: RESEND_WEBHOOK_SECRET, RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * JWT verification disabled via supabase/config.toml.
 */
import { createClient } from "@supabase/supabase-js";
import { Webhook } from "svix";

const BUCKET = "transaction-documents";

/** PDF debug: `false` = force `application/pdf` for `.pdf`; `true` = omit `contentType` for `.pdf` (second test). */
const PDF_UPLOAD_OMIT_CONTENT_TYPE_TEST = false;

type EmailReceivedPayload = {
  type?: string;
  data?: {
    email_id?: string;
    to?: string[];
    attachments?: Array<{ id?: string; filename?: string }>;
  };
};

type ResendAttachment = {
  id?: string;
  filename?: string;
  content_type?: string;
  download_url?: string;
};

type ResendAttachmentListResponse = {
  data?: ResendAttachment[];
};

type UploadedFile = {
  filename: string;
  storagePath: string;
};

function normalizeAddress(raw: string): string {
  const s = raw.trim();
  const angle = s.match(/<([^>]+)>/);
  const email = angle ? angle[1]! : s;
  return email.trim().toLowerCase();
}

function normalizeRecipientList(to: unknown): string[] {
  if (!Array.isArray(to)) return [];
  const out: string[] = [];
  for (const item of to) {
    if (typeof item !== "string" || !item.trim()) continue;
    const n = normalizeAddress(item);
    if (n) out.push(n);
  }
  return out;
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const TRUSTED_MIME_TYPES = new Set<string>([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function getSafeContentType(filename: string, contentType?: string): string {
  const rawTrimmed = contentType?.trim();
  if (rawTrimmed) {
    const base = rawTrimmed.split(";")[0]!.trim().toLowerCase();
    if (TRUSTED_MIME_TYPES.has(base)) {
      return base;
    }
  }
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const byExt: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return byExt[ext] ?? "application/pdf";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!webhookSecret || !resendApiKey || !supabaseUrl || !serviceKey) {
    console.error("[super-handler] Missing required env vars");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response(JSON.stringify({ error: "Missing Svix signature headers" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let event: EmailReceivedPayload;
  try {
    const wh = new Webhook(webhookSecret);
    event = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as EmailReceivedPayload;
  } catch (e) {
    console.error("[super-handler] Webhook verify failed:", e);
    return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (event.type !== "email.received") {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: "event_type" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const emailId = event.data?.email_id?.trim();
  if (!emailId) {
    return new Response(JSON.stringify({ error: "Missing data.email_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const recipients = normalizeRecipientList(event.data?.to);
  if (recipients.length === 0) {
    return new Response(JSON.stringify({ error: "No recipients in data.to" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let transactionId: string | null = null;
  for (const addr of recipients) {
    const { data: row, error } = await supabase
      .from("transactions")
      .select("id")
      .eq("intake_email", addr)
      .maybeSingle();

    if (error) {
      console.error("[super-handler] Transaction lookup error:", error);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (row?.id) {
      transactionId = row.id;
      break;
    }
  }

  if (!transactionId) {
    console.error("[super-handler] No transaction for intake_email in recipients:", recipients);
    return new Response(
      JSON.stringify({
        error: "No transaction found for intake_email matching recipients",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log("[super-handler] email_id:", emailId, "transaction_id:", transactionId);

  const listRes = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments`,
    { headers: { Authorization: `Bearer ${resendApiKey}` } }
  );

  if (!listRes.ok) {
    const t = await listRes.text();
    console.error("[super-handler] Resend attachments list failed:", listRes.status, t);
    return new Response(JSON.stringify({ error: "Failed to list attachments from Resend" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const listJson = (await listRes.json()) as ResendAttachmentListResponse;
  const attachments = listJson.data ?? [];
  const attachmentCount = attachments.length;

  console.log(
    "[super-handler] attachmentCount:",
    attachmentCount,
    "email_id:",
    emailId,
    "transaction_id:",
    transactionId
  );

  let processed = 0;
  let skippedDedupe = 0;
  let skippedErrors = 0;
  const uploadedFiles: UploadedFile[] = [];

  for (const att of attachments) {
    const attachmentId = att.id?.trim();
    if (!attachmentId) {
      skippedErrors++;
      continue;
    }

    const ingestDedupeKey = `resend:${emailId}:${attachmentId}`;

    const { data: existing } = await supabase
      .from("transaction_documents")
      .select("id")
      .eq("ingest_dedupe_key", ingestDedupeKey)
      .maybeSingle();

    if (existing?.id) {
      skippedDedupe++;
      continue;
    }

    const fileName = att.filename?.trim() || "attachment";
    const safeName = safeFileName(fileName);
    const storagePath = `${transactionId}/${crypto.randomUUID()}-${safeName}`;

    const downloadUrl = att.download_url?.trim();
    if (!downloadUrl) {
      console.error("[super-handler] Missing download_url for attachment:", attachmentId);
      skippedErrors++;
      continue;
    }

    const downloadRes = await fetch(downloadUrl);
    if (!downloadRes.ok) {
      console.error("[super-handler] Download failed:", attachmentId, downloadRes.status);
      skippedErrors++;
      continue;
    }

    const bytes = new Uint8Array(await downloadRes.arrayBuffer());

    const resolvedContentType = getSafeContentType(fileName, att.content_type);
    console.log(
      "[super-handler]",
      JSON.stringify({
        fileName,
        rawContentType: att.content_type ?? null,
        resolvedContentType,
        storagePath,
      })
    );

    const isPdf = fileName.toLowerCase().endsWith(".pdf");
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(
      storagePath,
      bytes,
      PDF_UPLOAD_OMIT_CONTENT_TYPE_TEST && isPdf
        ? { upsert: false }
        : {
            upsert: false,
            contentType: isPdf ? "application/pdf" : resolvedContentType,
          }
    );

    if (uploadError) {
      console.error("[super-handler] Storage upload failed:", uploadError, storagePath);
      skippedErrors++;
      continue;
    }

    const { error: insertError } = await supabase.from("transaction_documents").insert({
      transaction_id: transactionId,
      file_name: fileName,
      storage_path: storagePath,
      source: "email",
      attached_to_checklist_item_id: null,
      ingest_dedupe_key: ingestDedupeKey,
    });

    if (insertError) {
      console.error("[super-handler] Insert failed:", insertError);
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      skippedErrors++;
      continue;
    }

    console.log("[super-handler] Stored document:", storagePath, "filename:", fileName);
    uploadedFiles.push({ filename: fileName, storagePath });
    processed++;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      email_id: emailId,
      transaction_id: transactionId,
      attachmentCount,
      processed,
      skipped_dedupe: skippedDedupe,
      skipped_errors: skippedErrors,
      uploadedFiles,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
