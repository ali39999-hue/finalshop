import { describe, expect, it } from "vitest";
import {
  assertIntentAmount,
  assertRefundable,
  assertRefundTransition,
  canTransitionPaymentIntent,
  PAYMENT_INTENT_TRANSITIONS,
} from "./payment";
import { parseSignatureHeader, verifyWebhookSignature } from "./webhook";
import { createHmac } from "node:crypto";

describe("payment state machines (PAY-001)", () => {
  it("walks CREATED → PROCESSING → SUCCEEDED", () => {
    expect(canTransitionPaymentIntent("CREATED", "PROCESSING")).toBe(true);
    expect(canTransitionPaymentIntent("PROCESSING", "SUCCEEDED")).toBe(true);
    expect(canTransitionPaymentIntent("FAILED", "PROCESSING")).toBe(true);
    expect(canTransitionPaymentIntent("SUCCEEDED", "PROCESSING")).toBe(false);
    expect(canTransitionPaymentIntent("CANCELED", "PROCESSING")).toBe(false);
    expect(Object.keys(PAYMENT_INTENT_TRANSITIONS)).toHaveLength(5);
  });

  it("validates amounts and refund traces", () => {
    expect(() => assertIntentAmount("USD", 0n)).toThrow(
      expect.objectContaining({ code: "PAYMENT_AMOUNT_INVALID" }),
    );
    expect(() =>
      assertRefundable({ capturedMinor: 5000n, refundedMinor: 2000n, requestedMinor: 3000n }),
    ).not.toThrow();
    expect(() =>
      assertRefundable({ capturedMinor: 5000n, refundedMinor: 2000n, requestedMinor: 3001n }),
    ).toThrow(expect.objectContaining({ code: "REFUND_EXCEEDS_CAPTURED" }));
    expect(() =>
      assertRefundable({ capturedMinor: 0n, refundedMinor: 0n, requestedMinor: 1n }),
    ).toThrow(expect.objectContaining({ code: "REFUND_INVALID" }));
    expect(() => assertRefundTransition("REQUESTED", "EXECUTED")).toThrow(
      expect.objectContaining({ code: "REFUND_TRANSITION_INVALID" }),
    );
  });
});

describe("webhook verification (PAY-002)", () => {
  const secret = "whsec_test_secret";
  const payload = '{"type":"payment.captured"}';
  const timestampMs = 1758900000000;
  const sign = (ts: number, body: string) =>
    createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

  it("accepts a correctly signed, in-window event", () => {
    expect(() =>
      verifyWebhookSignature({
        payload,
        timestampMs,
        signature: sign(timestampMs, payload),
        secret,
        now: new Date(timestampMs + 60_000),
      }),
    ).not.toThrow();
  });

  it("rejects tampered payloads, bad secrets and stale timestamps", () => {
    expect(() =>
      verifyWebhookSignature({
        payload: payload + " ",
        timestampMs,
        signature: sign(timestampMs, payload),
        secret,
        now: new Date(timestampMs),
      }),
    ).toThrow(expect.objectContaining({ code: "WEBHOOK_SIGNATURE_INVALID" }));
    expect(() =>
      verifyWebhookSignature({
        payload,
        timestampMs,
        signature: sign(timestampMs, payload),
        secret: "whsec_wrong",
        now: new Date(timestampMs),
      }),
    ).toThrow(expect.objectContaining({ code: "WEBHOOK_SIGNATURE_INVALID" }));
    expect(() =>
      verifyWebhookSignature({
        payload,
        timestampMs,
        signature: sign(timestampMs, payload),
        secret,
        now: new Date(timestampMs + 10 * 60 * 1000),
      }),
    ).toThrow(expect.objectContaining({ code: "WEBHOOK_TIMESTAMP_OUT_OF_TOLERANCE" }));
  });

  it("parses `t=<ms>,v1=<hex>` headers", () => {
    const parsed = parseSignatureHeader(`t=${timestampMs},v1=${sign(timestampMs, payload)}`);
    expect(parsed.timestampMs).toBe(timestampMs);
    expect(() => parseSignatureHeader("garbage")).toThrow(
      expect.objectContaining({ code: "WEBHOOK_SIGNATURE_INVALID" }),
    );
  });
});
