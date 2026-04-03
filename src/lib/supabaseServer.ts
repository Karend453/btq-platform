import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Service-role client for serverless only. Never import from browser code.
 * Import `stripeServer` before this module in API routes so `.env.local` is loaded locally.
 */
export function getSupabaseServiceRole(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url?.trim()) {
    throw new Error("Missing SUPABASE_URL (or VITE_SUPABASE_URL) for server-side Supabase");
  }
  if (!key?.trim()) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for server-side Supabase");
  }

  cached = createClient(url.trim(), key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
