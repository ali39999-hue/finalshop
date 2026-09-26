import { describe, expect, it } from "vitest";
import {
  assertFulfilmentLines,
  assertFulfillmentTransition,
  fulfilmentStageAfterDelivery,
} from "./fulfillment";
import { assertReturnLines, assertReturnTransition } from "./return";
import { assertRateAmount, resolveShippingRates, type ShippingRateRule } from "./shipping";
import { canTransitionOrder } from "../order/order";

describe("fulfillment (W6)", () => {
  it("walks ship and pickup paths", () => {
    expect(() => assertFulfillmentTransition("PENDING", "SHIPPED")).not.toThrow();
    expect(() =>
      assertFulfillmentTransition("PENDING", "READY_FOR_PICKUP"),
    ).not.toThrow();
    expect(() => assertFulfillmentTransition("SHIPPED", "DELIVERED")).not.toThrow();
    expect(() =>
      assertFulfillmentTransition("DELIVERED", "SHIPPED"),
    ).toThrow(expect.objectContaining({ code: "FULFILLMENT_TRANSITION_INVALID" }));
    expect(canTransitionOrder("CONFIRMED", "FULFILLING")).toBe(true);
    expect(canTransitionOrder("FULFILLING", "PARTIALLY_FULFILLED")).toBe(true);
    expect(canTransitionOrder("PARTIALLY_FULFILLED", "COMPLETED")).toBe(true);
    expect(canTransitionOrder("FULFILLING", "CANCELLED")).toBe(false);
  });

  it("caps fulfillment lines at the outstanding quantity", () => {
    const orderLines = [
      { orderLineId: "l1", quantity: 3, alreadyFulfilled: 1 },
      { orderLineId: "l2", quantity: 2, alreadyFulfilled: 0 },
    ];
    expect(() =>
      assertFulfilmentLines(orderLines, [{ orderLineId: "l1", quantity: 2 }]),
    ).not.toThrow();
    expect(() =>
      assertFulfilmentLines(orderLines, [{ orderLineId: "l1", quantity: 3 }]),
    ).toThrow(expect.objectContaining({ code: "FULFILLMENT_INVALID" }));
    expect(() =>
      assertFulfilmentLines(orderLines, [{ orderLineId: "nope", quantity: 1 }]),
    ).toThrow(expect.objectContaining({ code: "FULFILLMENT_INVALID" }));
  });

  it("stages the order after deliveries", () => {
    expect(fulfilmentStageAfterDelivery([3, 2], [0, 0])).toBe("FULFILLING");
    expect(fulfilmentStageAfterDelivery([3, 2], [1, 0])).toBe("PARTIALLY_FULFILLED");
    expect(fulfilmentStageAfterDelivery([3, 2], [3, 2])).toBe("COMPLETED");
  });
});

describe("returns / RMA (W6)", () => {
  it("walks the RMA machine", () => {
    expect(() => assertReturnTransition("REQUESTED", "APPROVED")).not.toThrow();
    expect(() => assertReturnTransition("APPROVED", "RECEIVED")).not.toThrow();
    expect(() => assertReturnTransition("RECEIVED", "COMPLETED")).not.toThrow();
    expect(() => assertReturnTransition("RECEIVED", "APPROVED")).toThrow(
      expect.objectContaining({ code: "RETURN_TRANSITION_INVALID" }),
    );
    expect(() => assertReturnTransition("REQUESTED", "COMPLETED")).toThrow();
  });

  it("caps return lines at outstanding quantities", () => {
    const orderLines = [{ orderLineId: "l1", quantity: 2, alreadyReturned: 1 }];
    expect(() =>
      assertReturnLines(orderLines, [{ orderLineId: "l1", quantity: 1 }]),
    ).not.toThrow();
    expect(() =>
      assertReturnLines(orderLines, [{ orderLineId: "l1", quantity: 2 }]),
    ).toThrow(expect.objectContaining({ code: "RETURN_INVALID" }));
  });
});

describe("shipping rates (W6)", () => {
  const rules: ShippingRateRule[] = [
    { id: "std", name: "Standard", kind: "FLAT", currency: "USD", amountMinor: 500n, isActive: true },
    {
      id: "heavy",
      name: "Heavy",
      kind: "FLAT",
      currency: "USD",
      amountMinor: 900n,
      maxWeightGrams: 2000,
      isActive: true,
    },
    {
      id: "pickup",
      name: "Pickup",
      kind: "PICKUP",
      currency: "USD",
      amountMinor: 0n,
      isActive: true,
    },
    { id: "eur", name: "EU", kind: "FLAT", currency: "EUR", amountMinor: 700n, isActive: true },
  ];

  it("filters and sorts deterministically, cheapest first", () => {
    const rates = resolveShippingRates(rules, { currency: "USD", weightGrams: 1500 });
    expect(rates.map((r) => r.id)).toEqual(["pickup", "std", "heavy"]);
    const heavy = resolveShippingRates(rules, { currency: "USD", weightGrams: 5000 });
    // "heavy" is excluded by its weight ceiling; "std" has no limit.
    expect(heavy.map((r) => r.id)).toEqual(["pickup", "std"]);
    expect(() => assertRateAmount(-1n)).toThrow(
      expect.objectContaining({ code: "SHIPPING_RATE_INVALID" }),
    );
  });
});
