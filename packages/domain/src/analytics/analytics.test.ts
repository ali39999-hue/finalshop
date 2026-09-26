import { describe, expect, it } from "vitest";
import {
  assertEventPropertiesSafe,
  parseEventName,
} from "../analytics/event";
import { computeFunnel, type FunnelEvent } from "../analytics/funnel";
import { evaluatePolicy, windowKey } from "../hardening/rate-limit";

describe("analytics events (W12)", () => {
  it("requires versioned, lowercase event names", () => {
    expect(parseEventName("product.viewed@1")).toEqual({
      base: "product.viewed",
      version: 1,
    });
    expect(() => parseEventName("ProductViewed")).toThrow(
      expect.objectContaining({ code: "ANALYTICS_EVENT_INVALID" }),
    );
    expect(() => parseEventName("product.viewed")).toThrow();
  });

  it("blocks PII-looking property keys and oversized payloads", () => {
    expect(() =>
      assertEventPropertiesSafe({ email: "a@b.c" }),
    ).toThrow(expect.objectContaining({ code: "ANALYTICS_PII_BLOCKED" }));
    expect(() =>
      assertEventPropertiesSafe({ phone_number: "123" }),
    ).toThrow(expect.objectContaining({ code: "ANALYTICS_PII_BLOCKED" }));
    const many: Record<string, unknown> = {};
    for (let i = 0; i < 31; i += 1) many[`k${i}`] = i;
    expect(() => assertEventPropertiesSafe(many)).toThrow(
      expect.objectContaining({ code: "ANALYTICS_EVENT_INVALID" }),
    );
    expect(() =>
      assertEventPropertiesSafe({ productId: "p1", variantId: "v1" }),
    ).not.toThrow();
  });
});

describe("funnels (W12)", () => {
  const at = (minutes: number) => new Date(2026, 8, 26, 12, minutes);
  const events: FunnelEvent[] = [
    { name: "cart.updated@1", sessionId: "s1", occurredAt: at(0) },
    { name: "checkout.started@1", sessionId: "s1", occurredAt: at(1) },
    { name: "order.placed@1", sessionId: "s1", occurredAt: at(2) },
    { name: "cart.updated@1", sessionId: "s2", occurredAt: at(0) },
    { name: "checkout.started@1", sessionId: "s2", occurredAt: at(1) },
    { name: "order.placed@1", sessionId: "s3", occurredAt: at(0) }, // skipped step
  ];
  const steps = [
    { eventName: "cart.updated@1" },
    { eventName: "checkout.started@1" },
    { eventName: "order.placed@1" },
  ];

  it("counts ordered session progression", () => {
    const result = computeFunnel(events, steps);
    // s3 fired step 3 without steps 1–2 — ordered progression excludes it.
    expect(result.counts).toEqual([2, 2, 1]);
    expect(result.conversionRates[0]).toBe(1);
    expect(result.conversionRates[1]).toBe(1);
    expect(result.conversionRates[2]).toBeCloseTo(0.5);
    expect(result.totalSessions).toBe(3);
  });

  it("rejects empty funnels", () => {
    expect(() => computeFunnel([], [])).toThrow(
      expect.objectContaining({ code: "FUNNEL_INVALID" }),
    );
  });
});

describe("rate limiting (W14)", () => {
  it("buckets time into stable windows", () => {
    const t1 = new Date("2026-09-26T12:00:30Z");
    const t2 = new Date("2026-09-26T12:00:59Z");
    const t3 = new Date("2026-09-26T12:01:00Z");
    expect(windowKey(t1, 60)).toBe(windowKey(t2, 60));
    expect(windowKey(t1, 60)).not.toBe(windowKey(t3, 60));
  });

  it("evaluates the fixed window verdict", () => {
    const policy = { route: "/checkout", limit: 5, windowSeconds: 60 };
    const now = new Date("2026-09-26T12:00:30Z");
    const verdict = evaluatePolicy(policy, 5, now);
    expect(verdict.allowed).toBe(true);
    expect(verdict.remaining).toBe(0);
    expect(evaluatePolicy(policy, 6, now).allowed).toBe(false);
    expect(verdict.resetAt.toISOString()).toBe("2026-09-26T12:01:00.000Z");
  });
});
