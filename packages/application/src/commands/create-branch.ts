import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type TenantContext,
  buildAuditEvent,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const CreateBranchInput = z.object({
  orgId: z.string().min(1),
  storeId: z.string().min(1),
  name: z.string().min(1).max(200),
  kind: z.enum([
    "RETAIL_LOCATION",
    "WAREHOUSE",
    "FULFILLMENT",
    "BUSINESS_UNIT",
  ]),
});

export type CreateBranchInput = z.infer<typeof CreateBranchInput>;

/**
 * A Branch is a location/fulfillment/business unit under a store — not a
 * security boundary (roadmap §5).
 */
export async function createBranch(
  repos: Repositories,
  ctx: TenantContext,
  input: CreateBranchInput,
) {
  const parsed = CreateBranchInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "branch.create");
  const actor = requireUserId(ctx);
  const store = await repos.stores.findById(parsed.storeId);
  if (!store || store.orgId !== parsed.orgId) {
    // Same response whether the store is missing or foreign: no existence leak.
    throw new DomainError("STORE_NOT_FOUND", `store ${parsed.storeId} not found`);
  }
  const branch = await repos.branches.create(parsed);
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "branch.created",
      subjectType: AUDIT_SUBJECTS.BRANCH,
      subjectId: branch.id,
      after: { name: branch.name, kind: branch.kind, storeId: branch.storeId },
    }),
  );
  return branch;
}
