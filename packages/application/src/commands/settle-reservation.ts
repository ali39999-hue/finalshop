import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  isExpired,
  type TenantContext,
  buildAuditEvent,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const SettleReservationInput = z.object({
  orgId: z.string().min(1),
  reservationId: z.string().min(1),
});

export type SettleReservationInput = z.input<typeof SettleReservationInput>;

/**
 * RELEASE: the reservation is cancelled and stock returns to available.
 * COMMIT: checkout accepted — stock leaves onHand (INV-002 lifecycle).
 * Expired reservations can only be released, never committed.
 */
export async function releaseReservation(
  repos: Repositories,
  ctx: TenantContext,
  input: SettleReservationInput,
) {
  const parsed = SettleReservationInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "inventory.update");
  const actor = requireUserId(ctx);
  const reservation = await repos.reservations.findById(parsed.reservationId);
  if (!reservation || reservation.orgId !== parsed.orgId) {
    throw new DomainError(
      "RESERVATION_NOT_FOUND",
      `reservation ${parsed.reservationId} not found`,
    );
  }
  if (reservation.status !== "ACTIVE") {
    throw new DomainError(
      "RESERVATION_CONFLICT",
      `reservation is ${reservation.status}`,
    );
  }
  const item = await repos.inventoryItems.takeReserved(
    reservation.itemId,
    parsed.orgId,
    reservation.quantity,
    "RELEASE",
  );
  const updated = await repos.reservations.markStatus({
    id: reservation.id,
    orgId: parsed.orgId,
    status: "RELEASED",
    releasedAt: new Date(),
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "inventory.released",
      subjectType: AUDIT_SUBJECTS.RESERVATION,
      subjectId: reservation.id,
      after: { quantity: reservation.quantity, reserved: item.reserved },
    }),
  );
  return { item, reservation: updated };
}

export async function commitReservation(
  repos: Repositories,
  ctx: TenantContext,
  input: SettleReservationInput,
) {
  const parsed = SettleReservationInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "inventory.update");
  const actor = requireUserId(ctx);
  const reservation = await repos.reservations.findById(parsed.reservationId);
  if (!reservation || reservation.orgId !== parsed.orgId) {
    throw new DomainError(
      "RESERVATION_NOT_FOUND",
      `reservation ${parsed.reservationId} not found`,
    );
  }
  if (reservation.status !== "ACTIVE") {
    throw new DomainError(
      "RESERVATION_CONFLICT",
      `reservation is ${reservation.status}`,
    );
  }
  if (isExpired(reservation, new Date())) {
    throw new DomainError(
      "RESERVATION_CONFLICT",
      "reservation has expired; release it instead",
    );
  }
  const item = await repos.inventoryItems.takeReserved(
    reservation.itemId,
    parsed.orgId,
    reservation.quantity,
    "COMMIT",
  );
  const updated = await repos.reservations.markStatus({
    id: reservation.id,
    orgId: parsed.orgId,
    status: "COMMITTED",
    committedAt: new Date(),
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "inventory.committed",
      subjectType: AUDIT_SUBJECTS.RESERVATION,
      subjectId: reservation.id,
      after: { quantity: reservation.quantity, onHand: item.onHand },
    }),
  );
  return { item, reservation: updated };
}
