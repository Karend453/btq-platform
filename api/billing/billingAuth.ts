import { createClient } from "@supabase/supabase-js";
import type { VercelRequest } from "@vercel/node";

export function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  if (!url) {
    throw new Error("Missing SUPABASE_URL or VITE_SUPABASE_URL");
  }
  return url;
}

export function getSupabaseAnonKey(): string {
  const k =
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!k) {
    throw new Error("Missing SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY");
  }
  return k;
}

export async function getUserIdFromAuthHeader(
  req: VercelRequest
): Promise<string | null> {
  const raw = req.headers.authorization;
  const token =
    typeof raw === "string" && raw.startsWith("Bearer ")
      ? raw.slice(7).trim()
      : null;
  if (!token) return null;

  const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.id) return null;
  return user.id;
}
