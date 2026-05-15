import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseServiceRole } from "../src/lib/supabaseServer.js";
import {
  logApiError,
  logApiStart,
  logApiSuccess,
} from "../src/lib/server/observability.js";

/**
 * Lightweight liveness/readiness endpoint.
 *
 * Goal: a single URL we can curl (or point a free uptime monitor at) to confirm
 * (a) the Vercel serverless function is running, and (b) Supabase is reachable
 * from this region with our current credentials.
 *
 * Primary monitoring dashboards remain:
 *   - Vercel Observability  → invocations / cold starts / latency
 *   - Supabase Reports/Logs → DB health, RLS errors, slow queries
 *
 * This endpoint is intentionally cheap (HEAD-style query, no rows returned)
 * and never exposes secrets, stack traces, or query results in the response.
 */

const ROUTE = "api/health";

type HealthBody = {
  ok: boolean;
  timestamp: string;
  environment: string;
  supabase: "ok" | "error" | "unconfigured";
  error?: string;
};

function resolveEnvironment(): string {
  return (
    process.env.VERCEL_ENV ??
    process.env.NODE_ENV ??
    "unknown"
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = logApiStart({ route: ROUTE, method: req.method });
  const timestamp = new Date().toISOString();
  const environment = resolveEnvironment();

  res.setHeader("Cache-Control", "no-store");

  let admin;
  try {
    admin = getSupabaseServiceRole();
  } catch (e) {
    const body: HealthBody = {
      ok: false,
      timestamp,
      environment,
      supabase: "unconfigured",
      error: "Supabase is not configured",
    };
    logApiError(ctx, e, {
      status: 503,
      metadata: { stage: "supabase_init", supabase: "unconfigured" },
    });
    return res.status(503).json(body);
  }

  try {
    /**
     * `head: true` returns no rows — just headers + count — which makes this
     * one of the cheapest queries we can run and still prove RLS-free
     * connectivity through the service-role client.
     */
    const { error } = await admin
      .from("offices")
      .select("id", { count: "exact", head: true })
      .limit(1);

    if (error) {
      const body: HealthBody = {
        ok: false,
        timestamp,
        environment,
        supabase: "error",
        error: "Supabase query failed",
      };
      logApiError(ctx, error, {
        status: 503,
        metadata: { stage: "supabase_query", supabase: "error" },
      });
      return res.status(503).json(body);
    }

    const body: HealthBody = {
      ok: true,
      timestamp,
      environment,
      supabase: "ok",
    };
    logApiSuccess(ctx, { status: 200, metadata: { supabase: "ok" } });
    return res.status(200).json(body);
  } catch (e) {
    const body: HealthBody = {
      ok: false,
      timestamp,
      environment,
      supabase: "error",
      error: "Supabase request failed",
    };
    logApiError(ctx, e, {
      status: 503,
      metadata: { stage: "supabase_query_unhandled", supabase: "error" },
    });
    return res.status(503).json(body);
  }
}
