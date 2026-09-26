import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainError } from "../errors";

/**
 * Webhook inbox (PAY-002, roadmap §9 + threat T-03): provider-neutral
 * HMAC-SHA256 scheme over `${timestamp}.${payload}` (the Stripe convention,
 * used as the platform default). Replay safety comes from two layers:
 * the timestamp tolerance here, and the per-eventId dedupe in the inbox.
 * Signature verification happens at the HTTP boundary (the only place the
 * secret lives); the inbox then dedupes on the provider event id.
 */

export const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

export type WebhookEventStatus = "RECEIVED" | "PROCESSED" | "IGNORED" | "FAILED";

export const WEBHOOK_EVENT_TYPES = [
  "payment.captured",
  "payment.failed",
  "refund.executed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export function verifyWebhookSignature(input: {
  payload: string;
  timestampMs: number;
  signature: string;
  secret: string;
  now?: Date;
  toleranceMs?: number;
}): void {
  const now = input.now ?? new Date();
  const toleranceMs = input.toleranceMs ?? WEBHOOK_TOLERANCE_MS;
  if (
    Math.abs(now.getTime() - input.timestampMs) > toleranceMs
  ) {
    throw new DomainError(
      "WEBHOOK_TIMESTAMP_OUT_OF_TOLERANCE",
      "timestamp outside the replay window",
    );
  }
  const digest = createHmac("sha256", input.secret)
    .update(`${input.timestampMs}.${input.payload}`)
    .digest("hex");
  const expected = Buffer.from(digest, "utf8");
  let provided: Buffer;
  try {
    provided = Buffer.from(input.signature, "utf8");
  } catch {
    throw new DomainError("WEBHOOK_SIGNATURE_INVALID", "unreadable signature");
  }
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new DomainError("WEBHOOK_SIGNATURE_INVALID", "signature mismatch");
  }
}

/** Parses a `t=<ms>,v1=<hex>` signature header into its parts. */
export function parseSignatureHeader(header: string): { timestampMs: number; signature: string } {
  const parts = header.split(",").map((pair) => pair.split("=", 2));
  let timestampMs: number | undefined;
  let signature: string | undefined;
  for (const [name, value] of parts) {
    if (name === "t" && value !== undefined) timestampMs = Number(value);
    if (name === "v1" && value !== undefined) signature = value;
  }
  if (
    timestampMs === undefined ||
    !Number.isFinite(timestampMs) ||
    signature === undefined ||
    signature.length === 0
  ) {
    throw new DomainError(
      "WEBHOOK_SIGNATURE_INVALID",
      "signature header must be `t=<ms>,v1=<hex>`",
    );
  }
  return { timestampMs, signature };
}
