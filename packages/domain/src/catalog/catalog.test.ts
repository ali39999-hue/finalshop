import { describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import {
  assertAssetAllowed,
  assertStorageKeyBelongsToOrg,
  buildAssetStorageKey,
} from "./asset-policy";
import {
  assertCategoryDepth,
  assertValidProductOptions,
  assertValidSku,
  assertValidWeightGrams,
  assertVariantMatchesOptions,
} from "./invariants";
import { canTransitionProductStatus, type ProductOption } from "./types";
import { nextRevisionNumber } from "./revision";

const withCode = (code: string) =>
  expect.objectContaining({ code });

describe("product/variant invariants (CAT-001)", () => {
  it("accepts well-formed SKUs and rejects malformed ones", () => {
    expect(assertValidSku(" TSHIRT-RED_M ")).toBe("TSHIRT-RED_M");
    expect(() => assertValidSku("has space")).toThrow(DomainError);
    expect(() => assertValidSku("")).toThrow(DomainError);
    expect(() => assertValidSku("x".repeat(65))).toThrow(DomainError);
  });

  it("validates weight bounds", () => {
    expect(assertValidWeightGrams(1500)).toBe(1500);
    expect(() => assertValidWeightGrams(-1)).toThrow(DomainError);
    expect(() => assertValidWeightGrams(1.5)).toThrow(DomainError);
  });

  it("enforces option structure limits", () => {
    const options: ProductOption[] = [
      { name: "Size", values: ["S", "M"] },
      { name: "Color", values: ["Red"] },
    ];
    expect(assertValidProductOptions(options)).toHaveLength(2);
    expect(() =>
      assertValidProductOptions([{ name: "Size", values: [] }]),
    ).toThrow(withCode("PRODUCT_OPTIONS_INVALID"));
    expect(() =>
      assertValidProductOptions([
        { name: "Size", values: ["S"] },
        { name: "size", values: ["M"] },
      ]),
    ).toThrow(withCode("PRODUCT_OPTIONS_INVALID"));
    expect(() =>
      assertValidProductOptions([
        { name: "A", values: ["x"] },
        { name: "B", values: ["x"] },
        { name: "C", values: ["x"] },
        { name: "D", values: ["x"] },
      ]),
    ).toThrow(withCode("PRODUCT_OPTIONS_INVALID"));
  });

  it("pins variants to exactly one value per product option", () => {
    const options: ProductOption[] = [{ name: "Size", values: ["S", "M"] }];
    expect(assertVariantMatchesOptions(options, { Size: "M" })).toEqual({
      Size: "M",
    });
    expect(() => assertVariantMatchesOptions(options, {})).toThrow(
      withCode("VARIANT_OPTIONS_MISMATCH"),
    );
    expect(() =>
      assertVariantMatchesOptions(options, { Size: "XL" }),
    ).toThrow(withCode("VARIANT_OPTIONS_MISMATCH"));
    expect(() =>
      assertVariantMatchesOptions(options, { Size: "M", Color: "Red" }),
    ).toThrow(withCode("VARIANT_OPTIONS_MISMATCH"));
    // Products without options take a single variant with empty values.
    expect(assertVariantMatchesOptions([], {})).toEqual({});
    expect(() => assertVariantMatchesOptions([], { Size: "M" })).toThrow(
      withCode("VARIANT_OPTIONS_MISMATCH"),
    );
  });

  it("restricts product status transitions to the state machine", () => {
    expect(canTransitionProductStatus("DRAFT", "ACTIVE")).toBe(true);
    expect(canTransitionProductStatus("ACTIVE", "ARCHIVED")).toBe(true);
    expect(canTransitionProductStatus("ACTIVE", "DRAFT")).toBe(false);
    expect(canTransitionProductStatus("ARCHIVED", "ACTIVE")).toBe(false);
  });
});

describe("asset policy (CAT-003)", () => {
  it("enforces the MIME allow-list per kind", () => {
    expect(() =>
      assertAssetAllowed({ kind: "IMAGE", mime: "image/png", sizeBytes: 1000 }),
    ).not.toThrow();
    expect(() =>
      assertAssetAllowed({
        kind: "IMAGE",
        mime: "image/svg+xml",
        sizeBytes: 1000,
      }),
    ).toThrow(withCode("ASSET_MIME_NOT_ALLOWED"));
    expect(() =>
      assertAssetAllowed({ kind: "VIDEO", mime: "image/png", sizeBytes: 1000 }),
    ).toThrow(withCode("ASSET_MIME_NOT_ALLOWED"));
  });

  it("enforces per-kind size limits", () => {
    expect(() =>
      assertAssetAllowed({ kind: "IMAGE", mime: "image/png", sizeBytes: 0 }),
    ).toThrow(withCode("ASSET_SIZE_INVALID"));
    expect(() =>
      assertAssetAllowed({
        kind: "IMAGE",
        mime: "image/png",
        sizeBytes: 11 * 1024 * 1024,
      }),
    ).toThrow(withCode("ASSET_TOO_LARGE"));
    expect(() =>
      assertAssetAllowed({
        kind: "VIDEO",
        mime: "video/mp4",
        sizeBytes: 400 * 1024 * 1024,
      }),
    ).not.toThrow();
  });

  it("scopes storage keys to the org namespace", () => {
    const key = buildAssetStorageKey({
      orgId: "org-1",
      kind: "IMAGE",
      date: new Date("2026-09-26T00:00:00Z"),
      id: "ast-1",
    });
    expect(key).toBe("org/org-1/image/2026/09/ast-1");
    expect(() => assertStorageKeyBelongsToOrg(key, "org-1")).not.toThrow();
    expect(() => assertStorageKeyBelongsToOrg(key, "org-2")).toThrow(
      withCode("CROSS_TENANT_ACCESS"),
    );
  });
});

describe("categories and revisions", () => {
  it("limits category nesting depth", () => {
    expect(() => assertCategoryDepth(4)).not.toThrow();
    expect(() => assertCategoryDepth(5)).toThrow(
      withCode("CATEGORY_DEPTH_EXCEEDED"),
    );
  });

  it("numbers revisions monotonically from 1", () => {
    expect(nextRevisionNumber(null)).toBe(1);
    expect(nextRevisionNumber(0)).toBe(1);
    expect(nextRevisionNumber(7)).toBe(8);
    expect(() => nextRevisionNumber(-2)).toThrow(DomainError);
  });
});
