import { describe, expect, it } from "vitest";
import {
  CLONE_PROFILES,
  assertNoForbiddenKinds,
  isCloneProfileName,
  profileAllows,
} from "./profiles";
import { topologicalSort, type DependencyNode } from "./graph";
import { buildManifest, remapId, warningForUnmapped } from "./manifest";
import { planSync } from "./inheritance";

describe("clone profiles (CLONE-001)", () => {
  it("never allows transactional or identity kinds", () => {
    for (const kinds of Object.values(CLONE_PROFILES)) {
      expect(() => assertNoForbiddenKinds(kinds)).not.toThrow();
    }
    expect(() => assertNoForbiddenKinds(["order"])).toThrow(
      expect.objectContaining({ code: "CLONE_PROFILE_FORBIDDEN_KIND" }),
    );
    expect(() => assertNoForbiddenKinds(["paymentIntent", "customer"])).toThrow();
    expect(profileAllows("STORE_BLUEPRINT", "product")).toBe(true);
    expect(profileAllows("SANDBOX", "price")).toBe(false);
    expect(profileAllows("FULL_LAUNCH_SEED", "inventoryItem")).toBe(true);
    expect(isCloneProfileName("CHILD_BRANCH")).toBe(true);
    expect(isCloneProfileName("NOPE")).toBe(false);
  });
});

describe("dependency graph (CLONE-002)", () => {
  it("sorts dependencies before dependents", () => {
    const nodes: DependencyNode[] = [
      { kind: "price", sourceId: "p1", deps: [
        { kind: "priceList", sourceId: "pl1" },
        { kind: "variant", sourceId: "v1" },
      ] },
      { kind: "variant", sourceId: "v1", deps: [{ kind: "product", sourceId: "pr1" }] },
      { kind: "priceList", sourceId: "pl1", deps: [] },
      { kind: "product", sourceId: "pr1", deps: [] },
    ];
    const sorted = topologicalSort(nodes);
    const index = (kind: string, id: string) =>
      sorted.findIndex((n) => n.kind === kind && n.sourceId === id);
    expect(index("priceList", "pl1")).toBeLessThan(index("price", "p1"));
    expect(index("variant", "v1")).toBeLessThan(index("price", "p1"));
    expect(index("product", "pr1")).toBeLessThan(index("variant", "v1"));
  });

  it("detects cycles and ignores deps outside the cloned set", () => {
    expect(() =>
      topologicalSort([
        { kind: "page", sourceId: "a", deps: [{ kind: "page", sourceId: "b" }] },
        { kind: "page", sourceId: "b", deps: [{ kind: "page", sourceId: "a" }] },
      ]),
    ).toThrow(expect.objectContaining({ code: "CLONE_CYCLE" }));
    // A dep on a non-cloned entity (asset not in a SANDBOX profile) is simply
    // not an edge — the manifest warns about it instead.
    expect(() =>
      topologicalSort([
        { kind: "page", sourceId: "a", deps: [{ kind: "asset", sourceId: "missing" }] },
      ]),
    ).not.toThrow();
  });
});

describe("manifest & remap (CLONE-003)", () => {
  const manifest = buildManifest({
    profile: "STORE_BLUEPRINT",
    sourceOrgId: "org-1",
    targetOrgId: "org-2",
    entries: [
      { kind: "product", sourceId: "pr1", targetId: "npr1" },
      { kind: "variant", sourceId: "v1", targetId: "nv1" },
    ],
    warnings: [warningForUnmapped("asset", "ast1")],
  });

  it("freezes the manifest and remaps ids", () => {
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(remapId(manifest, "product", "pr1")).toBe("npr1");
    expect(remapId(manifest, "asset", "ast1")).toBeNull();
    expect(manifest.warnings).toEqual(["asset/ast1: source reference not part of the cloned set"]);
  });
});

describe("inheritance & sync (FORK-001/002)", () => {
  it("plans updates, conflicts and skips per override status", () => {
    const parent = { schema: "v2", title: "Same" };
    const child = { schema: "v1", title: "Same" };
    const plan = planSync(parent, child, ["schema", "title"], {
      schema: undefined, // inherited
    });
    expect(plan.updates).toEqual([{ field: "schema", value: "v2" }]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.skipped).toEqual([]);

    const conflicted = planSync(parent, child, ["schema"], {
      schema: { status: "overridden" },
    });
    expect(conflicted.updates).toEqual([]);
    expect(conflicted.conflicts).toEqual([
      { field: "schema", parentValue: "v2", childValue: "v1" },
    ]);

    const detached = planSync(parent, child, ["schema"], {
      schema: { status: "detached" },
    });
    expect(detached.updates).toEqual([]);
    expect(detached.skipped).toEqual(["schema"]);
  });
});
