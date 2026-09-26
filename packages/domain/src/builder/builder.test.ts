import { describe, expect, it } from "vitest";
import type { PageNode } from "../cms/page";
import {
  BlockRegistry,
  builtInRegistry,
  collectValidationErrors,
  inspectorFields,
} from "./registry";
import { contrastRatio, validateDesignTokens, type DesignTokens } from "../theme/tokens";
import { assertTemplateValidAgainstRegistry } from "../theme/theme";

function node(id: string, type: string, props: Record<string, unknown> = {}, children: PageNode[] = []): PageNode {
  return { id, type, props, children };
}

const tokens: DesignTokens = {
  colors: { background: "#ffffff", text: "#1a1a1a", primary: "#0b5fff" },
  typography: { fontFamily: "Inter", scale: { base: 16, lg: 20 } },
  spacing: { sm: 4, md: 8 },
  radius: { md: 8 },
  shadow: { card: "0 1px 2px rgba(0,0,0,.1)" },
  motion: { durationMs: 150, easing: "ease-out" },
};

describe("block registry & validator (BLD-001..003)", () => {
  it("ships the built-in block set by category", () => {
    const registry = builtInRegistry();
    expect(registry.list().map((d) => d.type)).toEqual(
      expect.arrayContaining([
        "layout.section",
        "content.text",
        "commerce.productGrid",
        "growth.banner",
        "extension.appSlot",
      ]),
    );
    expect(registry.list("commerce")).toHaveLength(2);
    expect(() =>
      registry.register({
        type: "layout.section",
        name: "Dup",
        kind: "layout",
        fields: {},
      }),
    ).toThrow(expect.objectContaining({ code: "BLOCK_TYPE_TAKEN" }));
  });

  it("rejects malformed definitions", () => {
    const registry = new BlockRegistry();
    expect(() =>
      registry.register({ type: "nope", name: "X", kind: "layout", fields: {} }),
    ).toThrow(expect.objectContaining({ code: "BLOCK_DEFINITION_INVALID" }));
    expect(() =>
      registry.register({
        type: "growth.bad",
        name: "X",
        kind: "growth",
        fields: { tone: { type: "enum" } },
      }),
    ).toThrow(expect.objectContaining({ code: "BLOCK_DEFINITION_INVALID" }));
  });

  it("collects prop and structure diagnostics", () => {
    const registry = builtInRegistry();
    const page = node("root", "layout.section", {}, [
      node("t1", "content.text"), // missing required text
      node("i1", "content.image", { assetId: 42 }), // wrong type
      node("b1", "growth.banner", { headline: "Hi", tone: "mega" }), // bad enum
      node("u1", "mystery.block", {}), // unknown
    ]);
    const errors = collectValidationErrors(page, registry);
    expect(errors).toEqual(
      expect.arrayContaining([
        { nodeId: "t1", code: "PROP_REQUIRED_MISSING" },
        { nodeId: "i1", code: "PROP_TYPE_INVALID" },
        { nodeId: "b1", code: "PROP_TYPE_INVALID" },
        { nodeId: "u1", code: "UNKNOWN_BLOCK" },
      ]),
    );
  });

  it("exposes inspector field descriptors (BLD-005)", () => {
    const registry = builtInRegistry();
    const fields = inspectorFields(registry.get("commerce.productGrid")!);
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "collectionId", required: true, type: "collection" }),
        expect.objectContaining({ name: "limit", type: "number" }),
      ]),
    );
  });
});

describe("design tokens & templates (THEME-001/002)", () => {
  it("validates token structure", () => {
    expect(() => validateDesignTokens(tokens)).not.toThrow();
    expect(() =>
      validateDesignTokens({
        ...tokens,
        colors: { ...tokens.colors, text: undefined } as never,
      }),
    ).toThrow(expect.objectContaining({ code: "TOKEN_INVALID" }));
  });

  it("enforces the WCAG contrast guard", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(() =>
      validateDesignTokens({
        ...tokens,
        colors: { ...tokens.colors, text: "#cccccc", background: "#ffffff" },
      }),
    ).toThrow(expect.objectContaining({ code: "CONTRAST_FAILS" }));
  });

  it("rejects templates referencing unknown blocks", () => {
    const registry = builtInRegistry();
    expect(() =>
      assertTemplateValidAgainstRegistry(
        {
          id: "t1",
          name: "Home",
          kind: "page",
          root: node("root", "layout.section", {}, [
            node("h", "content.text", { text: "Hi" }),
          ]),
        },
        registry,
      ),
    ).not.toThrow();
    expect(() =>
      assertTemplateValidAgainstRegistry(
        {
          id: "t2",
          name: "Broken",
          kind: "page",
          root: node("root", "layout.section", {}, [node("x", "mystery.block")]),
        },
        registry,
      ),
    ).toThrow(expect.objectContaining({ code: "TEMPLATE_INVALID" }));
  });
});
