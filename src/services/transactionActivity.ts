// src/services/transactionActivity.ts

import { supabase } from "../lib/supabaseClient";

/** Matches `public.transaction_activity` columns returned by Supabase. */
export type ActivityRow = {
  id: string;
  transaction_id: string;
  document_id: string | null;
  checklist_item_id: string | null;
  actor_user_id: string | null;
  actor_display_name: string;
  activity_type: string;
  message: string;
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

function deriveCategoryFromActivityType(activityType: string): ActivityLogEntryShape["category"] {
  const t = (activityType ?? "").toLowerCase();
  if (t.includes("form")) return "forms";
  if (t.includes("system") || t === "status_auto_reset") return "system";
  if (t.includes("transaction") && !t.includes("document")) return "transaction";
  return "docs";
}

function rowToActivityEntry(row: ActivityRow): ActivityLogEntryShape {
  return {
    id: row.id,
    timestamp: new Date(row.created_at),
    actor: row.actor_display_name as "System" | "Agent" | "Admin" | "Broker",
    category: deriveCategoryFromActivityType(row.activity_type),
    type: row.activity_type,
    message: row.message,
  };
}

export type InsertActivityInput = {
  transactionId: string;
  actor: "System" | "Agent" | "Admin" | "Broker";
  /** Accepted for call-site compatibility; not persisted (no DB column). */
  category?: "docs" | "forms" | "system" | "transaction";
  type: string;
  message: string;
  /** Accepted for call-site compatibility; not persisted (no DB column). */
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
  const sessionRes = await supabase.auth.getSession();
  console.log("[BTQ activity debug] getSession()", {
    error: sessionRes.error?.message ?? null,
    hasSession: !!sessionRes.data?.session,
    userId: sessionRes.data?.session?.user?.id ?? null,
  });
  const session = sessionRes.data?.session;
  const user = session?.user;

  console.log("[insertActivityEntry] auth state:", {
    hasSession: !!session,
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    actorUserIdFromInput: input.actorUserId ?? null,
  });

  if (!session) {
    console.warn("[insertActivityEntry] no session — skipping insert (transaction_activity requires authenticated)");
    console.log("[BTQ activity debug] insert not attempted (no session)");
    return null;
  }

  const payload = {
    transaction_id: input.transactionId,
    document_id: input.documentId ?? null,
    checklist_item_id: input.checklistItemId ?? null,
    actor_user_id: input.actorUserId ?? user?.id ?? null,
    actor_display_name: input.actor,
    activity_type: input.type,
    message: input.message,
  };
  console.log("[insertActivityEntry] payload:", JSON.stringify(payload, null, 2));

  console.log("[BTQ activity debug] insertActivityEntry attempting insert");
  const { data, error } = await supabase
    .from("transaction_activity")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    console.error("[BTQ activity debug] insert error (exact)", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    console.error("[insertActivityEntry] Supabase error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      full: JSON.stringify(error),
    });
    return null;
  }

  console.log("[BTQ activity debug] insert succeeded, row:", data);
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

  const rowCount = (data ?? []).length;
  if (error) {
    console.error("[BTQ activity debug] fetchActivityByTransactionId error", {
      transactionId,
      message: error.message,
      code: error.code,
      details: error.details,
    });
    console.error("Failed to fetch transaction activity:", error);
    return [];
  }

  console.log("[BTQ activity debug] fetchActivityByTransactionId", {
    transactionId,
    rowCount,
  });

  return (data ?? []).map((row) => rowToActivityEntry(row as ActivityRow));
}
