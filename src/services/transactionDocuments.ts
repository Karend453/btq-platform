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
  return {
    id: row.id,
    filename: row.file_name,
    storage_path: row.storage_path,
    receivedAt: new Date(row.created_at),
    isAttached: !!row.attached_to_checklist_item_id,
    attachedToItemId: row.attached_to_checklist_item_id ?? undefined,
  };
}

/**
 * Get a signed URL for viewing a document in storage.
 * URL expires after 1 hour (3600 seconds).
 */
export async function getSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (error) {
    console.error("Failed to create signed URL:", error);
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

/**
 * Attach or detach a document to/from a checklist item.
 * Persists attached_to_checklist_item_id to Supabase.
 * @param documentId - transaction_documents.id
 * @param checklistItemId - checklist item id, or null to detach
 * @returns true on success, false on error
 */
export async function attachDocumentToChecklistItem(
  documentId: string,
  checklistItemId: string | null
): Promise<boolean> {
  const { data, error } = await supabase
    .from("transaction_documents")
    .update({ attached_to_checklist_item_id: checklistItemId })
    .eq("id", documentId)
    .select("id, attached_to_checklist_item_id")
    .single();

  // [DEBUG] Attach persistence
  console.log("[attachDocumentToChecklistItem] documentId:", documentId, "checklistItemId:", checklistItemId, "result:", { data, error });

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

  const docs = (data ?? []).map((row) => rowToInboxDocument(row as TransactionDocumentRow));
  // [DEBUG] Fetched documents with attached_to_checklist_item_id
  docs.forEach((d) => {
    if (d.attachedToItemId) {
      console.log("[fetchDocumentsByTransactionId] doc id:", d.id, "attachedToItemId:", d.attachedToItemId);
    }
  });
  return docs;
}
