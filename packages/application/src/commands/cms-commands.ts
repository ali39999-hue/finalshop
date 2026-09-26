import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type PageNode,
  type PageSeo,
  type TenantContext,
  buildAuditEvent,
  collectPageAssetIds,
  validatePageSchema,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";
import { SLUG_REGEX } from "./create-organization";
import { nextRevisionNumber } from "@finalshop/domain";

/** Recursive zod schema for the page AST. */
export const PageNodeInput: z.ZodType<PageNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(64),
    type: z.string().min(1).max(64),
    props: z.record(z.string(), z.unknown()).default({}),
    children: z.array(PageNodeInput).default([]),
  }),
) as z.ZodType<PageNode>;

const SeoInput = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  keywords: z.array(z.string().max(50)).max(20).optional(),
});

const CreatePageInput = z.object({
  orgId: z.string().min(1),
  title: z.string().min(1).max(300),
  slug: z.string().regex(SLUG_REGEX),
  locale: z.string().min(2).max(10).default("en"),
  schema: PageNodeInput.optional(),
  seo: SeoInput.optional(),
});

/** CMS-001: creates a DRAFT page with its first revision. */
export async function createPage(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof CreatePageInput>,
) {
  const parsed = CreatePageInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "cms.manage");
  const actor = requireUserId(ctx);
  const duplicate = await repos.pages.findBySlug(
    parsed.orgId,
    parsed.slug,
    parsed.locale,
  );
  if (duplicate) {
    throw new DomainError(
      "PAGE_SLUG_TAKEN",
      `slug ${parsed.slug} already exists for locale ${parsed.locale}`,
    );
  }
  const schema: PageNode =
    parsed.schema ??
    ({ id: "root", type: "section", props: {}, children: [] } as PageNode);
  validatePageSchema(schema);
  await assertPageAssetsExist(repos, parsed.orgId, schema);

  const page = await repos.pages.create({
    orgId: parsed.orgId,
    slug: parsed.slug,
    title: parsed.title,
    locale: parsed.locale,
  });
  await repos.pageRevisions.create({
    orgId: parsed.orgId,
    pageId: page.id,
    revisionNumber: 1,
    schema,
    seo: (parsed.seo ?? {}) as PageSeo,
    authorId: actor,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "page.created",
      subjectType: AUDIT_SUBJECTS.PAGE,
      subjectId: page.id,
      after: { slug: page.slug, locale: page.locale },
    }),
  );
  return { page, revisionNumber: 1 };
}

/** Validates that every asset referenced by the AST belongs to the org (CMS-002). */
async function assertPageAssetsExist(
  repos: Repositories,
  orgId: string,
  schema: PageNode,
): Promise<void> {
  const assetIds = collectPageAssetIds(schema);
  if (assetIds.length === 0) return;
  const found = await repos.assets.listByIds(
    orgId,
    [...new Set(assetIds)],
  );
  const foundIds = new Set(found.map((a) => a.id));
  const missing = [...new Set(assetIds)].filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new DomainError(
      "ASSET_NOT_FOUND",
      `assets not found in this organization: ${missing.join(", ")}`,
    );
  }
}

const SaveRevisionInput = z.object({
  orgId: z.string().min(1),
  pageId: z.string().min(1),
  schema: PageNodeInput,
  seo: SeoInput.default({}),
});

/**
 * CMS-001/003: every save writes a NEW immutable revision (draft). The
 * published pointer only moves on publish — drafts are always previewable.
 */
export async function savePageRevision(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof SaveRevisionInput>,
) {
  const parsed = SaveRevisionInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "cms.manage");
  const actor = requireUserId(ctx);
  const page = await loadPage(repos, parsed.orgId, parsed.pageId);
  validatePageSchema(parsed.schema);
  await assertPageAssetsExist(repos, parsed.orgId, parsed.schema);

  const revisionNumber = nextRevisionNumber(
    await repos.pageRevisions.latestNumber(parsed.orgId, page.id),
  );
  await repos.pageRevisions.create({
    orgId: parsed.orgId,
    pageId: page.id,
    revisionNumber,
    schema: parsed.schema,
    seo: parsed.seo as PageSeo,
    authorId: actor,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "page.revision_saved",
      subjectType: AUDIT_SUBJECTS.PAGE,
      subjectId: page.id,
      after: { revisionNumber },
    }),
  );
  return { page, revisionNumber };
}

async function loadPage(repos: Repositories, orgId: string, pageId: string) {
  const page = await repos.pages.findById(pageId);
  if (!page || page.orgId !== orgId) {
    throw new DomainError("PAGE_NOT_FOUND", `page ${pageId} not found`);
  }
  return page;
}

/** CMS-003: publish moves the pointer — the revision itself is untouched. */
export async function publishPage(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; pageId: string; revisionNumber?: number },
) {
  const parsed = z
    .object({
      orgId: z.string().min(1),
      pageId: z.string().min(1),
      revisionNumber: z.number().int().min(1).optional(),
    })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "cms.publish");
  const actor = requireUserId(ctx);
  const page = await loadPage(repos, parsed.orgId, parsed.pageId);
  if (page.status === "ARCHIVED") {
    throw new DomainError("PAGE_CONFLICT", "archived pages cannot be published");
  }
  const revisionNumber =
    parsed.revisionNumber ??
    (await repos.pageRevisions.latestNumber(parsed.orgId, page.id));
  if (revisionNumber === null) {
    throw new DomainError("PAGE_CONFLICT", "page has no revisions");
  }
  const revision = await repos.pageRevisions.findByNumber(
    parsed.orgId,
    page.id,
    revisionNumber,
  );
  if (!revision) {
    throw new DomainError("PAGE_CONFLICT", `revision ${revisionNumber} not found`);
  }
  const published = await repos.pages.setPublishedRevision({
    id: page.id,
    orgId: parsed.orgId,
    revisionNumber,
  });
  await repos.pages.markStatus({ id: page.id, orgId: parsed.orgId, status: "PUBLISHED" });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "page.published",
      subjectType: AUDIT_SUBJECTS.PAGE,
      subjectId: page.id,
      after: { revisionNumber },
    }),
  );
  return published;
}

/** CMS-004: schedule a future publish of a revision. */
export async function schedulePublish(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; pageId: string; scheduledFor: Date; revisionNumber?: number },
) {
  const parsed = z
    .object({
      orgId: z.string().min(1),
      pageId: z.string().min(1),
      scheduledFor: z.date(),
      revisionNumber: z.number().int().min(1).optional(),
    })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "cms.publish");
  const actor = requireUserId(ctx);
  const page = await loadPage(repos, parsed.orgId, parsed.pageId);
  if (parsed.scheduledFor.getTime() <= Date.now()) {
    throw new DomainError("PAGE_CONFLICT", "scheduledFor must be in the future");
  }
  const revisionNumber =
    parsed.revisionNumber ??
    (await repos.pageRevisions.latestNumber(parsed.orgId, page.id));
  if (revisionNumber === null) {
    throw new DomainError("PAGE_CONFLICT", "page has no revisions");
  }
  const scheduled = await repos.pages.setSchedule({
    id: page.id,
    orgId: parsed.orgId,
    scheduledFor: parsed.scheduledFor,
    revisionNumber,
  });
  await repos.pages.markStatus({
    id: page.id,
    orgId: parsed.orgId,
    status: "SCHEDULED",
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "page.publish_scheduled",
      subjectType: AUDIT_SUBJECTS.PAGE,
      subjectId: page.id,
      after: { revisionNumber, scheduledFor: parsed.scheduledFor.toISOString() },
    }),
  );
  return scheduled;
}

/** Worker command (CMS-004): publishes every scheduled page whose time came. */
export async function publishScheduledPages(
  repos: Repositories,
  input: { at?: Date; orgId?: string; limit?: number },
) {
  const at = input.at ?? new Date();
  const scheduled = await repos.pages.listScheduled(
    input.orgId ?? null,
    at,
    input.limit ?? 100,
  );
  let published = 0;
  for (const page of scheduled) {
    if (page.scheduledRevisionNumber === null) continue;
    await repos.pages.setPublishedRevision({
      id: page.id,
      orgId: page.orgId,
      revisionNumber: page.scheduledRevisionNumber,
    });
    await repos.pages.markStatus({ id: page.id, orgId: page.orgId, status: "PUBLISHED" });
    await repos.pages.setSchedule({
      id: page.id,
      orgId: page.orgId,
      scheduledFor: null,
      revisionNumber: null,
    });
    await repos.audit.record(
      buildAuditEvent({
        orgId: page.orgId,
        actorId: "system-scheduler",
        action: "page.published",
        subjectType: AUDIT_SUBJECTS.PAGE,
        subjectId: page.id,
        after: { revisionNumber: page.scheduledRevisionNumber, scheduled: true },
      }),
    );
    published += 1;
  }
  return { published };
}

export async function archivePage(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; pageId: string },
) {
  const parsed = z
    .object({ orgId: z.string().min(1), pageId: z.string().min(1) })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "cms.manage");
  requireUserId(ctx);
  const page = await loadPage(repos, parsed.orgId, parsed.pageId);
  const archived = await repos.pages.markStatus({
    id: page.id,
    orgId: parsed.orgId,
    status: "ARCHIVED",
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: requireUserId(ctx),
      action: "page.archived",
      subjectType: AUDIT_SUBJECTS.PAGE,
      subjectId: page.id,
    }),
  );
  return archived;
}
