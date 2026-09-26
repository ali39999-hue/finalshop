import { DomainError } from "../errors";

/**
 * Cart aggregate (CART-001): pure state transitions. Pricing never lives in
 * the cart — lines carry variantId + quantity only; money joins at the
 * PRICED stage (CART-002).
 */

export type CartStatus = "OPEN" | "CONVERTED" | "EXPIRED" | "CANCELLED";

export const MAX_CART_LINES = 100;
export const MAX_LINE_QUANTITY = 999;
export const CART_TTL_DAYS = 7;

export interface CartLine {
  variantId: string;
  quantity: number;
}

export interface CartState {
  status: CartStatus;
  lines: CartLine[];
  expiresAt: Date;
}

function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    throw new DomainError(
      "CART_ITEM_INVALID",
      `quantity must be an integer between 1 and ${MAX_LINE_QUANTITY}`,
    );
  }
}

export function isCartExpired(cart: CartState, at: Date): boolean {
  return cart.status === "OPEN" && cart.expiresAt.getTime() <= at.getTime();
}

/** Any mutation requires an OPEN, unexpired cart. */
export function assertCartOpen(cart: CartState, at: Date): void {
  if (cart.status !== "OPEN") {
    throw new DomainError("CART_NOT_OPEN", `cart is ${cart.status}`);
  }
  if (isCartExpired(cart, at)) {
    throw new DomainError("CART_NOT_OPEN", "cart has expired");
  }
}

/** Adding a variant that is already in the cart merges into that line. */
export function addLine(lines: CartLine[], variantId: string, quantity: number): CartLine[] {
  assertQuantity(quantity);
  const existing = lines.find((l) => l.variantId === variantId);
  if (existing) {
    const merged = existing.quantity + quantity;
    if (merged > MAX_LINE_QUANTITY) {
      throw new DomainError(
        "CART_ITEM_INVALID",
        `merged quantity ${merged} exceeds ${MAX_LINE_QUANTITY}`,
      );
    }
    return lines.map((l) =>
      l.variantId === variantId ? { ...l, quantity: merged } : l,
    );
  }
  if (lines.length >= MAX_CART_LINES) {
    throw new DomainError("CART_LIMIT_EXCEEDED", `at most ${MAX_CART_LINES} lines`);
  }
  return [...lines, { variantId, quantity }];
}

export function setLineQuantity(
  lines: CartLine[],
  variantId: string,
  quantity: number,
): CartLine[] {
  assertQuantity(quantity);
  if (!lines.some((l) => l.variantId === variantId)) {
    throw new DomainError("CART_ITEM_NOT_FOUND", `line ${variantId} not in cart`);
  }
  return lines.map((l) => (l.variantId === variantId ? { ...l, quantity } : l));
}

export function removeLine(lines: CartLine[], variantId: string): CartLine[] {
  if (!lines.some((l) => l.variantId === variantId)) {
    throw new DomainError("CART_ITEM_NOT_FOUND", `line ${variantId} not in cart`);
  }
  return lines.filter((l) => l.variantId !== variantId);
}
