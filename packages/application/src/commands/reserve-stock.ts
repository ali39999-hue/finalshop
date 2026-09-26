import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  RESERVATION_TTL_SECONDS,
  type TenantContext,
  buildAuditEvent,
  reservationExpiry,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const ReserveStockInput = z.object({
  orgId: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number().int().min(1).max(100_000),
  ttlSeconds: z
    .number()
    .int()
    .min(RESERVATION_TTL_SECONDS.MIN)
    .max(RESERVATION_TTL_SECONDS.MAX)
    .default(900),
});

export type ReserveStockInput = z.input<typeof ReserveStockInput>;

/**
 * INV-003: the reservation happens through a single conditional UPDATE on
 * the stock row (see InventoryItemRepository.reserveAtomic) — concurrent
 * checkouts cannot oversell; the loser gets INSUFFICIENT_STOCK.
 */
export async function reserveStock(
  repos: Repositories,
  ctx: TenantContext,
  input: ReserveStockInput,
) {
  const parsed = ReserveStockInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "inventory.update");
  const actor = requireUserId(ctx);

  const expiresAt = reservationExpiry(new Date(), parsed.ttlSeconds);
  const { item, reservation } = await repos.inventoryItems.reserveAtomic({
    orgId: parsed.orgId,
    itemId: parsed.itemId,
    quantity: parsed.quantity,
    expiresAt,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "inventory.reserved",
      subjectType: AUDIT_SUBJECTS.RESERVATION,
      subjectId: reservation.id,
      after: {
        itemId: item.id,
        quantity: reservation.quantity,
        reserved: item.reserved,
        expiresAt: expiresAt.toISOString(),
      },
    }),
  );
  return { item, reservation };
}
