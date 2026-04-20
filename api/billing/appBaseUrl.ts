import type { VercelRequest } from "@vercel/node";

/**
 * Resolves the public-facing app base URL for building return / redirect URLs from serverless
 * handlers (Stripe success/cancel, billing portal return, Supabase invite `redirectTo`, etc.).
 *
 * Resolution order:
 *   1. `APP_URL` env — set this in production (e.g. Vercel Project Settings) to pin the domain.
 *   2. `VITE_APP_URL` env — legacy fallback kept for parity with existing deployments.
 *   3. `req.headers.host` — covers Vercel preview/branch deploys where APP_URL is not set, and
 *      local `vercel dev` where the host header is present.
 *
 * Always returns without a trailing slash. Uses `http` for localhost/loopback hosts, `https`
 * otherwise so production-like hosts never get downgraded by a stray request header. If host
 * resolution somehow fails we fall back to `http://localhost:3000` — the original dev behavior
 * — rather than throw, because Stripe calls in particular should not fail closed on URL shape.
 */
export function resolveAppBaseUrl(req: VercelRequest): string {
  const explicit = process.env.APP_URL?.trim() || process.env.VITE_APP_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const rawHost = req.headers.host;
  const host = typeof rawHost === "string" ? rawHost.trim() : "";
  if (!host) {
    return "http://localhost:3000";
  }

  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const protocol = isLocal ? "http" : "https";
  return `${protocol}://${host}`;
}
