import { DomainError } from "../errors";
import { money, moneyAllocate } from "../money/money";

/**
 * Order aggregate (ORD-001/002). Lines are immutable snapshots of what was
 * actually purchased (sku/title/price captured at placement) — later catalog
 * edits never rewrite history. Totals are always recomputed server-side from
 * the lines; client-supplied totals are never trusted.
 */

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "FULFILLING"
  | "PARTIALLY_FULFILLED"
  | "COMPLETED"
  | "CANCELLED";
// W5 keeps refunds independent of the order status; cancellation after
// fulfilment starts is replaced by the returns/RMA flow (W6).

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CANCELLED", "FULFILLING"],
  // Delivered lines advance the stage; returns handle post-shipment money.
  FULFILLING: ["PARTIALLY_FULFILLED", "COMPLETED"],
  PARTIALLY_FULFILLED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new DomainError(
      "ORDER_TRANSITION_INVALID",
      `cannot transition order ${from} → ${to}`,
    );
  }
}

/** Human-readable, org-scoped sequence: SO-00000001. */
export function formatOrderNumber(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new DomainError("ORDER_NUMBER_INVALID", String(sequence));
  }
  return `SO-${String(sequence).padStart(8, "0")}`;
}

export interface OrderLineInput {
  variantId: string;
  sku: string;
  title: string;
  quantity: number;
  unitPriceMinor: bigint;
}

export interface OrderLineSnapshot extends OrderLineInput {
  lineTotalMinor: bigint;
  lineDiscountMinor: bigint;
}

/**
 * Builds immutable order lines from the quoted snapshot and distributes the
 * cart-level discount across lines proportionally (largest-remainder, no
 * lost cents). Discount is clamped to the subtotal defensively.
 */
export function buildOrderLines(
  lines: OrderLineInput[],
  currency: string,
  totalDiscountMinor: bigint,
): OrderLineSnapshot[] {
  if (lines.length === 0) {
    throw new DomainError("ORDER_INVALID", "an order needs at least one line");
  }
  const withTotals = lines.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new DomainError("ORDER_INVALID", `invalid quantity on ${line.sku}`);
    }
    if (line.unitPriceMinor < 0n) {
      throw new DomainError("ORDER_INVALID", `negative unit price on ${line.sku}`);
    }
    return {
      ...line,
      lineTotalMinor: line.unitPriceMinor * BigInt(line.quantity),
      lineDiscountMinor: 0n,
    };
  });
  const subtotal = withTotals.reduce((sum, l) => sum + l.lineTotalMinor, 0n);
  if (totalDiscountMinor < 0n || totalDiscountMinor > subtotal) {
    throw new DomainError(
      "ORDER_INVALID",
      `discount ${totalDiscountMinor} out of range for subtotal ${subtotal}`,
    );
  }
  if (totalDiscountMinor === 0n) return withTotals;

  const allocations = moneyAllocate(
    money(currency, totalDiscountMinor),
    withTotals.map((l) => Number(l.lineTotalMinor)),
  );
  return withTotals.map((line, i) => ({
    ...line,
    lineDiscountMinor: allocations[i]!.minor,
  }));
}

export interface OrderTotals {
  subtotalMinor: bigint;
  discountMinor: bigint;
  totalMinor: bigint;
}

/** Server-authoritative totals recomputed from the lines. */
export function computeOrderTotals(lines: OrderLineSnapshot[]): OrderTotals {
  const subtotalMinor = lines.reduce((sum, l) => sum + l.lineTotalMinor, 0n);
  const discountMinor = lines.reduce((sum, l) => sum + l.lineDiscountMinor, 0n);
  const totalMinor = subtotalMinor - discountMinor;
  if (totalMinor < 0n) {
    throw new DomainError("ORDER_INVALID", "order total must not be negative");
  }
  return { subtotalMinor, discountMinor, totalMinor };
}
