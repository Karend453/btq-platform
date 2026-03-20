// src/services/checklistItemComments.ts

import { supabase } from "../lib/supabaseClient";

export type CommentRow = {
  id: string;
  transaction_id: string;
  checklist_item_id: string;
  author_role: string;
  author_name: string;
  message: string;
  visibility: string;
  type: string | null;
  page_number: number | null;
  location_note: string | null;
  created_at: string;
  unread: Record<string, boolean> | null;
};

export type CommentShape = {
  id: string;
  authorRole: "Admin" | "Agent";
  authorName: string;
  createdAt: Date;
  message: string;
  visibility: "Internal" | "Shared";
  type?: "Comment" | "StatusChange" | "System";
  unread?: { Admin?: boolean; Agent?: boolean };
  pageNumber?: number;
  locationNote?: string;
};

function rowToCommentShape(row: CommentRow): CommentShape {
  const unread = row.unread as Record<string, boolean> | null | undefined;
  return {
    id: row.id,
    authorRole: row.author_role as "Admin" | "Agent",
    authorName: row.author_name,
    createdAt: new Date(row.created_at),
    message: row.message,
    visibility: row.visibility as "Internal" | "Shared",
    type: (row.type as "Comment" | "StatusChange" | "System") ?? "Comment",
    unread: unread && typeof unread === "object" ? (unread as { Admin?: boolean; Agent?: boolean }) : undefined,
    pageNumber: row.page_number ?? undefined,
    locationNote: row.location_note ?? undefined,
  };
}

/**
 * Fetch all comments for a transaction, grouped by checklist_item_id.
 * Returns a map: checklist_item_id -> CommentShape[]
 */
export async function fetchCommentsByTransactionId(
  transactionId: string
): Promise<Map<string, CommentShape[]>> {
  const { data, error } = await supabase
    .from("checklist_item_comments")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch checklist item comments:", error);
    return new Map();
  }

  const byItem = new Map<string, CommentShape[]>();
  for (const row of data ?? []) {
    const r = row as CommentRow;
    const comment = rowToCommentShape(r);
    const key = String(r.checklist_item_id);
    const list = byItem.get(key) ?? [];
    list.push(comment);
    byItem.set(key, list);
  }
  return byItem;
}

export type InsertCommentInput = {
  transactionId: string;
  checklistItemId: string;
  authorRole: "Admin" | "Agent";
  authorName: string;
  message: string;
  visibility: "Internal" | "Shared";
  type?: "Comment" | "StatusChange" | "System";
  pageNumber?: number;
  locationNote?: string;
  unread?: { Admin?: boolean; Agent?: boolean };
};

/**
 * Insert a comment and return it as CommentShape.
 */
export async function insertComment(input: InsertCommentInput): Promise<CommentShape | null> {
  const { data, error } = await supabase
    .from("checklist_item_comments")
    .insert({
      transaction_id: input.transactionId,
      checklist_item_id: String(input.checklistItemId),
      author_role: input.authorRole,
      author_name: input.authorName,
      message: input.message,
      visibility: input.visibility,
      type: input.type ?? "Comment",
      page_number: input.pageNumber ?? null,
      location_note: input.locationNote ?? null,
      unread: input.unread ?? {},
    })
    .select("*")
    .single();

  if (error) {
    console.error("Failed to insert comment:", error);
    return null;
  }

  return rowToCommentShape(data as CommentRow);
}
