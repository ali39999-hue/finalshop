import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type TenantContext,
  buildAuditEvent,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const VerifyDomainInput = z.object({
  orgId: z.string().min(1),
  domainId: z.string().min(1),
  verified: z.boolean().default(true),
});

export type VerifyDomainInput = z.input<typeof VerifyDomainInput>;

/**
 * Owner-only (permission `domain.verify`): flips a domain into the resolved
 * set. DNS-token verification flow arrives with the storefront UI; the state
 * transition itself is modeled here.
 */
export async function verifyDomain(
  repos: Repositories,
  ctx: TenantContext,
  input: VerifyDomainInput,
) {
  const parsed = VerifyDomainInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "domain.verify");
  const actor = requireUserId(ctx);
  const domain = await repos.domains.findById(parsed.domainId);
  if (!domain || domain.orgId !== parsed.orgId) {
    throw new DomainError("DOMAIN_NOT_FOUND", `domain ${parsed.domainId} not found`);
  }
  const updated = await repos.domains.setVerified(
    parsed.orgId,
    parsed.domainId,
    parsed.verified,
  );
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: parsed.verified ? "domain.verified" : "domain.unverified",
      subjectType: AUDIT_SUBJECTS.DOMAIN,
      subjectId: updated.id,
      before: { verified: domain.verified },
      after: { verified: updated.verified },
    }),
  );
  return updated;
}
