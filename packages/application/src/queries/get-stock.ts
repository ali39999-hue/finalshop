import { z } from "zod";
import type { InventoryItemRecord } from "../inventory-ports";
import type { TenantContext } from "@finalshop/domain";
import { requirePermission, requireSameTenant } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const GetStockInput = z.object({
  orgId: z.string().min(1),
  variantId: z.string().min(1),
});

export type GetStockInput = z.infer<typeof GetStockInput>;

export interface StockView {
  item: InventoryItemRecord;
  available: number;
}

export async function getStock(
  repos: Repositories,
  ctx: TenantContext,
  input: GetStockInput,
): Promise<StockView[]> {
  const parsed = GetStockInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "inventory.read");
  const items = await repos.inventoryItems.findByVariant(parsed.orgId, parsed.variantId);
  return items.map((item) => ({
    item,
    available: item.onHand - item.reserved,
  }));
}
