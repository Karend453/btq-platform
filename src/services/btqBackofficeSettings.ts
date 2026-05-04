import { supabase } from "../lib/supabaseClient";

const SETTINGS_ROW_ID = "default";

export type BtqBackofficeSettingsRow = {
  id: string;
  monthly_expense_estimate_cents: number;
  starting_balance_cents: number;
  annual_goal_cents: number;
  updated_at: string;
};

function coerceNonnegativeInt(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.trunc(x));
}

function coerceSignedIntCents(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x);
}

export async function fetchBtqBackofficeSettings(): Promise<{
  row: BtqBackofficeSettingsRow | null;
  error: string | null;
}> {
  if (!supabase) {
    return { row: null, error: "Supabase client not configured." };
  }

  const { data, error } = await supabase
    .from("btq_backoffice_settings")
    .select(
      "id, monthly_expense_estimate_cents, starting_balance_cents, annual_goal_cents, updated_at"
    )
    .eq("id", SETTINGS_ROW_ID)
    .maybeSingle();

  if (error) {
    console.warn("[fetchBtqBackofficeSettings]", error.message);
    return { row: null, error: error.message };
  }

  if (!data) {
    return { row: null, error: null };
  }

  return {
    row: {
      id: String(data.id),
      monthly_expense_estimate_cents: coerceNonnegativeInt(data.monthly_expense_estimate_cents),
      starting_balance_cents: coerceSignedIntCents(data.starting_balance_cents),
      annual_goal_cents: coerceNonnegativeInt(data.annual_goal_cents),
      updated_at: String(data.updated_at ?? ""),
    },
    error: null,
  };
}

export type BtqBackofficeFinancialSettingsPayload = {
  monthly_expense_estimate_cents: number;
  starting_balance_cents: number;
  annual_goal_cents: number;
};

export async function upsertBtqBackofficeFinancialSettings(
  payload: BtqBackofficeFinancialSettingsPayload
): Promise<{ ok: boolean; error: string | null }> {
  if (!supabase) {
    return { ok: false, error: "Supabase client not configured." };
  }

  const expense = Math.max(0, Math.round(Number(payload.monthly_expense_estimate_cents)));
  const starting = Math.round(Number(payload.starting_balance_cents));
  const goal = Math.max(0, Math.round(Number(payload.annual_goal_cents)));

  if (!Number.isFinite(expense) || !Number.isFinite(starting) || !Number.isFinite(goal)) {
    return { ok: false, error: "Invalid amount." };
  }

  const { error } = await supabase.from("btq_backoffice_settings").upsert(
    {
      id: SETTINGS_ROW_ID,
      monthly_expense_estimate_cents: expense,
      starting_balance_cents: starting,
      annual_goal_cents: goal,
    },
    { onConflict: "id" }
  );

  if (error) {
    console.warn("[upsertBtqBackofficeFinancialSettings]", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, error: null };
}
