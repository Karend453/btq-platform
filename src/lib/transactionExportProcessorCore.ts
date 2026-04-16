/**
 * Server-only: build ZIP + manifest for a transaction export (Node / Vercel).
 * Mirrors Phase 1 client rules: only checklist-attached documents (not inbox-only).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";

const BUCKET = "transaction-documents";

export type ExportableDocumentRow = {
  id: string;
  file_name: string;
  storage_path: string;
  isAttached: boolean;
};

export type TransactionExportManifestFile = {
  document_id: string;
  display_name: string;
  storage_path: string;
  zip_entry_name: string;
};

export type TransactionExportManifest = {
  transaction_id: string;
  export_id: string;
  generated_at: string;
  requested_by: string | null;
  document_count: number;
  files: TransactionExportManifestFile[];
  note: string;
};

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

/**
 * Same attachment rules as `fetchDocumentsByTransactionId` + export filter: attached only.
 */
export async function fetchExportableDocumentsForTransaction(
  client: SupabaseClient,
  transactionId: string
): Promise<ExportableDocumentRow[]> {
  const { data, error } = await client
    .from("transaction_documents")
    .select("id, file_name, storage_path, created_at")
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load transaction_documents");
  }

  const { data: checklistRows, error: clErr } = await client
    .from("checklist_items")
    .select("id, document_id")
    .eq("transaction_id", transactionId)
    .not("document_id", "is", null);

  if (clErr) {
    throw new Error(clErr.message || "Failed to load checklist_items");
  }

  const docIdToChecklistItemId = new Map<string, string>();
  for (const row of checklistRows ?? []) {
    if (row.document_id) {
      docIdToChecklistItemId.set(String(row.document_id), String(row.id));
    }
  }

  const rows: ExportableDocumentRow[] = [];
  for (const row of data ?? []) {
    const id = String((row as { id: string }).id);
    const fileName = String((row as { file_name: string }).file_name ?? "");
    const storagePath = String((row as { storage_path: string }).storage_path ?? "").trim();
    const attached = !!docIdToChecklistItemId.get(id);
    if (attached && !storagePath) {
      throw new Error(
        `Export failed: document ${id} ("${fileName || "unnamed"}") is attached to the checklist but has no storage path.`
      );
    }
    rows.push({
      id,
      file_name: fileName,
      storage_path: storagePath,
      isAttached: attached,
    });
  }

  return rows.filter((d) => d.isAttached && d.storage_path.length > 0);
}

export type BuildExportZipResult = {
  zipBuffer: Buffer;
  manifest: TransactionExportManifest;
  manifestJson: string;
  zipFileName: string;
  manifestStorageFileName: string;
  byteSize: number;
};

export async function buildTransactionExportZip(params: {
  admin: SupabaseClient;
  transactionId: string;
  exportId: string;
  requestedBy: string | null;
}): Promise<BuildExportZipResult> {
  const { admin, transactionId, exportId, requestedBy } = params;
  const docs = await fetchExportableDocumentsForTransaction(admin, transactionId);

  if (docs.length === 0) {
    throw new Error("No exportable documents found for this transaction");
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();
  const files: TransactionExportManifestFile[] = [];
  const generatedAt = new Date().toISOString();

  for (const doc of docs) {
    const path = doc.storage_path;
    const display = doc.file_name || `document-${doc.id}`;
    const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(path);
    if (dlErr || !blob) {
      const detail = dlErr?.message?.trim() || "missing or unreadable object";
      throw new Error(
        `Export failed: could not download document ${doc.id} ("${display}") at "${path}": ${detail}`
      );
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(await blob.arrayBuffer());
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Export failed: could not read document ${doc.id} ("${display}") at "${path}": ${detail}`
      );
    }
    const entryName = uniqueZipName(usedNames, doc.file_name || `document-${doc.id}`);
    zip.file(entryName, buf);
    files.push({
      document_id: doc.id,
      display_name: doc.file_name,
      storage_path: path,
      zip_entry_name: entryName,
    });
  }

  const manifest: TransactionExportManifest = {
    transaction_id: transactionId,
    export_id: exportId,
    generated_at: generatedAt,
    requested_by: requestedBy,
    document_count: files.length,
    files,
    note:
      "BTQ closing export package. Inbox-only documents (not attached to the checklist) are excluded.",
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  zip.file("export-manifest.json", manifestJson);

  let zipBuffer: Buffer;
  try {
    zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ZIP build failed";
    throw new Error(msg);
  }

  const ts = Date.now();
  const zipFileName = `btq-transaction-export-${transactionId.slice(0, 8)}-${ts}.zip`;
  const manifestStorageFileName = `export-${exportId}-manifest.json`;

  return {
    zipBuffer,
    manifest,
    manifestJson,
    zipFileName,
    manifestStorageFileName,
    byteSize: zipBuffer.length,
  };
}
