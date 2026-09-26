import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  buildAuditEvent,
} from "@finalshop/domain";
import type { Repositories } from "../ports";

export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export const CreateOrganizationInput = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().regex(SLUG_REGEX),
  ownerUserId: z.string().min(1),
});

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationInput>;

/**
 * Platform-level command: it creates the tenant boundary itself, so it runs
 * without a tenant context. The owner user receives the first OWNER
 * membership (IAM-001) and the creation is audited (IAM-004).
 */
export async function createOrganization(
  repos: Repositories,
  input: CreateOrganizationInput,
) {
  const parsed = CreateOrganizationInput.parse(input);
  const existing = await repos.organizations.findBySlug(parsed.slug);
  if (existing) {
    throw new DomainError(
      "ORGANIZATION_SLUG_TAKEN",
      `organization slug ${parsed.slug} is already in use`,
    );
  }
  const { organization, membership } =
    await repos.organizations.createWithOwner(parsed);
  await repos.audit.record(
    buildAuditEvent({
      orgId: organization.id,
      actorId: parsed.ownerUserId,
      action: "organization.created",
      subjectType: AUDIT_SUBJECTS.ORGANIZATION,
      subjectId: organization.id,
      after: { name: organization.name, slug: organization.slug },
      metadata: { ownerMembershipId: membership.id },
    }),
  );
  return { organization, membership };
}
