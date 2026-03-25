import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfig = {
  urlPresent: Boolean(supabaseUrl),
  keyPresent: Boolean(supabaseAnonKey),
};

export let supabase: SupabaseClient | null = null;
export let supabaseInitError: string | null = null;

if (!supabaseUrl) {
  supabaseInitError = "Missing VITE_SUPABASE_URL";
} else if (!supabaseAnonKey) {
  supabaseInitError = "Missing VITE_SUPABASE_ANON_KEY";
} else {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    supabaseInitError =
      err instanceof Error ? err.message : "Failed to create Supabase client";
  }
}