import { DomainError, type TenantContext } from "@finalshop/domain";
import { requirePermission, requireSameTenant } from "@finalshop/auth";
import type { ProductRecord, VariantRecord } from "../catalog-ports";
import type { Repositories } from "../ports";
import { z } from "zod";

export const GetProductInput = z.object({
  orgId: z.string().min(1),
  productId: z.string().min(1),
});

export type GetProductInput = z.infer<typeof GetProductInput>;

export async function getProduct(
  repos: Repositories,
  ctx: TenantContext,
  input: GetProductInput,
): Promise<{ product: ProductRecord; variants: VariantRecord[] }> {
  const parsed = GetProductInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "product.read");
  const product = await repos.products.findById(parsed.productId);
  if (!product || product.orgId !== parsed.orgId) {
    throw new DomainError("PRODUCT_NOT_FOUND", `product ${parsed.productId} not found`);
  }
  const variants = await repos.variants.listByProduct(parsed.orgId, product.id);
  return { product, variants };
}
