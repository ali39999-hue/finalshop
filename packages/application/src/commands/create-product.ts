import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type TenantContext,
  assertValidProductOptions,
  buildAuditEvent,
  type ProductOption,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";
import { SLUG_REGEX } from "./create-organization";

export const CreateProductInput = z.object({
  orgId: z.string().min(1),
  title: z.string().min(1).max(300),
  slug: z.string().regex(SLUG_REGEX),
  description: z.string().max(50_000).optional(),
  options: z
    .array(z.object({ name: z.string().min(1).max(100), values: z.array(z.string().min(1).max(100)).max(200) }))
    .max(3)
    .default([]),
});

export type CreateProductInput = z.input<typeof CreateProductInput>;

export async function createProduct(
  repos: Repositories,
  ctx: TenantContext,
  input: CreateProductInput,
) {
  const parsed = CreateProductInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "product.create");
  const actor = requireUserId(ctx);
  const duplicate = await repos.products.findBySlug(parsed.orgId, parsed.slug);
  if (duplicate) {
    throw new DomainError(
      "PRODUCT_SLUG_TAKEN",
      `product slug ${parsed.slug} already exists in this organization`,
    );
  }
  const options: ProductOption[] = assertValidProductOptions(parsed.options);
  const product = await repos.products.create({
    orgId: parsed.orgId,
    slug: parsed.slug,
    title: parsed.title,
    description: parsed.description,
    options,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "product.created",
      subjectType: AUDIT_SUBJECTS.PRODUCT,
      subjectId: product.id,
      after: { title: product.title, slug: product.slug, options },
    }),
  );
  return product;
}
