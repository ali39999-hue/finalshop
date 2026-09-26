import { z } from "zod";
import type { ProductRecord } from "../catalog-ports";
import type { TenantContext } from "@finalshop/domain";
import { requirePermission, requireSameTenant } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const ListProductsInput = z.object({
  orgId: z.string().min(1),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export type ListProductsInput = z.input<typeof ListProductsInput>;

export async function listProducts(
  repos: Repositories,
  ctx: TenantContext,
  input: ListProductsInput,
): Promise<ProductRecord[]> {
  const parsed = ListProductsInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "product.read");
  return repos.products.listByOrg(parsed.orgId, parsed.limit, parsed.offset);
}
