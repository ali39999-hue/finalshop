import type { PageNode, PageSeo, PageStatus } from "@finalshop/domain";

export type { PageNode, PageSeo, PageStatus };

/**
 * CMS ports (W7, CMS-001..004). Revisions are immutable; the page carries
 * the status and the published/scheduled revision pointers.
 */

export interface PageRecord {
  id: string;
  orgId: string;
  slug: string;
  title: string;
  locale: string;
  status: PageStatus;
  publishedRevisionNumber: number | null;
  scheduledFor: Date | null;
  scheduledRevisionNumber: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PageRevisionRecord {
  id: string;
  orgId: string;
  pageId: string;
  revisionNumber: number;
  schemaVersion: number;
  schema: PageNode;
  seo: PageSeo;
  authorId: string;
  createdAt: Date;
}

export interface PageRepository {
  create(input: {
    orgId: string;
    slug: string;
    title: string;
    locale: string;
  }): Promise<PageRecord>;
  findById(id: string): Promise<PageRecord | null>;
  findBySlug(orgId: string, slug: string, locale: string): Promise<PageRecord | null>;
  listByOrg(orgId: string, limit?: number): Promise<PageRecord[]>;
  markStatus(input: { id: string; orgId: string; status: PageStatus }): Promise<PageRecord>;
  setPublishedRevision(input: {
    id: string;
    orgId: string;
    revisionNumber: number;
  }): Promise<PageRecord>;
  setSchedule(input: {
    id: string;
    orgId: string;
    scheduledFor: Date | null;
    revisionNumber: number | null;
  }): Promise<PageRecord>;
  /** SCHEDULED pages whose time has come. */
  listScheduled(orgId: string | null, at: Date, limit?: number): Promise<PageRecord[]>;
}

export interface PageRevisionRepository {
  create(input: {
    orgId: string;
    pageId: string;
    revisionNumber: number;
    schema: PageNode;
    seo: PageSeo;
    authorId: string;
  }): Promise<PageRevisionRecord>;
  findById(id: string): Promise<PageRevisionRecord | null>;
  findByNumber(
    orgId: string,
    pageId: string,
    revisionNumber: number,
  ): Promise<PageRevisionRecord | null>;
  latestNumber(orgId: string, pageId: string): Promise<number | null>;
  listByPage(orgId: string, pageId: string): Promise<PageRevisionRecord[]>;
}
