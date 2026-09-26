import {
  Prisma,
  type Page,
  type PageRevision,
  type PrismaClient,
} from "@prisma/client";
import { DomainError } from "@finalshop/domain";
import type {
  PageNode,
  PageRecord,
  PageRepository,
  PageRevisionRecord,
  PageRevisionRepository,
  PageSeo,
  PageStatus,
} from "@finalshop/application";

const toPage = (row: Page): PageRecord => ({
  id: row.id,
  orgId: row.orgId,
  slug: row.slug,
  title: row.title,
  locale: row.locale,
  status: row.status as PageStatus,
  publishedRevisionNumber: row.publishedRevisionNumber,
  scheduledFor: row.scheduledFor,
  scheduledRevisionNumber: row.scheduledRevisionNumber,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toRevision = (row: PageRevision): PageRevisionRecord => ({
  id: row.id,
  orgId: row.orgId,
  pageId: row.pageId,
  revisionNumber: row.revisionNumber,
  schemaVersion: row.schemaVersion,
  schema: row.schema as unknown as PageNode,
  seo: row.seo as unknown as PageSeo,
  authorId: row.authorId,
  createdAt: row.createdAt,
});

/** Prisma implementations of the CMS ports (W7). */
export function createCmsRepositories(db: PrismaClient): {
  pages: PageRepository;
  pageRevisions: PageRevisionRepository;
} {
  const pages: PageRepository = {
    create: async (input) => {
      const row = await db.page.create({ data: input });
      return toPage(row);
    },
    findById: async (id) => {
      const row = await db.page.findUnique({ where: { id } });
      return row ? toPage(row) : null;
    },
    findBySlug: async (orgId, slug, locale) => {
      const row = await db.page.findUnique({
        where: { orgId_slug_locale: { orgId, slug, locale } },
      });
      return row ? toPage(row) : null;
    },
    listByOrg: async (orgId, limit = 50) => {
      const rows = await db.page.findMany({
        where: { orgId },
        orderBy: { createdAt: "asc" },
        take: limit,
      });
      return rows.map(toPage);
    },
    markStatus: async (input) => {
      const existing = await db.page.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("PAGE_NOT_FOUND", input.id);
      const row = await db.page.update({
        where: { id: input.id },
        data: { status: input.status },
      });
      return toPage(row);
    },
    setPublishedRevision: async (input) => {
      const existing = await db.page.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("PAGE_NOT_FOUND", input.id);
      const row = await db.page.update({
        where: { id: input.id },
        data: { publishedRevisionNumber: input.revisionNumber },
      });
      return toPage(row);
    },
    setSchedule: async (input) => {
      const existing = await db.page.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("PAGE_NOT_FOUND", input.id);
      const row = await db.page.update({
        where: { id: input.id },
        data: {
          scheduledFor: input.scheduledFor,
          scheduledRevisionNumber: input.revisionNumber,
        },
      });
      return toPage(row);
    },
    listScheduled: async (orgId, at, limit = 100) => {
      const rows = await db.page.findMany({
        where: {
          ...(orgId ? { orgId } : {}),
          status: "SCHEDULED",
          scheduledFor: { lte: at },
        },
        orderBy: { scheduledFor: "asc" },
        take: limit,
      });
      return rows.map(toPage);
    },
  };

  const pageRevisions: PageRevisionRepository = {
    create: async (input) => {
      const row = await db.pageRevision.create({
        data: {
          orgId: input.orgId,
          pageId: input.pageId,
          revisionNumber: input.revisionNumber,
          schemaVersion: 1,
          schema: json(input.schema),
          seo: json(input.seo),
          authorId: input.authorId,
        },
      });
      return toRevision(row);
    },
    findById: async (id) => {
      const row = await db.pageRevision.findUnique({ where: { id } });
      return row ? toRevision(row) : null;
    },
    findByNumber: async (orgId, pageId, revisionNumber) => {
      const row = await db.pageRevision.findUnique({
        where: { pageId_revisionNumber: { pageId, revisionNumber } },
      });
      if (!row || row.orgId !== orgId) return null;
      return toRevision(row);
    },
    latestNumber: async (orgId, pageId) => {
      const row = await db.pageRevision.findFirst({
        where: { orgId, pageId },
        orderBy: { revisionNumber: "desc" },
        select: { revisionNumber: true },
      });
      return row?.revisionNumber ?? null;
    },
    listByPage: async (orgId, pageId) => {
      const rows = await db.pageRevision.findMany({
        where: { orgId, pageId },
        orderBy: { revisionNumber: "asc" },
      });
      return rows.map(toRevision);
    },
  };

  return { pages, pageRevisions };
}

const json = (value: unknown): Prisma.InputJsonValue =>
  value as unknown as Prisma.InputJsonValue;
