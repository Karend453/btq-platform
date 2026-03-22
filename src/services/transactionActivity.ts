// src/services/transactionActivity.ts

import { supabase } from "../lib/supabaseClient";

export type ActivityRow = {
  id: string;
  transaction_id: string;
  document_id: string | null;
  checklist_item_id: string | null;
  actor_user_id: string | null;
  actor_display_name: string;
  activity_type: string;
  category: string;
  message: string;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export type ActivityLogEntryShape = {
  id: string;
  timestamp: Date;
  actor: "System" | "Agent" | "Admin" | "Broker";
  category: "docs" | "forms" | "system" | "transaction";
  type: string;
  message: string;
  meta?: Record<string, unknown>;
};

function rowToActivityEntry(row: ActivityRow): ActivityLogEntryShape {
  return {
    id: row.id,
    timestamp: new Date(row.created_at),
    actor: row.actor_display_name as "System" | "Agent" | "Admin" | "Broker",
    category: (row.category as "docs" | "forms" | "system" | "transaction") || "docs",
    type: row.activity_type,
    message: row.message,
    meta: (row.meta as Record<string, unknown>) ?? undefined,
  };
}

export type InsertActivityInput = {
  transactionId: string;
  actor: "System" | "Agent" | "Admin" | "Broker";
  category: "docs" | "forms" | "system" | "transaction";
  type: string;
  message: string;
  meta?: Record<string, unknown>;
  documentId?: string | null;
  checklistItemId?: string | null;
  actorUserId?: string | null;
};

/**
 * Insert an activity entry and return it as ActivityLogEntryShape.
 * Requires an authenticated session; skips insert if session is missing (audit table).
 */
export async function insertActivityEntry(
  input: InsertActivityInput
): Promise<ActivityLogEntryShape | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  const user = session?.user;

  console.log("[insertActivityEntry] auth state:", {
    hasSession: !!session,
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    actorUserIdFromInput: input.actorUserId ?? null,
  });

  if (!session) {
    console.warn("[insertActivityEntry] no session — skipping insert (transaction_activity requires authenticated)");
    return null;
  }

  const payload = {
    transaction_id: input.transactionId,
    document_id: input.documentId ?? null,
    checklist_item_id: input.checklistItemId ?? null,
    actor_user_id: input.actorUserId ?? user?.id ?? null,
    actor_display_name: input.actor,
    activity_type: input.type,
    category: input.category,
    message: input.message,
    meta: input.meta ?? {},
  };
  console.log("[insertActivityEntry] payload:", JSON.stringify(payload, null, 2));

  const { data, error } = await supabase
    .from("transaction_activity")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    console.error("[insertActivityEntry] Supabase error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      full: JSON.stringify(error),
    });
    return null;
  }

  console.log("[insertActivityEntry] success, data:", data);
  return rowToActivityEntry(data as ActivityRow);
}

/**
 * Fetch all activity entries for a transaction, newest first.
 */
export async function fetchActivityByTransactionId(
  transactionId: string
): Promise<ActivityLogEntryShape[]> {
  const { data, error } = await supabase
    .from("transaction_activity")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch transaction activity:", error);
    return [];
  }

  return (data ?? []).map((row) => rowToActivityEntry(row as ActivityRow));
}
