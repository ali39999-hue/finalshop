import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type TenantContext,
  assertCategoryDepth,
  buildAuditEvent,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";
import { SLUG_REGEX } from "./create-organization";

export const CreateCategoryInput = z.object({
  orgId: z.string().min(1),
  parentId: z.string().min(1).optional(),
  name: z.string().min(1).max(200),
  slug: z.string().regex(SLUG_REGEX),
});

export type CreateCategoryInput = z.input<typeof CreateCategoryInput>;

export async function createCategory(
  repos: Repositories,
  ctx: TenantContext,
  input: CreateCategoryInput,
) {
  const parsed = CreateCategoryInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "category.create");
  const actor = requireUserId(ctx);

  const duplicate = await repos.categories.findBySlug(parsed.orgId, parsed.slug);
  if (duplicate) {
    throw new DomainError(
      "CATEGORY_SLUG_TAKEN",
      `category slug ${parsed.slug} already exists in this organization`,
    );
  }
  if (parsed.parentId !== undefined) {
    const parent = await repos.categories.findById(parsed.parentId);
    if (!parent || parent.orgId !== parsed.orgId) {
      // No existence leak across tenants (threat T-01 discipline).
      throw new DomainError(
        "CATEGORY_NOT_FOUND",
        `category ${parsed.parentId} not found`,
      );
    }
    // A new node cannot create a cycle (it has no children yet), but depth is
    // enforced already at creation. parentChain includes the parent itself,
    // and that length equals the number of ancestors above the new node.
    const ancestors = await repos.categories.parentChain(parsed.orgId, parent.id);
    assertCategoryDepth(ancestors.length);
  }
  const category = await repos.categories.create(parsed);
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "category.created",
      subjectType: AUDIT_SUBJECTS.CATEGORY,
      subjectId: category.id,
      after: { name: category.name, slug: category.slug, parentId: category.parentId },
    }),
  );
  return category;
}
