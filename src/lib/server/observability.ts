/**
 * Lightweight server-side observability helpers.
 *
 * Primary dashboards stay where they are:
 *   - Vercel Observability  → function invocations, cold starts, error rate, p95 latency
 *   - Supabase Reports/Logs → database health, RLS / auth errors, slow queries
 *
 * This module adds a thin, searchable, app-level layer on top of those
 * dashboards so we can correlate a slow or failing request back to a specific
 * route, user, and office. Logs are emitted via `console.info` / `console.error`
 * so Vercel's existing log drains pick them up automatically — we are not
 * adding any paid service or dashboard at this time.
 *
 * Conventions:
 *   - "[btq_api_metric]" → successful, metric-style line (durations, statuses)
 *   - "[btq_api_error]"  → server-side failures only
 *
 * SAFETY:
 *   Never pass secrets, tokens, full request bodies, Stripe secret keys,
 *   Supabase service role keys, raw webhook payloads, or document contents
 *   into `metadata`. A best-effort sanitizer below scrubs keys whose names
 *   look sensitive, but the caller is the first line of defense.
 */

const METRIC_PREFIX = "[btq_api_metric]";
const ERROR_PREFIX = "[btq_api_error]";

/** Keys whose values are always redacted before logging, regardless of value type. */
const SENSITIVE_KEY_REGEX =
  /(authorization|cookie|password|secret|token|api[_-]?key|service[_-]?role|stripe[_-]?signature|webhook[_-]?secret|bearer)/i;

const MAX_STRING_LEN = 500;

export type ApiLogContext = {
  route: string;
  method: string;
  startedAtMs: number;
  userId: string | null;
  officeId: string | null;
};

export type StartLogArgs = {
  route: string;
  method: string | undefined | null;
  userId?: string | null;
  officeId?: string | null;
};

export type OutcomeLogOpts = {
  status?: number;
  userId?: string | null;
  officeId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Record the start of an API request. Cheap — no I/O. Returns an opaque
 * context object that should be passed to `logApiSuccess` / `logApiError`
 * so we can compute durationMs at the terminal log site.
 */
export function logApiStart(args: StartLogArgs): ApiLogContext {
  return {
    route: args.route,
    method: (args.method ?? "UNKNOWN").toUpperCase(),
    startedAtMs: Date.now(),
    userId: args.userId ?? null,
    officeId: args.officeId ?? null,
  };
}

/** Mutate ctx to attach IDs that were not known at request entry. */
export function attachLogContext(
  ctx: ApiLogContext,
  ids: { userId?: string | null; officeId?: string | null }
): void {
  if (ids.userId !== undefined) ctx.userId = ids.userId ?? null;
  if (ids.officeId !== undefined) ctx.officeId = ids.officeId ?? null;
}

/** Emit a successful, metric-style log line. Uses console.info. */
export function logApiSuccess(ctx: ApiLogContext, opts: OutcomeLogOpts = {}): void {
  console.info(METRIC_PREFIX, formatPayload(ctx, opts, "success"));
}

/** Emit an error log line. Uses console.error. The error object is safely described. */
export function logApiError(
  ctx: ApiLogContext,
  error: unknown,
  opts: OutcomeLogOpts = {}
): void {
  console.error(ERROR_PREFIX, {
    ...formatPayload(ctx, opts, "error"),
    error: describeError(error),
  });
}

function formatPayload(
  ctx: ApiLogContext,
  opts: OutcomeLogOpts,
  outcome: "success" | "error"
): Record<string, unknown> {
  return {
    outcome,
    route: ctx.route,
    method: ctx.method,
    status: opts.status ?? null,
    durationMs: Date.now() - ctx.startedAtMs,
    userId: opts.userId !== undefined ? opts.userId : ctx.userId,
    officeId: opts.officeId !== undefined ? opts.officeId : ctx.officeId,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    metadata: sanitizeMetadata(opts.metadata),
  };
}

function describeError(error: unknown): {
  message: string;
  name?: string;
  code?: string;
} {
  if (error instanceof Error) {
    const out: { message: string; name?: string; code?: string } = {
      message: truncate(error.message || error.name || "Error"),
      name: error.name,
    };
    const maybeCode = (error as { code?: unknown }).code;
    if (typeof maybeCode === "string") out.code = maybeCode;
    return out;
  }
  if (typeof error === "string") {
    return { message: truncate(error) };
  }
  return { message: "Unknown error" };
}

function sanitizeMetadata(
  meta: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  if (!meta) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEY_REGEX.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = sanitizeValue(v);
  }
  return out;
}

function sanitizeValue(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === "string") return truncate(v);
  if (typeof v === "number" || typeof v === "boolean") return v;
  // Drop anything else (objects, arrays, buffers) to avoid leaking nested
  // secrets or huge payloads into logs. Callers should flatten what they need.
  return "[omitted]";
}

function truncate(s: string): string {
  if (s.length <= MAX_STRING_LEN) return s;
  return `${s.slice(0, MAX_STRING_LEN)}…[truncated]`;
}
