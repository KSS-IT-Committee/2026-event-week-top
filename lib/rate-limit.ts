import "server-only";

/**
 * Minimal fixed-window in-memory rate limiter. Keyed by an arbitrary string
 * (we use the logged-in username for /chat).
 *
 * Caveat: state lives in this process only. With blue/green deploys and PR
 * previews each running their own container, the effective limit is per
 * instance, not global — this is a guardrail against runaway use, not a hard
 * billing quota. A global limit would need shared state (e.g. a Postgres or
 * Redis counter), which we deliberately avoid here to skip a 2026-db migration.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  retryAfterSeconds: number;
};

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}
