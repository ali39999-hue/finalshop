import { describe, expect, it } from "vitest";
import { money } from "../money/money";
import { applyPromotions, type PromotionRule } from "./promotion";
import { resolveUnitPrice, type PriceCandidate } from "./resolution";
import { buildQuote } from "./quote";

function rule(overrides?: Partial<PromotionRule>): PromotionRule {
  return {
    id: "promo-1",
    kind: "PERCENTAGE",
    percentageBps: 1000,
    priority: 10,
    exclusive: false,
    isActive: true,
    ...overrides,
  };
}

describe("promotion engine (PRICE-003)", () => {
  it("applies percentage discounts deterministically", () => {
    const result = applyPromotions(money("USD", 9999), [rule()]);
    expect(result.total.minor).toBe(8999n); // 10% of 99.99 → 10.00 (HALF_UP)
    expect(result.discounts).toHaveLength(1);
  });

  it("stacks in priority order and stops at exclusive promotions", () => {
    const rules = [
      rule({ id: "b-fixed", kind: "FIXED", amount: money("USD", 500), priority: 20 }),
      rule({
        id: "a-exclusive",
        kind: "PERCENTAGE",
        percentageBps: 1000,
        priority: 10,
        exclusive: true,
      }),
    ];
    const result = applyPromotions(money("USD", 10000), rules);
    // Exclusive 10% applies first, then the chain stops.
    expect(result.discounts.map((d) => d.promotionId)).toEqual(["a-exclusive"]);
    expect(result.total.minor).toBe(9000n);
  });

  it("stacks non-exclusive promotions on the running subtotal", () => {
    const rules = [
      rule({ id: "pct", kind: "PERCENTAGE", percentageBps: 1000, priority: 10 }),
      rule({ id: "fixed", kind: "FIXED", amount: money("USD", 500), priority: 20 }),
    ];
    const result = applyPromotions(money("USD", 10000), rules);
    // 10% of 100.00 = 10.00 → running 90.00 → minus 5.00 → 85.00
    expect(result.total.minor).toBe(8500n);
    expect(result.discounts.map((d) => d.amount.minor)).toEqual([1000n, 500n]);
  });

  it("clamps discounts so the total never goes negative", () => {
    const result = applyPromotions(money("USD", 300), [
      rule({ kind: "FIXED", amount: money("USD", 9999) }),
    ]);
    expect(result.total.minor).toBe(0n);
    expect(result.discounts[0]?.amount.minor).toBe(300n);
  });

  it("rejects malformed rules", () => {
    const noBps = rule();
    delete noBps.percentageBps;
    expect(() => applyPromotions(money("USD", 100), [noBps])).toThrow(
      expect.objectContaining({ code: "PROMOTION_INVALID" }),
    );
    const noAmount = rule({ kind: "FIXED" });
    delete noAmount.amount;
    expect(() => applyPromotions(money("USD", 100), [noAmount])).toThrow(
      expect.objectContaining({ code: "PROMOTION_INVALID" }),
    );
  });
});

describe("price resolution (PRICE-002)", () => {
  const at = new Date("2026-09-26T12:00:00Z");
  const candidate = (overrides?: Partial<PriceCandidate>): PriceCandidate => ({
    priceListId: "pl-retail",
    priority: 10,
    unitPrice: money("USD", 2000),
    minQuantity: 1,
    isActive: true,
    ...overrides,
  });

  it("selects the lowest-priority-number eligible list", () => {
    const { winner } = resolveUnitPrice({
      currency: "USD",
      quantity: 1,
      at,
      candidates: [
        candidate({
          priceListId: "wholesale",
          priority: 5,
          unitPrice: money("USD", 1500),
          minQuantity: 10,
        }),
        candidate({ priceListId: "retail", priority: 10 }),
      ],
    });
    expect(winner?.priceListId).toBe("retail");
    expect(winner?.unitPrice.minor).toBe(2000n);
  });

  it("prefers deeper quantity tiers within the same priority", () => {
    const { winner } = resolveUnitPrice({
      currency: "USD",
      quantity: 12,
      at,
      candidates: [
        candidate({ priceListId: "a", priority: 5, minQuantity: 1 }),
        candidate({
          priceListId: "b",
          priority: 5,
          minQuantity: 10,
          unitPrice: money("USD", 1800),
        }),
      ],
    });
    expect(winner?.priceListId).toBe("b");
  });

  it("reports rejection reasons for every excluded candidate", () => {
    const { winner, rejected } = resolveUnitPrice({
      currency: "USD",
      quantity: 1,
      at,
      candidates: [
        candidate({ priceListId: "off", isActive: false }),
        candidate({ priceListId: "eur", unitPrice: money("EUR", 100) }),
        candidate({ priceListId: "future", validFrom: new Date("2027-01-01") }),
        candidate({ priceListId: "bulk", minQuantity: 100 }),
      ],
    });
    expect(winner).toBeNull();
    expect(rejected).toEqual([
      { priceListId: "off", reason: "INACTIVE" },
      { priceListId: "eur", reason: "CURRENCY_MISMATCH" },
      { priceListId: "future", reason: "WINDOW_NOT_VALID" },
      { priceListId: "bulk", reason: "QUANTITY_BELOW_MIN" },
    ]);
  });

  it("resolves deterministically for identical inputs", () => {
    const make = () =>
      resolveUnitPrice({
        currency: "USD",
        quantity: 5,
        at,
        candidates: [candidate(), candidate({ priceListId: "a-2", priority: 3 })],
      });
    expect(make().winner?.priceListId).toBe("a-2");
    expect(make()).toEqual(make());
  });
});

describe("quote builder (roadmap §7.2)", () => {
  it("produces a complete breakdown", () => {
    const quote = buildQuote({
      unitPrice: money("USD", 1999),
      quantity: 3,
      promotions: [rule({ percentageBps: 1000 })],
    });
    expect(quote.subtotal.minor).toBe(5997n);
    expect(quote.discounts[0]?.amount.minor).toBe(600n);
    expect(quote.total.minor).toBe(5397n);
    expect(quote.currency).toBe("USD");
  });

  it("rejects invalid quantities", () => {
    expect(() =>
      buildQuote({ unitPrice: money("USD", 100), quantity: 0 }),
    ).toThrow(expect.objectContaining({ code: "QUOTE_INVALID" }));
  });
});
