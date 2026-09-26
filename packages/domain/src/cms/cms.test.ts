import { describe, expect, it } from "vitest";
import {
  collectPageAssetIds,
  validatePageSchema,
  type PageNode,
} from "./page";

function node(overrides?: Partial<PageNode>): PageNode {
  return {
    id: "root",
    type: "section",
    props: {},
    children: [],
    ...overrides,
  };
}

describe("page schema AST (CMS-001)", () => {
  it("accepts a well-formed tree", () => {
    const root = node({
      children: [
        node({ id: "hero-1", type: "hero", props: { assetId: "ast-1" } }),
        node({
          id: "grid-1",
          type: "grid",
          children: [node({ id: "p-1", type: "productGrid", props: { collectionId: "col-1" } })],
        }),
      ],
    });
    expect(() => validatePageSchema(root)).not.toThrow();
    expect(collectPageAssetIds(root)).toEqual(["ast-1"]);
  });

  it("rejects duplicate node ids, empty types and excessive depth", () => {
    expect(() =>
      validatePageSchema(node({ children: [node()] })),
    ).toThrow(expect.objectContaining({ code: "PAGE_SCHEMA_INVALID" }));
    expect(() =>
      validatePageSchema(node({ id: "root!", type: "x" })),
    ).toThrow(expect.objectContaining({ code: "PAGE_SCHEMA_INVALID" }));

    let deep: PageNode = node({ id: "leaf", type: "text" });
    for (let i = 0; i < 15; i += 1) {
      deep = node({ id: `lvl-${i}`, type: "section", children: [deep] });
    }
    expect(() => validatePageSchema(deep)).toThrow(
      expect.objectContaining({ code: "PAGE_SCHEMA_INVALID" }),
    );
  });
});
