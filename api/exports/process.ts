import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  getUserIdFromAuthHeader,
} from "../billing/billingAuth.js";
import { getSupabaseServiceRole } from "../../src/lib/supabaseServer.js";
import {
  attachLogContext,
  logApiError,
  logApiStart,
  logApiSuccess,
} from "../../src/lib/server/observability.js";
import {
  buildTransactionExportZip,
} from "../../src/lib/transactionExportProcessorCore.js";

const BUCKET = "transaction-documents";
const ROUTE = "api/exports/process";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

function truncateMessage(msg: string, max = 4000): string {
  const t = msg.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 20)}…[truncated]`;
}

function parseJsonBody(req: VercelRequest): { exportId?: string } {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === "string") {
    try {
      return JSON.parse(b) as { exportId?: string };
    } catch {
      return {};
    }
  }
  if (typeof b === "object" && !Buffer.isBuffer(b)) {
    return b as { exportId?: string };
  }
  return {};
}

export const config = {
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = logApiStart({ route: ROUTE, method: req.method });

  if (req.method !== "POST") {
    logApiSuccess(ctx, { status: 405 });
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const authedUserId = await getUserIdFromAuthHeader(req);
    if (!authedUserId) {
      logApiSuccess(ctx, { status: 401 });
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    attachLogContext(ctx, { userId: authedUserId });

    const body = parseJsonBody(req);
    const exportId = (body?.exportId ?? "").trim();
    if (!isUuid(exportId)) {
      logApiSuccess(ctx, { status: 400, metadata: { reason: "invalid_export_id" } });
      res.status(400).json({ ok: false, error: "Invalid exportId" });
      return;
    }

    const raw = req.headers.authorization;
    const token =
      typeof raw === "string" && raw.startsWith("Bearer ") ? raw.slice(7).trim() : null;
    if (!token) {
      logApiSuccess(ctx, { status: 401, metadata: { reason: "missing_bearer" } });
      res.status(401).json({ ok: false, error: "Missing bearer token" });
      return;
    }

    const userClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: exportRow, error: exportReadErr } = await userClient
      .from("transaction_exports")
      .select(
        "id, transaction_id, status, requested_by, requested_at"
      )
      .eq("id", exportId)
      .maybeSingle();

    if (exportReadErr) {
      console.error("[exports/process] read export", exportReadErr);
      logApiError(ctx, exportReadErr, {
        status: 403,
        metadata: { stage: "read_export" },
      });
      res.status(403).json({ ok: false, error: "Forbidden or export not found" });
      return;
    }

    if (!exportRow) {
      logApiSuccess(ctx, { status: 404, metadata: { reason: "export_not_found" } });
      res.status(404).json({ ok: false, error: "Export not found" });
      return;
    }

    const transactionId = String(exportRow.transaction_id ?? "").trim();

    if (exportRow.status === "ready") {
      logApiSuccess(ctx, { status: 200, metadata: { skipped: "already_ready" } });
      res.status(200).json({ ok: true, skipped: "already_ready" });
      return;
    }
    if (exportRow.status === "processing") {
      logApiSuccess(ctx, { status: 200, metadata: { skipped: "already_processing" } });
      res.status(200).json({ ok: true, skipped: "already_processing" });
      return;
    }
    if (exportRow.status === "failed") {
      logApiSuccess(ctx, { status: 200, metadata: { skipped: "failed" } });
      res.status(200).json({ ok: false, skipped: "failed" });
      return;
    }
    if (exportRow.status !== "queued") {
      logApiSuccess(ctx, {
        status: 400,
        metadata: { reason: "unexpected_status" },
      });
      res.status(400).json({ ok: false, error: "Unexpected export status" });
      return;
    }

    const { data: txn, error: txnErr } = await userClient
      .from("transactions")
      .select("id")
      .eq("id", transactionId)
      .maybeSingle();

    if (txnErr || !txn) {
      logApiSuccess(ctx, {
        status: 400,
        metadata: { reason: "transaction_not_found_or_inaccessible" },
      });
      res.status(400).json({ ok: false, error: "Transaction not found or inaccessible" });
      return;
    }

    const admin = getSupabaseServiceRole();
    const nowIso = new Date().toISOString();

    const { data: claimed, error: claimErr } = await admin
      .from("transaction_exports")
      .update({
        status: "processing",
        started_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", exportId)
      .eq("status", "queued")
      .select("id, transaction_id, requested_by")
      .maybeSingle();

    if (claimErr) {
      console.error("[exports/process] claim", claimErr);
      logApiError(ctx, claimErr, {
        status: 500,
        metadata: { stage: "claim_export" },
      });
      res.status(500).json({ ok: false, error: "Could not claim export" });
      return;
    }

    if (!claimed) {
      const { data: cur } = await admin
        .from("transaction_exports")
        .select("status")
        .eq("id", exportId)
        .maybeSingle();
      const st = (cur?.status as string | undefined) ?? "";
      if (st === "ready") {
        logApiSuccess(ctx, {
          status: 200,
          metadata: { skipped: "already_ready_after_claim" },
        });
        res.status(200).json({ ok: true, skipped: "already_ready" });
        return;
      }
      if (st === "processing") {
        logApiSuccess(ctx, {
          status: 200,
          metadata: { skipped: "already_processing_after_claim" },
        });
        res.status(200).json({ ok: true, skipped: "already_processing" });
        return;
      }
      logApiSuccess(ctx, { status: 409, metadata: { reason: "claim_lost" } });
      res.status(409).json({ ok: false, error: "Export could not be claimed" });
      return;
    }

    const requestedBy =
      claimed.requested_by != null ? String(claimed.requested_by) : null;

    try {
      const built = await buildTransactionExportZip({
        admin,
        transactionId,
        exportId,
        requestedBy,
      });

      const zipPath = `${transactionId}/exports/${built.zipFileName}`;
      const manifestPath = `${transactionId}/exports/${built.manifestStorageFileName}`;

      const { error: manUp } = await admin.storage
        .from(BUCKET)
        .upload(manifestPath, Buffer.from(built.manifestJson, "utf8"), {
          contentType: "application/json",
          upsert: true,
        });

      if (manUp) {
        throw new Error(`Manifest upload failed: ${manUp.message}`);
      }

      const { error: zipUp } = await admin.storage.from(BUCKET).upload(zipPath, built.zipBuffer, {
        contentType: "application/zip",
        upsert: true,
      });

      if (zipUp) {
        throw new Error(`ZIP upload failed: ${zipUp.message}`);
      }

      const completedAt = new Date().toISOString();
      const { error: finErr } = await admin
        .from("transaction_exports")
        .update({
          status: "ready",
          completed_at: completedAt,
          zip_storage_path: zipPath,
          manifest_storage_path: manifestPath,
          document_count: built.manifest.document_count,
          byte_size: built.byteSize,
          error_message: null,
          updated_at: completedAt,
        })
        .eq("id", exportId)
        .eq("status", "processing");

      if (finErr) {
        throw new Error(`Failed to finalize export row: ${finErr.message}`);
      }

      logApiSuccess(ctx, {
        status: 200,
        metadata: {
          result: "ready",
          documentCount: built.manifest.document_count,
          byteSize: built.byteSize,
        },
      });
      res.status(200).json({
        ok: true,
        result: "ready",
        zip_storage_path: zipPath,
        manifest_storage_path: manifestPath,
        document_count: built.manifest.document_count,
        byte_size: built.byteSize,
      });
    } catch (workErr) {
      const msg = workErr instanceof Error ? workErr.message : String(workErr);
      const failedAt = new Date().toISOString();
      const { error: failUpdErr } = await admin
        .from("transaction_exports")
        .update({
          status: "failed",
          failed_at: failedAt,
          error_message: truncateMessage(msg),
          updated_at: failedAt,
          document_count: null,
          byte_size: null,
          zip_storage_path: null,
          manifest_storage_path: null,
          completed_at: null,
        })
        .eq("id", exportId)
        .eq("status", "processing");

      if (failUpdErr) {
        console.error("[exports/process] could not mark export failed", failUpdErr);
      }

      console.error("[exports/process] work failed", workErr);
      logApiError(ctx, workErr, {
        status: 200,
        metadata: { stage: "build_export", result: "failed" },
      });
      res.status(200).json({
        ok: true,
        result: "failed",
        error: truncateMessage(msg, 500),
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[exports/process]", e);
    logApiError(ctx, e, { status: 500, metadata: { stage: "unhandled" } });
    res.status(500).json({ ok: false, error: msg });
  }
}
