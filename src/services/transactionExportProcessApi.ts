/**
 * Phase 2: trigger server-side processing for a queued `transaction_exports` row.
 * Requires deployed `/api/exports/process` (e.g. `vercel dev` or Vercel production).
 */
import { supabase, supabaseInitError } from "../lib/supabaseClient";

export type RequestQueuedExportProcessingResult =
  | { ok: true; skipped: string }
  | { ok: true; result: "ready" | "failed"; message?: string }
  | { ok: false; error: string };

export async function requestQueuedExportProcessing(
  exportId: string
): Promise<RequestQueuedExportProcessingResult> {
  const eid = exportId.trim();
  if (!eid) {
    return { ok: false, error: "Missing export id" };
  }
  if (!supabase) {
    return { ok: false, error: supabaseInitError ?? "Supabase is not configured" };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    return { ok: false, error: "Not signed in" };
  }

  let res: Response;
  try {
    res = await fetch("/api/exports/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ exportId: eid }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg || "Network error" };
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const err =
      typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
    return { ok: false, error: err };
  }

  if (typeof json.skipped === "string") {
    return { ok: true, skipped: json.skipped };
  }

  if (json.result === "failed") {
    return {
      ok: true,
      result: "failed",
      message: typeof json.error === "string" ? json.error : undefined,
    };
  }

  if (json.result === "ready" || json.ok === true) {
    return { ok: true, result: "ready" };
  }

  return { ok: true, result: "ready" };
}
