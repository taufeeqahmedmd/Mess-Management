/**
 * Best-effort in-memory fixed-window rate limiter for the public self-service
 * endpoints (api.md: "rate-limit them"). The deployment target is a single
 * on-prem instance and the stack is locked (no Redis), so a process-local Map is
 * the right trade-off — it is NOT shared across instances and resets on restart.
 * Treat it as abuse-dampening, not a hard security boundary.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  // Opportunistic prune so the Map can't grow unbounded under key churn.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
  }

  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count += 1;
  return { ok: true, remaining: limit - b.count, retryAfterSec: 0 };
}

/** Best-effort client IP from proxy headers (same precedence as audit logging). */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Test-only: clear all buckets between cases. */
export function __resetRateLimits(): void {
  buckets.clear();
}
