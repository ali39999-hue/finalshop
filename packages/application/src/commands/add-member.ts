import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  ROLES,
  type TenantContext,
  buildAuditEvent,
} from "@finalshop/domain";
import { requireCanGrantRole, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const AddMemberInput = z.object({
  orgId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(ROLES),
});

export type AddMemberInput = z.infer<typeof AddMemberInput>;

/** Adds a membership under the assignment rules (IAM-001/002). */
export async function addMember(
  repos: Repositories,
  ctx: TenantContext,
  input: AddMemberInput,
) {
  const parsed = AddMemberInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requireCanGrantRole(ctx, parsed.role);
  const actor = requireUserId(ctx);
  const memberships = await repos.memberships.listByOrg(parsed.orgId);
  if (memberships.some((m) => m.userId === parsed.userId)) {
    throw new DomainError(
      "MEMBERSHIP_EXISTS",
      `user ${parsed.userId} is already a member of ${parsed.orgId}`,
    );
  }
  const membership = await repos.memberships.add(parsed);
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "member.added",
      subjectType: AUDIT_SUBJECTS.MEMBERSHIP,
      subjectId: membership.id,
      after: { userId: membership.userId, role: membership.role },
    }),
  );
  return membership;
}
