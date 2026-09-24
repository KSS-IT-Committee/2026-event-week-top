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

// A bucket is only useful until it resets, but nothing reads it again after
// that — so without a sweep the map keeps one entry per key forever. Some keys
// are attacker-chosen (loginAction keys by the submitted username, before any
// credential check), which would otherwise make this map grow without bound.
// Sweeping on a timer rather than per call keeps the common path O(1): the
// scan is O(n) but runs at most once per SWEEP_INTERVAL_MS.
const SWEEP_INTERVAL_MS = 60_000;
let nextSweepAt = 0;

function sweepExpired(now: number): void {
  if (now < nextSweepAt) return;
  nextSweepAt = now + SWEEP_INTERVAL_MS;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

// Number of buckets currently held. Exported so the sweep above is testable —
// it is deliberately invisible through checkRateLimit, whose answers must not
// change just because an expired bucket was reclaimed.
export function countLiveBuckets(): number {
  return buckets.size;
}

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
  sweepExpired(now);
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
