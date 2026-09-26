import { DomainError } from "../errors";

/**
 * Rate limiting (W14, roadmap §14 "tenant-aware + route-aware"): fixed
 * window counters. The counter row is incremented atomically in the
 * repository; this module holds the pure window math and the verdict.
 */

export interface RateLimitVerdict {
  allowed: boolean;
  /** Hits recorded in the current window including this request. */
  hits: number;
  limit: number;
  /** Epoch-second bucket of the current window (stable within it). */
  windowKey: string;
  remaining: number;
  resetAt: Date;
}

export function windowKey(now: Date, windowSeconds: number): string {
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new DomainError("RATE_LIMIT_INVALID", `windowSeconds ${windowSeconds}`);
  }
  const epochSeconds = Math.floor(now.getTime() / 1000);
  return String(Math.floor(epochSeconds / windowSeconds));
}

export function evaluateFixedWindow(input: {
  hits: number;
  limit: number;
}): { allowed: boolean; remaining: number } {
  const { hits, limit } = input;
  if (!Number.isInteger(hits) || hits < 0 || !Number.isInteger(limit) || limit < 1) {
    throw new DomainError("RATE_LIMIT_INVALID", "hits and limit must be sane integers");
  }
  return { allowed: hits <= limit, remaining: Math.max(0, limit - hits) };
}

export interface RateLimitPolicy {
  route: string;
  limit: number;
  windowSeconds: number;
}

export function evaluatePolicy(
  policy: RateLimitPolicy,
  hits: number,
  now: Date,
): RateLimitVerdict {
  const key = windowKey(now, policy.windowSeconds);
  const { allowed, remaining } = evaluateFixedWindow({ hits, limit: policy.limit });
  const windowStartEpoch = Number(key) * policy.windowSeconds;
  return {
    allowed,
    hits,
    limit: policy.limit,
    windowKey: key,
    remaining,
    resetAt: new Date((windowStartEpoch + policy.windowSeconds) * 1000),
  };
}
