import { DomainError } from "../errors";

/**
 * Idempotency (CHK-002, roadmap §8 + Stripe pattern [7]): every sensitive
 * mutation carries a client-supplied idempotency key. Replaying a completed
 * key returns the stored result; reusing a key with a different payload is
 * rejected; a key still in flight is a conflict.
 */

export type IdempotencyStatus = "PENDING" | "COMPLETED" | "FAILED";

export const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9._:-]{16,128}$/;

export function assertIdempotencyKey(key: string): string {
  const trimmed = key.trim();
  if (!IDEMPOTENCY_KEY_REGEX.test(trimmed)) {
    throw new DomainError(
      "IDEMPOTENCY_KEY_INVALID",
      "idempotency key must be 16-128 chars of [A-Za-z0-9._:-]",
    );
  }
  return trimmed;
}

/**
 * Deterministic JSON serialization with sorted object keys — the payload
 * fingerprint for key-reuse detection. Undefined properties are dropped so
 * `{a:1}` and `{a:1, b:undefined}` hash identically.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}
