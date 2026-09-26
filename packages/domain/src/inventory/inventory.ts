import { DomainError } from "../errors";

/**
 * Inventory invariants (INV-001/002, roadmap §7.3):
 * available = onHand − reserved, quantities are non-negative integers, and
 * reservations carry a TTL after which the worker releases them.
 */

export type ReservationStatus = "ACTIVE" | "COMMITTED" | "RELEASED" | "EXPIRED";

export const RESERVATION_TTL_SECONDS = {
  MIN: 60,
  MAX: 3600,
} as const;

export interface StockLevels {
  onHand: number;
  reserved: number;
}

export function availableOf(stock: StockLevels): number {
  assertStockInvariants(stock);
  return stock.onHand - stock.reserved;
}

export function assertStockInvariants(stock: StockLevels): void {
  const { onHand, reserved } = stock;
  if (!Number.isInteger(onHand) || onHand < 0) {
    throw new DomainError("STOCK_LEVEL_INVALID", `onHand ${onHand}`);
  }
  if (!Number.isInteger(reserved) || reserved < 0) {
    throw new DomainError("STOCK_LEVEL_INVALID", `reserved ${reserved}`);
  }
  if (reserved > onHand) {
    throw new DomainError(
      "STOCK_LEVEL_INVALID",
      `reserved ${reserved} exceeds onHand ${onHand}`,
    );
  }
}

export function assertReservableQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new DomainError("RESERVATION_INVALID", `quantity ${quantity}`);
  }
}

/** Fast pre-check before the atomic database operation (INV-003). */
export function canReserve(stock: StockLevels, quantity: number): boolean {
  assertStockInvariants(stock);
  assertReservableQuantity(quantity);
  return availableOf(stock) >= quantity;
}

export function reservationExpiry(from: Date, ttlSeconds: number): Date {
  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < RESERVATION_TTL_SECONDS.MIN ||
    ttlSeconds > RESERVATION_TTL_SECONDS.MAX
  ) {
    throw new DomainError(
      "RESERVATION_INVALID",
      `ttl must be ${RESERVATION_TTL_SECONDS.MIN}–${RESERVATION_TTL_SECONDS.MAX}s`,
    );
  }
  return new Date(from.getTime() + ttlSeconds * 1000);
}

export function isExpired(
  reservation: { status: ReservationStatus; expiresAt: Date },
  at: Date,
): boolean {
  return reservation.status === "ACTIVE" && reservation.expiresAt.getTime() <= at.getTime();
}
