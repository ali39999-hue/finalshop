import { describe, expect, it } from "vitest";
import { assertIdempotencyKey, stableStringify } from "./idempotency";
import {
  assertCheckoutTransition,
  canTransitionCheckout,
} from "./checkout";
import {
  assertOrderTransition,
  buildOrderLines,
  canTransitionOrder,
  computeOrderTotals,
  formatOrderNumber,
} from "../order/order";

describe("checkout state machine (CHK-001)", () => {
  it("walks the happy path", () => {
    const path = [
      "CART",
      "PRICED",
      "CUSTOMER_CAPTURED",
      "ADDRESS_CAPTURED",
      "REVIEWED",
      "PAYMENT_PENDING",
      "PAYMENT_CONFIRMED",
      "ORDER_CONFIRMED",
    ] as const;
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransitionCheckout(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it("rejects skipping steps and illegal jumps", () => {
    expect(canTransitionCheckout("CART", "ADDRESS_CAPTURED")).toBe(false);
    expect(canTransitionCheckout("REVIEWED", "PAYMENT_CONFIRMED")).toBe(false);
    expect(canTransitionCheckout("COMPLETED", "CART")).toBe(false);
    expect(() =>
      assertCheckoutTransition("PRICED", "REVIEWED"),
    ).toThrow(expect.objectContaining({ code: "CHECKOUT_TRANSITION_INVALID" }));
  });

  it("allows failure retry and cancellation only before payment confirms", () => {
    expect(canTransitionCheckout("PAYMENT_PENDING", "PAYMENT_FAILED")).toBe(true);
    expect(canTransitionCheckout("PAYMENT_FAILED", "PAYMENT_PENDING")).toBe(true);
    expect(canTransitionCheckout("PAYMENT_CONFIRMED", "CANCELLED")).toBe(false);
    expect(canTransitionCheckout("REVIEWED", "CANCELLED")).toBe(true);
  });
});

describe("idempotency (CHK-002)", () => {
  it("validates key format", () => {
    expect(assertIdempotencyKey("order-2026-09-26-0001")).toBe(
      "order-2026-09-26-0001",
    );
    expect(() => assertIdempotencyKey("short")).toThrow(
      expect.objectContaining({ code: "IDEMPOTENCY_KEY_INVALID" }),
    );
    expect(() => assertIdempotencyKey("has spaces in it 1234")).toThrow(
      expect.objectContaining({ code: "IDEMPOTENCY_KEY_INVALID" }),
    );
  });

  it("fingerprints payloads independent of key order", () => {
    const a = stableStringify({ orgId: "o1", cartId: "c1", meta: { b: 2, a: 1 } });
    const b = stableStringify({ meta: { a: 1, b: 2 }, cartId: "c1", orgId: "o1" });
    expect(a).toBe(b);
    // undefined-valued keys are dropped
    expect(stableStringify({ a: 1, b: undefined })).toBe(
      stableStringify({ a: 1 }),
    );
  });
});

describe("order aggregate (ORD-001/002)", () => {
  it("formats human-readable order numbers", () => {
    expect(formatOrderNumber(1)).toBe("SO-00000001");
    expect(formatOrderNumber(12345678)).toBe("SO-12345678");
    expect(() => formatOrderNumber(0)).toThrow(
      expect.objectContaining({ code: "ORDER_NUMBER_INVALID" }),
    );
  });

  it("builds lines with proportional discount allocation", () => {
    const lines = buildOrderLines(
      [
        { variantId: "v1", sku: "TEE", title: "Tee", quantity: 2, unitPriceMinor: 2000n },
        { variantId: "v2", sku: "CAP", title: "Cap", quantity: 1, unitPriceMinor: 1000n },
      ],
      "USD",
      500n,
    );
    expect(lines.map((l) => l.lineTotalMinor)).toEqual([4000n, 1000n]);
    // 500 discount over 4000/1000 → 400 + 100, sums exactly
    expect(lines.map((l) => l.lineDiscountMinor)).toEqual([400n, 100n]);
    const totals = computeOrderTotals(lines);
    expect(totals).toEqual({ subtotalMinor: 5000n, discountMinor: 500n, totalMinor: 4500n });
  });

  it("accepts a discount up to the subtotal and rejects beyond it", () => {
    // applyPromotions clamps upstream; a discount beyond the subtotal that
    // still reaches the order builder is corruption and must fail loudly.
    const full = buildOrderLines(
      [{ variantId: "v1", sku: "TEE", title: "Tee", quantity: 1, unitPriceMinor: 1000n }],
      "USD",
      1000n,
    );
    expect(computeOrderTotals(full).totalMinor).toBe(0n);
    expect(() =>
      buildOrderLines(
        [{ variantId: "v1", sku: "TEE", title: "Tee", quantity: 1, unitPriceMinor: 1000n }],
        "USD",
        1001n,
      ),
    ).toThrow(expect.objectContaining({ code: "ORDER_INVALID" }));
    expect(() =>
      buildOrderLines(
        [{ variantId: "v1", sku: "TEE", title: "Tee", quantity: 0, unitPriceMinor: 100n }],
        "USD",
        0n,
      ),
    ).toThrow(expect.objectContaining({ code: "ORDER_INVALID" }));
  });

  it("enforces the order state machine", () => {
    expect(canTransitionOrder("PENDING_PAYMENT", "CONFIRMED")).toBe(true);
    expect(canTransitionOrder("PENDING_PAYMENT", "CANCELLED")).toBe(true);
    expect(canTransitionOrder("CONFIRMED", "CANCELLED")).toBe(true);
    expect(canTransitionOrder("CANCELLED", "CONFIRMED")).toBe(false);
    expect(() =>
      assertOrderTransition("CANCELLED", "CONFIRMED"),
    ).toThrow(expect.objectContaining({ code: "ORDER_TRANSITION_INVALID" }));
  });
});
