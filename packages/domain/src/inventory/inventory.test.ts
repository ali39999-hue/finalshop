import { describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import {
  availableOf,
  canReserve,
  isExpired,
  reservationExpiry,
  assertStockInvariants,
  type StockLevels,
} from "./inventory";

describe("inventory invariants (INV-001/002)", () => {
  it("computes availability and validates stock levels", () => {
    const stock: StockLevels = { onHand: 10, reserved: 3 };
    expect(availableOf(stock)).toBe(7);
    expect(() =>
      assertStockInvariants({ onHand: 5, reserved: 6 }),
    ).toThrow(DomainError);
    expect(() => assertStockInvariants({ onHand: -1, reserved: 0 })).toThrow(
      DomainError,
    );
    expect(() => assertStockInvariants({ onHand: 5.5, reserved: 0 })).toThrow(
      DomainError,
    );
  });

  it("gates reservations on availability", () => {
    expect(canReserve({ onHand: 10, reserved: 8 }, 2)).toBe(true);
    expect(canReserve({ onHand: 10, reserved: 8 }, 3)).toBe(false);
    expect(() => canReserve({ onHand: 10, reserved: 0 }, 0)).toThrow(DomainError);
    expect(() => canReserve({ onHand: 10, reserved: 0 }, 2.5)).toThrow(DomainError);
  });

  it("bounds reservation TTLs and computes expiry", () => {
    const from = new Date("2026-09-26T12:00:00Z");
    expect(reservationExpiry(from, 900).toISOString()).toBe(
      "2026-09-26T12:15:00.000Z",
    );
    expect(() => reservationExpiry(from, 10)).toThrow(DomainError);
    expect(() => reservationExpiry(from, 7200)).toThrow(DomainError);
  });

  it("marks only ACTIVE reservations past their expiry", () => {
    const now = new Date("2026-09-26T12:00:00Z");
    expect(
      isExpired({ status: "ACTIVE", expiresAt: new Date("2026-09-26T11:59:59Z") }, now),
    ).toBe(true);
    expect(
      isExpired({ status: "ACTIVE", expiresAt: new Date("2026-09-26T12:00:00Z") }, now),
    ).toBe(true);
    expect(
      isExpired({ status: "ACTIVE", expiresAt: new Date("2026-09-26T12:00:01Z") }, now),
    ).toBe(false);
    expect(
      isExpired({ status: "COMMITTED", expiresAt: new Date("2026-09-26T11:00:00Z") }, now),
    ).toBe(false);
  });
});
