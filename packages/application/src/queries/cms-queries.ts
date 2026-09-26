import { z } from "zod";
import { DomainError, type PageNode, type TenantContext } from "@finalshop/domain";
import type { PageRecord, PageRevisionRecord } from "../cms-ports";
import { requirePermission, requireSameTenant } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const GetPageInput = z.object({
  orgId: z.string().min(1),
  pageId: z.string().min(1),
  /**
   * CMS-003 preview: "published" (default, storefront), "latest" (draft
   * preview), or an explicit revision number (history preview).
   */
  revision: z.union([z.enum(["published", "latest"]), z.number().int().min(1)]).default("published"),
});

export interface PageView {
  page: PageRecord;
  revision: PageRevisionRecord | null;
  schema: PageNode | null;
}

export async function getPage(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof GetPageInput>,
): Promise<PageView> {
  const parsed = GetPageInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "cms.read");
  const page = await repos.pages.findById(parsed.pageId);
  if (!page || page.orgId !== parsed.orgId) {
    throw new DomainError("PAGE_NOT_FOUND", `page ${parsed.pageId} not found`);
  }

  let revisionNumber: number | null;
  if (parsed.revision === "published") {
    revisionNumber = page.publishedRevisionNumber;
  } else if (parsed.revision === "latest") {
    revisionNumber = await repos.pageRevisions.latestNumber(parsed.orgId, page.id);
  } else {
    revisionNumber = parsed.revision;
  }
  const revision =
    revisionNumber !== null
      ? await repos.pageRevisions.findByNumber(parsed.orgId, page.id, revisionNumber)
      : null;

  return {
    page,
    revision,
    schema: revision?.schema ?? null,
  };
}

export async function listPages(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; limit?: number },
) {
  const parsed = z
    .object({ orgId: z.string().min(1), limit: z.number().int().min(1).max(200).default(50) })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "cms.read");
  return repos.pages.listByOrg(parsed.orgId, parsed.limit);
}
