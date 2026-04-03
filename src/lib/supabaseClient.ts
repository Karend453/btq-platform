import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrlRaw = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKeyRaw = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseUrl =
  typeof supabaseUrlRaw === "string" ? supabaseUrlRaw.trim() : "";
const supabaseAnonKey =
  typeof supabaseAnonKeyRaw === "string" ? supabaseAnonKeyRaw.trim() : "";

export let supabase: SupabaseClient | null = null;
export let supabaseInitError: string | null = null;

if (!supabaseUrl) {
  supabaseInitError = "Missing VITE_SUPABASE_URL";
} else if (!supabaseAnonKey) {
  supabaseInitError = "Missing VITE_SUPABASE_ANON_KEY";
} else {
  // TODO: remove after verifying signup hits https://<project-ref>.supabase.co/auth/v1/signup
  console.log("[supabaseClient] VITE_SUPABASE_URL", supabaseUrl);
  console.log('[supabaseClient] VITE_SUPABASE_URL raw =', import.meta.env.VITE_SUPABASE_URL)
console.log('[supabaseClient] VITE_SUPABASE_URL trimmed =', String(import.meta.env.VITE_SUPABASE_URL || '').trim())
console.log('[supabaseClient] anon key present =', Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY), 'length =', (import.meta.env.VITE_SUPABASE_ANON_KEY || '').length)
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}