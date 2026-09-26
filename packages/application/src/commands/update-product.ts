import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type TenantContext,
  buildAuditEvent,
  nextRevisionNumber,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { ProductRecord } from "../catalog-ports";
import type { Repositories } from "../ports";

export const UpdateProductInput = z.object({
  orgId: z.string().min(1),
  productId: z.string().min(1),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(50_000).optional(),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(400).optional(),
});

export type UpdateProductInput = z.input<typeof UpdateProductInput>;

/** Content changes are revisioned: every update writes an immutable snapshot (CAT-004). */
export async function updateProduct(
  repos: Repositories,
  ctx: TenantContext,
  input: UpdateProductInput,
) {
  const parsed = UpdateProductInput.parse(input);
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
  const updated = await repos.products.updateContent({
    id: product.id,
    orgId: parsed.orgId,
    title: parsed.title,
    description: parsed.description,
    seoTitle: parsed.seoTitle,
    seoDescription: parsed.seoDescription,
  });
  const revisionNumber = nextRevisionNumber(
    await repos.revisions.latestNumber(parsed.orgId, product.id),
  );
  const revision = await repos.revisions.create({
    orgId: parsed.orgId,
    productId: product.id,
    revisionNumber,
    snapshot: buildSnapshot(updated),
    authorId: actor,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "product.updated",
      subjectType: AUDIT_SUBJECTS.PRODUCT,
      subjectId: product.id,
      after: { revisionNumber },
    }),
  );
  return { product: updated, revision };
}

export function buildSnapshot(product: ProductRecord): Record<string, unknown> {
  return {
    title: product.title,
    slug: product.slug,
    description: product.description,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    status: product.status,
    options: product.options,
  };
}
