import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type ProductStatus,
  type TenantContext,
  buildAuditEvent,
  canTransitionProductStatus,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const TransitionProductStatusInput = z.object({
  orgId: z.string().min(1),
  productId: z.string().min(1),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
});

export type TransitionProductStatusInput = z.input<
  typeof TransitionProductStatusInput
>;

export async function transitionProductStatus(
  repos: Repositories,
  ctx: TenantContext,
  input: TransitionProductStatusInput,
) {
  const parsed = TransitionProductStatusInput.parse(input);
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
  const to = parsed.status as ProductStatus;
  if (!canTransitionProductStatus(product.status, to)) {
    throw new DomainError(
      "PRODUCT_TRANSITION_INVALID",
      `cannot transition ${product.status} → ${to}`,
    );
  }
  const updated = await repos.products.updateStatus({
    id: product.id,
    orgId: parsed.orgId,
    status: to,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "product.status_changed",
      subjectType: AUDIT_SUBJECTS.PRODUCT,
      subjectId: product.id,
      before: { status: product.status },
      after: { status: to },
    }),
  );
  return updated;
}
