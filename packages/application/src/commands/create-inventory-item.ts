import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type TenantContext,
  assertStockInvariants,
  buildAuditEvent,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const CreateInventoryItemInput = z.object({
  orgId: z.string().min(1),
  variantId: z.string().min(1),
  locationId: z.string().min(1).optional(),
  onHand: z.number().int().min(0).default(0),
});

export type CreateInventoryItemInput = z.input<typeof CreateInventoryItemInput>;

export async function createInventoryItem(
  repos: Repositories,
  ctx: TenantContext,
  input: CreateInventoryItemInput,
) {
  const parsed = CreateInventoryItemInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "inventory.update");
  const actor = requireUserId(ctx);

  assertStockInvariants({ onHand: parsed.onHand, reserved: 0 });
  const variant = await repos.variants.findById(parsed.variantId);
  if (!variant || variant.orgId !== parsed.orgId) {
    throw new DomainError(
      "PRODUCT_NOT_FOUND",
      `variant ${parsed.variantId} not found`,
    );
  }
  const existing = await repos.inventoryItems.findByVariant(
    parsed.orgId,
    parsed.variantId,
  );
  const duplicate = existing.find(
    (item) => (item.locationId ?? null) === (parsed.locationId ?? null),
  );
  if (duplicate) {
    throw new DomainError(
      "INVENTORY_ITEM_EXISTS",
      `stock item for variant ${parsed.variantId} already exists at this location`,
    );
  }
  const item = await repos.inventoryItems.create({
    orgId: parsed.orgId,
    variantId: parsed.variantId,
    locationId: parsed.locationId,
    onHand: parsed.onHand,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "inventory.item_created",
      subjectType: AUDIT_SUBJECTS.INVENTORY_ITEM,
      subjectId: item.id,
      after: { variantId: item.variantId, locationId: item.locationId, onHand: item.onHand },
    }),
  );
  return item;
}
