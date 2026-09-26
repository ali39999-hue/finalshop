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

export const CreateStoreInput = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1).max(200),
  slug: z.string().regex(SLUG_REGEX),
  locale: z.string().min(2).max(10).default("en"),
});

export type CreateStoreInput = z.input<typeof CreateStoreInput>;

/** Creates a store with its default storefront, scoped to the caller's tenant. */
export async function createStore(
  repos: Repositories,
  ctx: TenantContext,
  input: CreateStoreInput,
) {
  const parsed = CreateStoreInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "store.create");
  const actor = requireUserId(ctx);
  const duplicate = await repos.stores.findBySlug(parsed.orgId, parsed.slug);
  if (duplicate) {
    throw new DomainError(
      "STORE_SLUG_TAKEN",
      `store slug ${parsed.slug} already exists in this organization`,
    );
  }
  const { store, storefront } = await repos.stores.createWithDefaultStorefront(
    {
      orgId: parsed.orgId,
      name: parsed.name,
      slug: parsed.slug,
      locale: parsed.locale,
    },
  );
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "store.created",
      subjectType: AUDIT_SUBJECTS.STORE,
      subjectId: store.id,
      after: {
        name: store.name,
        slug: store.slug,
        defaultStorefrontId: storefront.id,
        locale: storefront.locale,
      },
    }),
  );
  return { store, storefront };
}
