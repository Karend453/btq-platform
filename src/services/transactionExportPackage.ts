/**
 * Post-finalize: build a ZIP of all transaction_documents in storage, upload to the same bucket
 * under `{transactionId}/exports/`, and persist metadata on client_portfolio.
 */
import JSZip from "jszip";
import { supabase } from "../lib/supabaseClient";
import { fetchDocumentsByTransactionId } from "./transactionDocuments";

const BUCKET = "transaction-documents";

function sanitizeZipEntryName(name: string): string {
  const trimmed = (name || "file").trim() || "file";
  return trimmed.replace(/[\\/:*?"<>|]/g, "_").slice(0, 200);
}

function uniqueZipName(used: Set<string>, base: string): string {
  const safe = sanitizeZipEntryName(base);
  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }
  let i = 2;
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : "";
  for (;;) {
    const candidate = `${stem} (${i})${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    i++;
  }
}

export type CreateTransactionExportResult = {
  ok: boolean;
  errorMessage?: string;
};

/**
 * Runs after finalize: zips stored documents, uploads the ZIP, writes export_* columns on client_portfolio.
 */
export async function createAndPersistTransactionExportPackage(
  transactionId: string,
  actor: { userId: string; email: string | null }
): Promise<CreateTransactionExportResult> {
  const tid = transactionId.trim();
  if (!tid) {
    return { ok: false, errorMessage: "Missing transaction id." };
  }

  const { error: pendingErr } = await supabase
    .from("client_portfolio")
    .update({ export_status: "pending" })
    .eq("transaction_id", tid);

  if (pendingErr) {
    console.error("[createAndPersistTransactionExportPackage] pending update", pendingErr);
    return { ok: false, errorMessage: pendingErr.message };
  }

  const docs = (await fetchDocumentsByTransactionId(tid)).filter((d) => d.isAttached);
  const zip = new JSZip();
  const usedNames = new Set<string>();
  const manifestDocs: { id: string; file_name: string; storage_path: string }[] = [];

  for (const doc of docs) {
    const path = (doc.storage_path ?? "").trim();
    if (!path) continue;
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(path);
    if (dlErr || !blob) {
      console.warn("[createAndPersistTransactionExportPackage] skip download", path, dlErr?.message);
      continue;
    }
    const entryName = uniqueZipName(usedNames, doc.filename || `document-${doc.id}`);
    zip.file(entryName, blob);
    manifestDocs.push({
      id: doc.id,
      file_name: doc.filename,
      storage_path: path,
    });
  }

  const createdAtIso = new Date().toISOString();
  zip.file(
    "export-manifest.json",
    JSON.stringify(
      {
        transaction_id: tid,
        export_created_at: createdAtIso,
        export_created_by: actor.userId,
        export_created_by_email: actor.email,
        documents: manifestDocs,
        note:
          "System-generated export package (BTQ). Inbox-only documents (not attached to the checklist) are excluded.",
      },
      null,
      2
    )
  );

  let zipBlob: Blob;
  try {
    zipBlob = await zip.generateAsync({ type: "blob" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ZIP build failed";
    await markExportFailed(tid, actor);
    return { ok: false, errorMessage: msg };
  }

  const fileName = `btq-transaction-export-${tid.slice(0, 8)}-${Date.now()}.zip`;
  const storagePath = `${tid}/exports/${fileName}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, zipBlob, {
    contentType: "application/zip",
    upsert: true,
  });

  if (upErr) {
    console.error("[createAndPersistTransactionExportPackage] upload", upErr);
    await markExportFailed(tid, actor);
    return { ok: false, errorMessage: upErr.message };
  }

  const { error: metaErr } = await supabase
    .from("client_portfolio")
    .update({
      export_created_at: createdAtIso,
      export_created_by: actor.userId,
      export_created_by_email: actor.email,
      export_status: "ready",
      export_file_name: fileName,
      export_storage_path: storagePath,
      retention_delete_at: null,
    })
    .eq("transaction_id", tid);

  if (metaErr) {
    console.error("[createAndPersistTransactionExportPackage] metadata", metaErr);
    return { ok: false, errorMessage: metaErr.message };
  }

  return { ok: true };
}

async function markExportFailed(
  transactionId: string,
  actor: { userId: string; email: string | null }
) {
  await supabase
    .from("client_portfolio")
    .update({
      export_status: "failed",
      export_created_by: actor.userId,
      export_created_by_email: actor.email,
    })
    .eq("transaction_id", transactionId);
}
