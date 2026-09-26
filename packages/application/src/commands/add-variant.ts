import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type TenantContext,
  assertValidSku,
  assertValidWeightGrams,
  assertVariantMatchesOptions,
  buildAuditEvent,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const AddVariantInput = z.object({
  orgId: z.string().min(1),
  productId: z.string().min(1),
  sku: z.string().min(1).max(64),
  barcode: z.string().min(1).max(64).optional(),
  optionValues: z.record(z.string(), z.string()).default({}),
  weightGrams: z.number().int().optional(),
});

export type AddVariantInput = z.input<typeof AddVariantInput>;

export async function addVariant(
  repos: Repositories,
  ctx: TenantContext,
  input: AddVariantInput,
) {
  const parsed = AddVariantInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "product.update");
  const actor = requireUserId(ctx);

  const product = await repos.products.findById(parsed.productId);
  if (!product || product.orgId !== parsed.orgId) {
    throw new DomainError(
      "PRODUCT_NOT_FOUND",
      `product ${parsed.productId} not found`,
    );
  }
  const sku = assertValidSku(parsed.sku);
  const skuDuplicate = await repos.variants.findBySku(parsed.orgId, sku);
  if (skuDuplicate) {
    throw new DomainError("SKU_TAKEN", `sku ${sku} already exists in this organization`);
  }
  const optionValues = assertVariantMatchesOptions(
    product.options,
    parsed.optionValues,
  );
  const weightGrams = assertValidWeightGrams(parsed.weightGrams);
  const variant = await repos.variants.create({
    orgId: parsed.orgId,
    productId: product.id,
    sku,
    barcode: parsed.barcode,
    optionValues,
    weightGrams,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "product.variant_added",
      subjectType: AUDIT_SUBJECTS.PRODUCT,
      subjectId: product.id,
      after: { variantId: variant.id, sku: variant.sku, optionValues },
    }),
  );
  return variant;
}
