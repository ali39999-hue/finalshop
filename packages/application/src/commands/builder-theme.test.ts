import { describe, expect, it } from "vitest";
import {
  InMemoryRepositories,
  memberContext,
  ownerContext,
  seedOrgWithStore,
} from "../testing";
import {
  createTheme,
  getInspectorFields,
  registerBlockDefinition,
  registerTemplate,
  validatePageAgainstRegistry,
} from "../index";
import type { PageNode } from "../index";

function node(id: string, type: string, props: Record<string, unknown> = {}, children: PageNode[] = []): PageNode {
  return { id, type, props, children };
}

async function builderBase() {
  const repos = new InMemoryRepositories();
  const { orgId } = await seedOrgWithStore(repos);
  return { repos, orgId, ctx: ownerContext(orgId) };
}

const validTokens = {
  colors: { background: "#ffffff", text: "#1a1a1a", primary: "#0b5fff" },
  typography: { fontFamily: "Inter", scale: { base: 16 } },
  spacing: { sm: 4 },
  radius: { md: 8 },
  shadow: { card: "0 1px 2px rgba(0,0,0,.1)" },
  motion: { durationMs: 150, easing: "ease-out" },
};

describe("builder & theme (W8)", () => {
  it("validates a page against built-ins and org-registered blocks (BLD-001..003)", async () => {
    const { repos, orgId, ctx } = await builderBase();

    const clean = await validatePageAgainstRegistry(repos, ctx, {
      orgId,
      schema: node("root", "layout.section", {}, [
        node("t1", "content.text", { text: "Hello" }),
        node("g1", "commerce.productGrid", { collectionId: "col-1", limit: 12 }),
      ]),
    });
    expect(clean.diagnostics).toEqual([]);

    const broken = await validatePageAgainstRegistry(repos, ctx, {
      orgId,
      schema: node("root", "layout.section", {}, [
        node("t1", "content.text", {}),
        node("x1", "mystery.block", {}),
      ]),
    });
    expect(broken.diagnostics).toEqual(
      expect.arrayContaining([
        { nodeId: "t1", code: "PROP_REQUIRED_MISSING" },
        { nodeId: "x1", code: "UNKNOWN_BLOCK" },
      ]),
    );

    // Orgs can register their own blocks, which then validate cleanly.
    await registerBlockDefinition(repos, ctx, {
      orgId,
      type: "extension.testimonialWall",
      name: "Testimonial Wall",
      kind: "extension",
      isSection: true,
      fields: { source: { type: "string", required: true } },
    });
    const custom = await validatePageAgainstRegistry(repos, ctx, {
      orgId,
      schema: node("root", "layout.section", {}, [
        node("tw", "extension.testimonialWall", { source: "api" }),
      ]),
    });
    expect(custom.diagnostics).toEqual([]);
  });

  it("serves inspector descriptors (BLD-005)", async () => {
    const { repos, orgId, ctx } = await builderBase();
    const fields = await getInspectorFields(repos, ctx, {
      orgId,
      blockType: "growth.banner",
    });
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "headline", type: "string", required: true }),
        expect.objectContaining({ name: "tone", type: "enum" }),
      ]),
    );
    await expect(
      getInspectorFields(repos, ctx, { orgId, blockType: "mystery.block" }),
    ).rejects.toMatchObject({ code: "BLOCK_NOT_FOUND" });
  });

  it("creates themes with the contrast guard (THEME-001)", async () => {
    const { repos, orgId, ctx } = await builderBase();
    const theme = await createTheme(repos, ctx, {
      orgId,
      name: "Default",
      tokens: validTokens,
    });
    expect(theme.isActive).toBe(true);
    await expect(
      createTheme(repos, ctx, {
        orgId,
        name: "Low contrast",
        tokens: {
          ...validTokens,
          colors: { ...validTokens.colors, text: "#cccccc" },
        },
      }),
    ).rejects.toMatchObject({ code: "CONTRAST_FAILS" });
  });

  it("registers templates only against known blocks (THEME-002)", async () => {
    const { repos, orgId, ctx } = await builderBase();
    const theme = await createTheme(repos, ctx, { orgId, name: "Base", tokens: validTokens });
    const template = await registerTemplate(repos, ctx, {
      orgId,
      themeId: theme.id,
      name: "Home",
      kind: "page",
      root: node("root", "layout.section", {}, [node("t", "content.text", { text: "Hi" })]),
    });
    expect(template.kind).toBe("page");
    await expect(
      registerTemplate(repos, ctx, {
        orgId,
        name: "Broken",
        kind: "page",
        root: node("root", "layout.section", {}, [node("x", "mystery.block")]),
      }),
    ).rejects.toMatchObject({ code: "TEMPLATE_INVALID" });
  });

  it("requires builder permissions", async () => {
    const { repos, orgId } = await builderBase();
    await expect(
      createTheme(repos, memberContext(orgId), {
        orgId,
        name: "X",
        tokens: validTokens,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});
