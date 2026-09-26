import { describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import { isSupportedCurrency } from "./currency";
import {
  money,
  moneyAdd,
  moneyAllocate,
  moneyCompare,
  moneyFromMajor,
  moneyIsZero,
  moneyMin,
  moneyMultiply,
  moneyPercentBps,
  moneySubtract,
} from "./money";

describe("money kernel (PRICE-001)", () => {
  it("constructs from minor units and major strings without float drift", () => {
    expect(money("USD", 9999).minor).toBe(9999n);
    expect(moneyFromMajor("USD", "99.99").minor).toBe(9999n);
    expect(moneyFromMajor("USD", "0.01").minor).toBe(1n);
    expect(moneyFromMajor("JPY", "1500").minor).toBe(1500n);
    expect(moneyFromMajor("BHD", "1.234").minor).toBe(1234n);
    expect(isSupportedCurrency("usd")).toBe(true);
    expect(isSupportedCurrency("XXX")).toBe(false);
  });

  it("rejects malformed amounts and extra decimals", () => {
    expect(() => money("USD", 1.5)).toThrow(DomainError);
    expect(() => money("USD", "12.3abc")).toThrow(DomainError);
    expect(() => moneyFromMajor("USD", "0.999")).toThrow(DomainError);
    expect(() => money("XXX", 1)).toThrow();
  });

  it("enforces currency compatibility on every operation", () => {
    expect(() => moneyAdd(money("USD", 1), money("EUR", 1))).toThrow(
      expect.objectContaining({ code: "CURRENCY_MISMATCH" }),
    );
    expect(() => moneyCompare(money("USD", 1), money("JPY", 1))).toThrow(
      expect.objectContaining({ code: "CURRENCY_MISMATCH" }),
    );
  });

  it("adds, subtracts, and multiplies by integer quantities", () => {
    const a = money("USD", 1050);
    expect(moneyAdd(a, money("USD", 450)).minor).toBe(1500n);
    expect(moneySubtract(a, money("USD", 1050)).minor).toBe(0n);
    expect(moneyMultiply(money("USD", 999), 3).minor).toBe(2997n);
    expect(() => moneyMultiply(a, 1.5)).toThrow(DomainError);
    expect(moneyIsZero(moneySubtract(a, money("USD", 1050)))).toBe(true);
  });

  it("rounds percentages HALF_UP on minor units", () => {
    // 10% of 99.99 → 999.9 → 1000 (HALF_UP), never 999 (banker's/floor drift)
    expect(moneyPercentBps(money("USD", 9999), 1000).minor).toBe(1000n);
    // 5% of 10.00 → 50
    expect(moneyPercentBps(money("USD", 1000), 500).minor).toBe(50n);
    // 33.33% of 100.00 → 3333
    expect(moneyPercentBps(money("USD", 10000), 3333).minor).toBe(3333n);
    // The kernel only requires a non-negative integer; the 1..10000 bound is
    // the promotion layer's concern (see pricing tests).
    expect(moneyPercentBps(money("USD", 100), 20000).minor).toBe(200n);
  });

  it("allocates without losing or inventing minor units", () => {
    // The classic 10.00 / 3 split → 3.33 + 3.33 + 3.34
    const parts = moneyAllocate(money("USD", 1000), [1, 1, 1]);
    expect(parts.map((p) => p.minor)).toEqual([334n, 333n, 333n]);
    const sum = parts.reduce((acc, p) => moneyAdd(acc, p), money("USD", 0));
    expect(sum.minor).toBe(1000n);
    // Zero-weight parts get zero but stay valid
    const weighted = moneyAllocate(money("USD", 500), [0, 3, 1]);
    expect(weighted.map((p) => p.minor)).toEqual([0n, 375n, 125n]);
    expect(() => moneyAllocate(money("USD", 100), [])).toThrow(DomainError);
    expect(() => moneyAllocate(money("USD", 100), [0, 0])).toThrow(DomainError);
  });

  it("compares and clamps", () => {
    expect(moneyMin(money("USD", 5), money("USD", 3)).minor).toBe(3n);
    expect(moneyCompare(money("USD", 5), money("USD", 5))).toBe(0);
    expect(moneyMin(money("USD", 5), money("USD", 3)).minor).toBe(3n);
  });
});
