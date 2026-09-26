import { describe, expect, it } from "vitest";
import {
  InMemoryRepositories,
  memberContext,
  ownerContext,
  seedOrgWithStore,
} from "../testing";
import {
  archivePage,
  createPage,
  getPage,
  listPages,
  publishPage,
  publishScheduledPages,
  registerAsset,
  savePageRevision,
  schedulePublish,
} from "../index";
import type { PageNode } from "../index";

function section(id: string, children: PageNode[] = [], props: Record<string, unknown> = {}): PageNode {
  return { id, type: "section", props, children };
}

async function cmsBase() {
  const repos = new InMemoryRepositories();
  const { orgId } = await seedOrgWithStore(repos);
  return { repos, orgId, ctx: ownerContext(orgId) };
}

describe("cms pages (W7, CMS-001..004)", () => {
  it("creates a page, saves revisions, and publishes", async () => {
    const { repos, orgId, ctx } = await cmsBase();
    const { page } = await createPage(repos, ctx, {
      orgId,
      title: "Home",
      slug: "home",
      schema: section("root", [section("hero-1", [], { headline: "Welcome" })]),
    });
    expect(page.status).toBe("DRAFT");

    // A new save is a new immutable revision (CMS-001/003).
    const save2 = await savePageRevision(repos, ctx, {
      orgId,
      pageId: page.id,
      schema: section("root", [section("hero-2", [], { headline: "Updated" })]),
    });
    expect(save2.revisionNumber).toBe(2);

    await publishPage(repos, ctx, { orgId, pageId: page.id });
    const published = await getPage(repos, ctx, { orgId, pageId: page.id });
    expect(published.page.status).toBe("PUBLISHED");
    expect(published.schema?.children[0]?.props.headline).toBe("Updated");

    // Draft preview returns the newest revision even after publish.
    const draftPreview = await getPage(repos, ctx, {
      orgId,
      pageId: page.id,
      revision: "latest",
    });
    expect(draftPreview.revision?.revisionNumber).toBe(2);

    // History preview: the exact old revision.
    const history = await getPage(repos, ctx, { orgId, pageId: page.id, revision: 1 });
    expect(history.schema?.children[0]?.props.headline).toBe("Welcome");
  });

  it("schedules and auto-publishes via the worker sweep (CMS-004)", async () => {
    const { repos, orgId, ctx } = await cmsBase();
    const { page } = await createPage(repos, ctx, {
      orgId,
      title: "Campaign",
      slug: "campaign",
    });
    const scheduledFor = new Date(Date.now() + 3600_000);
    await schedulePublish(repos, ctx, { orgId, pageId: page.id, scheduledFor });
    expect((await repos.pages.findById(page.id))?.status).toBe("SCHEDULED");

    const before = await publishScheduledPages(repos, { at: new Date() });
    expect(before.published).toBe(0);

    const after = await publishScheduledPages(repos, {
      at: new Date(Date.now() + 7200_000),
    });
    expect(after.published).toBe(1);
    const publishedPage = await repos.pages.findById(page.id);
    expect(publishedPage).toMatchObject({ status: "PUBLISHED" });
    expect(publishedPage?.publishedRevisionNumber).toBe(1);
    expect(publishedPage?.scheduledFor).toBeNull();
  });

  it("validates that referenced assets belong to the organization (CMS-002)", async () => {
    const { repos, orgId, ctx } = await cmsBase();
    const asset = await registerAsset(repos, ctx, {
      orgId,
      kind: "IMAGE",
      mime: "image/png",
      sizeBytes: 2048,
    });
    const { page } = await createPage(repos, ctx, {
      orgId,
      title: "Media",
      slug: "media",
      schema: section("root", [section("img-1", [], { assetId: asset.id })]),
    });
    await expect(
      savePageRevision(repos, ctx, {
        orgId,
        pageId: page.id,
        schema: section("root", [section("img-2", [], { assetId: "ast-fake" })]),
      }),
    ).rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
  });

  it("guards slug uniqueness and permissions", async () => {
    const { repos, orgId, ctx } = await cmsBase();
    await createPage(repos, ctx, { orgId, title: "A", slug: "about" });
    await expect(
      createPage(repos, ctx, { orgId, title: "B", slug: "about" }),
    ).rejects.toMatchObject({ code: "PAGE_SLUG_TAKEN" });
    await expect(
      createPage(repos, memberContext(orgId), {
        orgId,
        title: "C",
        slug: "other",
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const list = await listPages(repos, ctx, { orgId });
    expect(list).toHaveLength(1);
    await archivePage(repos, ctx, { orgId, pageId: list[0]!.id });
    expect((await repos.pages.findById(list[0]!.id))?.status).toBe("ARCHIVED");
  });
});
