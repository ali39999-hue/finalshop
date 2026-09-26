import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type TenantContext,
  buildAuditEvent,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";
import { SLUG_REGEX } from "./create-organization";

export const CreateCollectionInput = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1).max(200),
  slug: z.string().regex(SLUG_REGEX),
});

export type CreateCollectionInput = z.input<typeof CreateCollectionInput>;

export async function createCollection(
  repos: Repositories,
  ctx: TenantContext,
  input: CreateCollectionInput,
) {
  const parsed = CreateCollectionInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "collection.create");
  const actor = requireUserId(ctx);
  const duplicate = await repos.collections.findBySlug(parsed.orgId, parsed.slug);
  if (duplicate) {
    throw new DomainError(
      "COLLECTION_SLUG_TAKEN",
      `collection slug ${parsed.slug} already exists in this organization`,
    );
  }
  const collection = await repos.collections.create({
    orgId: parsed.orgId,
    slug: parsed.slug,
    name: parsed.name,
    kind: "MANUAL",
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "collection.created",
      subjectType: AUDIT_SUBJECTS.COLLECTION,
      subjectId: collection.id,
      after: { name: collection.name, slug: collection.slug },
    }),
  );
  return collection;
}
