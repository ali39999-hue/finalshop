import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type TenantContext,
  buildAuditEvent,
  normalizeHost,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

const HOSTNAME_REGEX =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

export const AttachDomainInput = z.object({
  orgId: z.string().min(1),
  storefrontId: z.string().min(1),
  host: z.string().min(3).max(253),
  isPrimary: z.boolean().default(false),
});

export type AttachDomainInput = z.input<typeof AttachDomainInput>;

/** Attaches a custom host to a storefront of the caller's tenant (TEN-003). */
export async function attachDomain(
  repos: Repositories,
  ctx: TenantContext,
  input: AttachDomainInput,
) {
  const parsed = AttachDomainInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "domain.attach");
  const actor = requireUserId(ctx);

  const host = normalizeHost(parsed.host);
  if (host !== "localhost" && !HOSTNAME_REGEX.test(host)) {
    throw new DomainError("INVALID_HOST", parsed.host);
  }
  const storefront = await repos.storefronts.findById(parsed.storefrontId);
  if (!storefront || storefront.orgId !== parsed.orgId) {
    throw new DomainError(
      "STOREFRONT_NOT_FOUND",
      `storefront ${parsed.storefrontId} not found`,
    );
  }
  const domain = await repos.domains.attach({
    orgId: parsed.orgId,
    storefrontId: parsed.storefrontId,
    host,
    isPrimary: parsed.isPrimary,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "domain.attached",
      subjectType: AUDIT_SUBJECTS.DOMAIN,
      subjectId: domain.id,
      after: { host: domain.host, isPrimary: domain.isPrimary },
    }),
  );
  return domain;
}
