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
  // [DEBUG] Temporary logging to trace 400 error
  console.log("[uploadDocument] transactionId:", transactionId);
  console.log("[uploadDocument] file.name:", file.name);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${transactionId}/${crypto.randomUUID()}-${safeName}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: false });

  // [DEBUG] Storage upload result/error
  if (uploadError) {
    console.error("[uploadDocument] Storage upload failed:", uploadError);
    console.error("[uploadDocument] Storage error details:", JSON.stringify(uploadError, null, 2));
    return null;
  }
  console.log("[uploadDocument] Storage upload success:", uploadData);

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

  // [DEBUG] DB insert result/error
  if (insertError) {
    console.error("[uploadDocument] Insert transaction_documents failed:", insertError);
    console.error("[uploadDocument] Insert error details:", JSON.stringify(insertError, null, 2));
    return null;
  }
  console.log("[uploadDocument] DB insert success:", inserted);

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
    // Reference documents: file only, never submit to compliance review.
    patch.reviewstatus = "complete";
    patch.status = "complete";
    patch.reviewnote = null;
  } else if (hadPreviousDocument) {
    // Replacement after admin decision: move back to pending review (matches Checklist / Inbox UI).
    const r = String(current?.reviewstatus ?? "pending").toLowerCase();
    if (r === "rejected" || r === "complete") {
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
