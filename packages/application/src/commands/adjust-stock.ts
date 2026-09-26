import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  type TenantContext,
  buildAuditEvent,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const AdjustStockInput = z.object({
  orgId: z.string().min(1),
  itemId: z.string().min(1),
  /** Positive = receive, negative = shrink/cycle-count correction. */
  delta: z.number().int().refine((d) => d !== 0, "delta must be non-zero"),
  reason: z.string().min(1).max(200),
});

export type AdjustStockInput = z.input<typeof AdjustStockInput>;

export async function adjustStock(
  repos: Repositories,
  ctx: TenantContext,
  input: AdjustStockInput,
) {
  const parsed = AdjustStockInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "inventory.update");
  const actor = requireUserId(ctx);
  const item = await repos.inventoryItems.adjustOnHand({
    id: parsed.itemId,
    orgId: parsed.orgId,
    delta: parsed.delta,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "inventory.stock_adjusted",
      subjectType: AUDIT_SUBJECTS.INVENTORY_ITEM,
      subjectId: item.id,
      after: { delta: parsed.delta, onHand: item.onHand, reason: parsed.reason },
    }),
  );
  return item;
}
