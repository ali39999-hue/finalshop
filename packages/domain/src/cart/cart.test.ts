import { describe, expect, it } from "vitest";
import {
  addLine,
  assertCartOpen,
  isCartExpired,
  removeLine,
  setLineQuantity,
  type CartState,
} from "./cart";

const openCart = (overrides?: Partial<CartState>): CartState => ({
  status: "OPEN",
  lines: [],
  expiresAt: new Date(Date.now() + 86_400_000),
  ...overrides,
});

describe("cart aggregate (CART-001)", () => {
  it("merges repeated variants into one line and caps quantity", () => {
    let lines = addLine([], "var-1", 2);
    lines = addLine(lines, "var-1", 3);
    lines = addLine(lines, "var-2", 1);
    expect(lines).toEqual([
      { variantId: "var-1", quantity: 5 },
      { variantId: "var-2", quantity: 1 },
    ]);
    expect(() => addLine(lines, "var-1", 999)).toThrow(
      expect.objectContaining({ code: "CART_ITEM_INVALID" }),
    );
  });

  it("updates and removes lines", () => {
    let lines = addLine([], "var-1", 2);
    lines = setLineQuantity(lines, "var-1", 4);
    expect(lines[0]?.quantity).toBe(4);
    lines = removeLine(lines, "var-1");
    expect(lines).toHaveLength(0);
    expect(() => setLineQuantity(lines, "var-1", 1)).toThrow(
      expect.objectContaining({ code: "CART_ITEM_NOT_FOUND" }),
    );
  });

  it("enforces the line count limit", () => {
    let lines = addLine([], "seed", 1);
    // Fill up to MAX_CART_LINES (seed + 99 = 100 lines).
    for (let i = 0; i < 99; i += 1) lines = addLine(lines, `var-${i}`, 1);
    expect(lines).toHaveLength(100);
    expect(() => addLine(lines, "var-new", 1)).toThrow(
      expect.objectContaining({ code: "CART_LIMIT_EXCEEDED" }),
    );
  });

  it("rejects mutations on closed or expired carts", () => {
    const cancelled = openCart({ status: "CANCELLED" });
    expect(() => assertCartOpen(cancelled, new Date())).toThrow(
      expect.objectContaining({ code: "CART_NOT_OPEN" }),
    );
    const expired = openCart({ expiresAt: new Date(Date.now() - 1000) });
    expect(isCartExpired(expired, new Date())).toBe(true);
    expect(() => assertCartOpen(expired, new Date())).toThrow(
      expect.objectContaining({ code: "CART_NOT_OPEN" }),
    );
    expect(() =>
      assertCartOpen(openCart(), new Date()),
    ).not.toThrow();
  });
});
