import type { ReservationStatus } from "@finalshop/domain";

export type { ReservationStatus };

/**
 * Inventory ports (W3, INV-001..003). Reservations are created and mutated
 * ONLY through the atomic operations on InventoryItemRepository — the
 * onHand/reserved columns are never edited independently.
 */

export interface InventoryItemRecord {
  id: string;
  orgId: string;
  variantId: string;
  locationId: string | null;
  onHand: number;
  reserved: number;
  updatedAt: Date;
}

export interface ReservationRecord {
  id: string;
  orgId: string;
  itemId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: Date;
  createdAt: Date;
  releasedAt: Date | null;
  committedAt: Date | null;
}

export interface InventoryItemRepository {
  create(input: {
    orgId: string;
    variantId: string;
    locationId?: string | undefined;
    onHand: number;
  }): Promise<InventoryItemRecord>;
  findById(id: string): Promise<InventoryItemRecord | null>;
  findByVariant(orgId: string, variantId: string): Promise<InventoryItemRecord[]>;
  /**
   * Atomic: onHand += delta, rejected when the result would go negative.
   * The database row is the concurrency point (single conditional UPDATE).
   */
  adjustOnHand(input: {
    id: string;
    orgId: string;
    delta: number;
  }): Promise<InventoryItemRecord>;
  /**
   * Atomic reservation (INV-003): a single conditional UPDATE bumps
   * `reserved` only when reserved + quantity ≤ onHand; zero affected rows
   * means insufficient stock. Creates the ACTIVE reservation in the same
   * transaction.
   */
  reserveAtomic(input: {
    orgId: string;
    itemId: string;
    quantity: number;
    expiresAt: Date;
  }): Promise<{ item: InventoryItemRecord; reservation: ReservationRecord }>;
  /**
   * Atomic release/commit path: reserved −= quantity (commit also reduces
   * onHand). Rejected when reserved < quantity.
   */
  takeReserved(
    itemId: string,
    orgId: string,
    quantity: number,
    mode: "RELEASE" | "COMMIT",
  ): Promise<InventoryItemRecord>;
}

export interface ReservationRepository {
  findById(id: string): Promise<ReservationRecord | null>;
  markStatus(input: {
    id: string;
    orgId: string;
    status: ReservationStatus;
    releasedAt?: Date;
    committedAt?: Date;
  }): Promise<ReservationRecord>;
  /** ACTIVE reservations whose TTL has passed. */
  listExpired(orgId: string | null, at: Date, limit?: number): Promise<ReservationRecord[]>;
}
