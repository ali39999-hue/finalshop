import type { Repositories } from "../ports";

export interface ReleaseExpiredResult {
  released: number;
}

/**
 * Worker command (no tenant context): releases every ACTIVE reservation
 * whose TTL has passed, org-wide or across the platform. The conditional
 * `takeReserved` keeps this safe against racing commits. Wired to the worker
 * scheduler in W4 together with the outbox.
 */
export async function releaseExpiredReservations(
  repos: Repositories,
  input: { orgId?: string; limit?: number; at?: Date },
): Promise<ReleaseExpiredResult> {
  const at = input.at ?? new Date();
  const expired = await repos.reservations.listExpired(
    input.orgId ?? null,
    at,
    input.limit ?? 500,
  );
  let released = 0;
  for (const reservation of expired) {
    try {
      await repos.inventoryItems.takeReserved(
        reservation.itemId,
        reservation.orgId,
        reservation.quantity,
        "RELEASE",
      );
      await repos.reservations.markStatus({
        id: reservation.id,
        orgId: reservation.orgId,
        status: "EXPIRED",
        releasedAt: at,
      });
      released += 1;
    } catch {
      // A racing commit/release won the row; the next sweep reconciles.
      continue;
    }
  }
  return { released };
}
