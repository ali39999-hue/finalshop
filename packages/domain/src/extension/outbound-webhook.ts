import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainError } from "../errors";

/**
 * Outbound webhooks (W13): the platform pushes signed events to plugin/app
 * endpoints. Same HMAC scheme as the inbound side so consumers verify with
 * one primitive; delivery records carry attempts for the retry worker.
 * URL policy (threat T-04): HTTPS only, no loopback/private hosts.
 */

export type WebhookDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED";

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[::1\]$/,
];

export function assertWebhookUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DomainError("WEBHOOK_URL_INVALID", url);
  }
  if (parsed.protocol !== "https:") {
    throw new DomainError(
      "WEBHOOK_URL_INVALID",
      "webhook endpoints must use HTTPS",
    );
  }
  const hostname = parsed.hostname;
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new DomainError(
      "WEBHOOK_URL_INVALID",
      `host ${hostname} is private or loopback`,
    );
  }
  return parsed;
}

export function signWebhookPayload(input: {
  secret: string;
  timestampMs: number;
  payload: string;
}): string {
  return createHmac("sha256", input.secret)
    .update(`${input.timestampMs}.${input.payload}`)
    .digest("hex");
}

/** Verifies our own signature shape (used by tests and debug tooling). */
export function verifyOutboundSignature(input: {
  secret: string;
  timestampMs: number;
  payload: string;
  signature: string;
}): boolean {
  const expected = signWebhookPayload(input);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(input.signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildDeliveryHeaders(input: {
  signature: string;
  timestampMs: number;
}): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-finalshop-signature": `t=${input.timestampMs},v1=${input.signature}`,
  };
}
