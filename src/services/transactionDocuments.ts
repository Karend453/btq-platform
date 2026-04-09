// src/services/transactionDocuments.ts

import { supabase } from "../lib/supabaseClient";

const BUCKET = "transaction-documents";

export type TransactionDocumentRow = {
  id: string;
  transaction_id: string;
  file_name: string;
  storage_path: string;
  source: string;
  attached_to_checklist_item_id: string | null;
  created_at: string;
  source_document_id?: string | null;
  split_page_indices?: number[] | null;
};

export type InboxDocumentShape = {
  id: string;
  filename: string;
  storage_path: string;
  receivedAt: Date;
  isAttached: boolean;
  attachedToItemId?: string;
};

function rowToInboxDocument(row: TransactionDocumentRow): InboxDocumentShape {
  const storagePath =
    row.storage_path ??
    (row as unknown as { storagePath?: string }).storagePath ??
    "";
  return {
    id: row.id,
    filename: row.file_name,
    storage_path: typeof storagePath === "string" ? storagePath.trim() : "",
    receivedAt: new Date(row.created_at),
    isAttached: !!row.attached_to_checklist_item_id,
    attachedToItemId: row.attached_to_checklist_item_id ?? undefined,
  };
}

/**
 * Get a signed URL for viewing a document in storage.
 * URL expires after 1 hour (3600 seconds).
 * Requires storage RLS: authenticated users need SELECT on storage.objects for bucket 'transaction-documents'.
 * See migration 20250319000000_storage_transaction_documents_policies.sql.
 */
export async function getSignedUrl(storagePath: string): Promise<string | null> {
  const path = (storagePath ?? "").trim();
  if (!path) {
    console.error("[getSignedUrl] Empty storage path");
    return null;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);

  if (error) {
    console.error("[getSignedUrl] Failed:", error.message, "path:", path);
    return null;
  }

  return data?.signedUrl ?? null;
}

/**
 * Upload a file to Supabase Storage and insert a row into transaction_documents.
 * Returns the new document in InboxDocument shape, or null on error.
 */
export async function uploadDocument(
  transactionId: string,
  file: File
): Promise<InboxDocumentShape | null> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${transactionId}/${crypto.randomUUID()}-${safeName}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: false });

  if (uploadError) {
    console.error("[uploadDocument] Storage upload failed:", uploadError);
    console.error("[uploadDocument] Storage error details:", JSON.stringify(uploadError, null, 2));
    return null;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("transaction_documents")
    .insert({
      transaction_id: transactionId,
      file_name: file.name,
      storage_path: storagePath,
      source: "upload",
      attached_to_checklist_item_id: null,
    })
    .select("*")
    .single();

  if (insertError) {
    console.error("[uploadDocument] Insert transaction_documents failed:", insertError);
    console.error("[uploadDocument] Insert error details:", JSON.stringify(insertError, null, 2));
    return null;
  }

  return rowToInboxDocument(inserted as TransactionDocumentRow);
}

const MAX_DISPLAY_NAME_LENGTH = 255;

/**
 * Update the display name only (`transaction_documents.file_name`). Does not move or rename storage objects.
 */
export async function renameTransactionDocumentDisplayName(
  transactionId: string,
  documentId: string,
  displayName: string
): Promise<boolean> {
  const trimmed = displayName.trim();
  if (!trimmed) {
    console.error("[renameTransactionDocumentDisplayName] empty display name");
    return false;
  }
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    console.error("[renameTransactionDocumentDisplayName] display name too long");
    return false;
  }

  const { error } = await supabase
    .from("transaction_documents")
    .update({ file_name: trimmed })
    .eq("id", documentId)
    .eq("transaction_id", transactionId);

  if (error) {
    console.error("[renameTransactionDocumentDisplayName] failed:", error);
    return false;
  }
  return true;
}

const SPLIT_SOURCE = "split";

/**
 * Build a display file name for a split output: uses `outputBaseName`, adds extension from source when missing.
 */
export function fileNameForSplitOutput(outputBaseName: string, sourceFileName: string): string {
  const trimmed = outputBaseName.trim() || "Split output";
  const hasExt = /\.[a-zA-Z0-9]{1,8}$/.test(trimmed);
  if (hasExt) {
    return trimmed.length > 255 ? trimmed.slice(0, 255) : trimmed;
  }
  const m = sourceFileName.match(/(\.[a-zA-Z0-9]+)$/);
  const ext = m?.[1] ?? ".pdf";
  const next = `${trimmed}${ext}`;
  return next.length > 255 ? next.slice(0, 255) : next;
}

export type InsertSplitOutputParams = {
  transactionId: string;
  /** Source document row id (original unsplit file). */
  sourceDocumentId: string;
  sourceStoragePath: string;
  /** 1-based page indices included in this output. */
  pageIndices: number[];
  /** Display name (may omit extension). */
  outputDisplayName: string;
  /** Original source filename (for extension inference). */
  sourceFileName: string;
};

export type InsertSplitOutputResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function contentTypeForFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

/**
 * Create a `transaction_documents` row for a split output.
 *
 * - **Storage:** duplicates the source object to a new key so each output has its own file (same bytes until true page-level splitting exists).
 * - **DB:** saves display name, `source_document_id`, `split_page_indices`, and `source: split` when the schema supports it.
 */
export async function insertSplitOutputDocument(params: InsertSplitOutputParams): Promise<InsertSplitOutputResult> {
  const {
    transactionId,
    sourceDocumentId,
    sourceStoragePath,
    pageIndices,
    outputDisplayName,
    sourceFileName,
  } = params;
  const path = (sourceStoragePath ?? "").trim();
  if (!transactionId || !sourceDocumentId || !path) {
    return { ok: false, error: "Missing transaction or source document." };
  }
  const fileName = fileNameForSplitOutput(outputDisplayName, sourceFileName);
  const safeSegment = fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "split-output.pdf";
  const sortedPages = [...pageIndices].sort((a, b) => a - b);

  const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(path);
  if (downloadError || !blob) {
    console.error("[insertSplitOutputDocument] storage download failed:", downloadError);
    return {
      ok: false,
      error:
        downloadError?.message ??
        "Could not read the source file from storage. Check permissions and try again.",
    };
  }

  const newStoragePath = `${transactionId}/${crypto.randomUUID()}-${safeSegment}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(newStoragePath, blob, {
    upsert: false,
    contentType: contentTypeForFileName(fileName),
  });
  if (uploadError) {
    console.error("[insertSplitOutputDocument] storage upload failed:", uploadError);
    return {
      ok: false,
      error: uploadError.message || "Could not save the split copy to storage.",
    };
  }

  const rowFull: Record<string, unknown> = {
    transaction_id: transactionId,
    file_name: fileName,
    storage_path: newStoragePath,
    source: SPLIT_SOURCE,
    attached_to_checklist_item_id: null,
    source_document_id: sourceDocumentId,
    split_page_indices: sortedPages,
  };

  const { data, error } = await supabase.from("transaction_documents").insert(rowFull).select("id").single();

  if (!error && data && (data as { id?: string }).id) {
    return { ok: true, id: String((data as { id: string }).id) };
  }

  if (error) {
    console.error("[insertSplitOutputDocument] insert failed (full row):", error);
  }

  const rowMinimal = {
    transaction_id: transactionId,
    file_name: fileName,
    storage_path: newStoragePath,
    source: "upload",
    attached_to_checklist_item_id: null,
  };
  const fallback = await supabase.from("transaction_documents").insert(rowMinimal).select("id").single();
  if (fallback.error || !(fallback.data as { id?: string } | null)?.id) {
    await supabase.storage.from(BUCKET).remove([newStoragePath]).catch(() => {});
    const msg = fallback.error?.message ?? error?.message ?? "Could not create the document record.";
    return { ok: false, error: msg };
  }

  const newId = String((fallback.data as { id: string }).id);
  const { error: metaErr } = await supabase
    .from("transaction_documents")
    .update({
      source: SPLIT_SOURCE,
      source_document_id: sourceDocumentId,
      split_page_indices: sortedPages,
    })
    .eq("id", newId);

  if (metaErr) {
    console.warn("[insertSplitOutputDocument] split metadata columns not saved (apply DB migration):", metaErr);
  }
  return { ok: true, id: newId };
}

/**
 * Attach or detach a document to/from a checklist item.
 * Persists checklist_items.document_id (FK to transaction_documents).
 * @param documentId - transaction_documents.id
 * @param checklistItemId - checklist item id, or null to detach this document from any item
 * @returns true on success, false on error
 */
export async function attachDocumentToChecklistItem(
  documentId: string,
  checklistItemId: string | null
): Promise<boolean> {
  if (checklistItemId === null) {
    const { error } = await supabase
      .from("checklist_items")
      .update({ document_id: null })
      .eq("document_id", documentId);

    if (error) {
      console.error("[attachDocumentToChecklistItem] detach failed:", error);
      return false;
    }
    return true;
  }

  const { data: current, error: fetchError } = await supabase
    .from("checklist_items")
    .select("document_id, reviewstatus, is_compliance_document, archived_at")
    .eq("id", checklistItemId)
    .single();

  if (fetchError) {
    console.error("[attachDocumentToChecklistItem] load checklist row failed:", fetchError);
    return false;
  }

  const archivedAt = (current as { archived_at?: string | null } | null)?.archived_at;
  if (archivedAt != null && String(archivedAt).trim() !== "") {
    console.error("[attachDocumentToChecklistItem] checklist item is archived");
    return false;
  }

  const isCompliance =
    (current as { is_compliance_document?: boolean | null } | null)?.is_compliance_document !== false;

  const hadPreviousDocument =
    current?.document_id != null && String(current.document_id).trim() !== "";

  const patch: Record<string, unknown> = { document_id: documentId };

  if (!isCompliance) {
    // Reference / non-compliance: link file only — never mark compliance workflow "complete" on attach.
    patch.reviewnote = null;
    if (hadPreviousDocument) {
      const r = String(current?.reviewstatus ?? "pending").toLowerCase();
      if (r === "rejected" || r === "complete") {
        patch.reviewstatus = "pending";
        patch.status = "pending";
      }
    }
  } else if (hadPreviousDocument) {
    // Replacement after admin decision: move back to pending review (matches Checklist / Inbox UI).
    const r = String(current?.reviewstatus ?? "pending").toLowerCase();
    if (r === "rejected" || r === "complete") {
      patch.reviewstatus = "pending";
      patch.status = "pending";
      patch.reviewnote = null;
    }
  } else {
    // Compliance first attach: queue for review (do not infer "complete" from attachment alone).
    const r = String(current?.reviewstatus ?? "pending").toLowerCase();
    if (r !== "waived") {
      patch.reviewstatus = "pending";
      patch.status = "pending";
      patch.reviewnote = null;
    }
  }

  const { error } = await supabase
    .from("checklist_items")
    .update(patch)
    .eq("id", checklistItemId)
    .select("id, document_id")
    .single();

  if (error) {
    console.error("[attachDocumentToChecklistItem] DB update failed:", error);
    return false;
  }
  return true;
}

/**
 * Fetch all documents for a transaction and map to InboxDocument shape.
 */
export async function fetchDocumentsByTransactionId(
  transactionId: string
): Promise<InboxDocumentShape[]> {
  const { data, error } = await supabase
    .from("transaction_documents")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch transaction documents:", error);
    return [];
  }

  const { data: checklistRows } = await supabase
    .from("checklist_items")
    .select("id, document_id")
    .eq("transaction_id", transactionId)
    .not("document_id", "is", null);

  const docIdToChecklistItemId = new Map<string, string>();
  for (const row of checklistRows ?? []) {
    if (row.document_id) {
      docIdToChecklistItemId.set(String(row.document_id), String(row.id));
    }
  }

  return (data ?? []).map((row) => {
    const base = rowToInboxDocument(row as TransactionDocumentRow);
    const attachedToItemId = docIdToChecklistItemId.get(row.id);
    return {
      ...base,
      isAttached: !!attachedToItemId,
      attachedToItemId: attachedToItemId ?? undefined,
    };
  });
}
