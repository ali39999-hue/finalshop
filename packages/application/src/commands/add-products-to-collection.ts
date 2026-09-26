import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type TenantContext,
  buildAuditEvent,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const AddProductsToCollectionInput = z.object({
  orgId: z.string().min(1),
  collectionId: z.string().min(1),
  productIds: z.array(z.string().min(1)).min(1).max(500),
});

export type AddProductsToCollectionInput = z.input<
  typeof AddProductsToCollectionInput
>;

export async function addProductsToCollection(
  repos: Repositories,
  ctx: TenantContext,
  input: AddProductsToCollectionInput,
) {
  const parsed = AddProductsToCollectionInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "collection.update");
  const actor = requireUserId(ctx);

  const collection = await repos.collections.findById(parsed.collectionId);
  if (!collection || collection.orgId !== parsed.orgId) {
    throw new DomainError(
      "COLLECTION_NOT_FOUND",
      `collection ${parsed.collectionId} not found`,
    );
  }
  const uniqueIds = [...new Set(parsed.productIds)];
  const found = await repos.products.listByIds(parsed.orgId, uniqueIds);
  const foundIds = new Set(found.map((p) => p.id));
  const missing = uniqueIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new DomainError(
      "PRODUCT_NOT_FOUND",
      `products not found in this organization: ${missing.join(", ")}`,
    );
  }
  await repos.collections.addProducts({
    orgId: parsed.orgId,
    collectionId: collection.id,
    productIds: uniqueIds,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "collection.products_added",
      subjectType: AUDIT_SUBJECTS.COLLECTION,
      subjectId: collection.id,
      after: { count: uniqueIds.length },
    }),
  );
  return { added: uniqueIds.length };
}
