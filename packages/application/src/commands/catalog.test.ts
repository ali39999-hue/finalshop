import { describe, expect, it } from "vitest";
import {
  InMemoryRepositories,
  memberContext,
  ownerContext,
  seedOrgWithStore,
} from "../testing";
import {
  addProductsToCollection,
  addVariant,
  createCategory,
  createCollection,
  createProduct,
  importProducts,
  getProduct,
  listProducts,
  registerAsset,
  transitionProductStatus,
  updateProduct,
} from "../index";

async function catalogAdmin() {
  const repos = new InMemoryRepositories();
  const { orgId } = await seedOrgWithStore(repos);
  return { repos, orgId, ctx: ownerContext(orgId) };
}

describe("createProduct (CAT-001)", () => {
  it("creates a DRAFT product with options and audits it", async () => {
    const { repos, orgId, ctx } = await catalogAdmin();
    const product = await createProduct(repos, ctx, {
      orgId,
      title: "T-Shirt",
      slug: "t-shirt",
      options: [{ name: "Size", values: ["S", "M", "L"] }],
    });
    expect(product.status).toBe("DRAFT");
    expect(product.options).toEqual([{ name: "Size", values: ["S", "M", "L"] }]);
    const audit = await repos.audit.listByOrg(orgId);
    expect(audit.some((e) => e.action === "product.created")).toBe(true);
  });

  it("rejects duplicate slugs per organization", async () => {
    const { repos, orgId, ctx } = await catalogAdmin();
    await createProduct(repos, ctx, { orgId, title: "A", slug: "same" });
    await expect(
      createProduct(repos, ctx, { orgId, title: "B", slug: "same" }),
    ).rejects.toMatchObject({ code: "PRODUCT_SLUG_TAKEN" });
  });

  it("rejects invalid option structures", async () => {
    const { repos, orgId, ctx } = await catalogAdmin();
    await expect(
      createProduct(repos, ctx, {
        orgId,
        title: "X",
        slug: "x",
        options: [{ name: "Size", values: [] }],
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_OPTIONS_INVALID" });
  });

  it("requires product.create permission", async () => {
    const { repos, orgId } = await catalogAdmin();
    await expect(
      createProduct(repos, memberContext(orgId), {
        orgId,
        title: "X",
        slug: "x",
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});

describe("addVariant (CAT-001)", () => {
  async function productWithOptions() {
    const base = await catalogAdmin();
    const product = await createProduct(base.repos, base.ctx, {
      orgId: base.orgId,
      title: "T-Shirt",
      slug: "t-shirt",
      options: [{ name: "Size", values: ["S", "M"] }],
    });
    return { ...base, product };
  }

  it("creates a variant matching the product options", async () => {
    const { repos, orgId, ctx, product } = await productWithOptions();
    const variant = await addVariant(repos, ctx, {
      orgId,
      productId: product.id,
      sku: "TSHIRT-S",
      optionValues: { Size: "S" },
      weightGrams: 200,
    });
    expect(variant.sku).toBe("TSHIRT-S");
    expect(variant.optionValues).toEqual({ Size: "S" });
  });

  it("rejects option mismatches, duplicate SKUs and foreign products", async () => {
    const { repos, orgId, ctx, product } = await productWithOptions();
    await expect(
      addVariant(repos, ctx, {
        orgId,
        productId: product.id,
        sku: "TSHIRT-X",
        optionValues: { Size: "XL" },
      }),
    ).rejects.toMatchObject({ code: "VARIANT_OPTIONS_MISMATCH" });
    await addVariant(repos, ctx, {
      orgId,
      productId: product.id,
      sku: "TSHIRT-S",
      optionValues: { Size: "S" },
    });
    await expect(
      addVariant(repos, ctx, {
        orgId,
        productId: product.id,
        sku: "TSHIRT-S",
        optionValues: { Size: "M" },
      }),
    ).rejects.toMatchObject({ code: "SKU_TAKEN" });
    const foreign = ownerContext("org-other", "user-attacker");
    await expect(
      addVariant(repos, foreign, {
        orgId: "org-other",
        productId: product.id,
        sku: "TSHIRT-STEAL",
        optionValues: {},
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });
});

describe("revisions and status (CAT-004)", () => {
  it("writes a monotonic revision per content update", async () => {
    const { repos, orgId, ctx } = await catalogAdmin();
    const product = await createProduct(repos, ctx, {
      orgId,
      title: "Original",
      slug: "original",
    });
    const first = await updateProduct(repos, ctx, {
      orgId,
      productId: product.id,
      title: "Renamed",
    });
    expect(first.revision.revisionNumber).toBe(1);
    expect(first.product.title).toBe("Renamed");
    const second = await updateProduct(repos, ctx, {
      orgId,
      productId: product.id,
      seoTitle: "Renamed — Shop",
    });
    expect(second.revision.revisionNumber).toBe(2);
    const revisions = await repos.revisions.listByProduct(orgId, product.id);
    expect(revisions.map((r) => r.revisionNumber)).toEqual([1, 2]);
  });

  it("enforces the status state machine", async () => {
    const { repos, orgId, ctx } = await catalogAdmin();
    const product = await createProduct(repos, ctx, {
      orgId,
      title: "P",
      slug: "p",
    });
    const active = await transitionProductStatus(repos, ctx, {
      orgId,
      productId: product.id,
      status: "ACTIVE",
    });
    expect(active.status).toBe("ACTIVE");
    await expect(
      transitionProductStatus(repos, ctx, {
        orgId,
        productId: product.id,
        status: "DRAFT",
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_TRANSITION_INVALID" });
  });
});

describe("categories and collections (CAT-002)", () => {
  it("nests categories within the same organization", async () => {
    const { repos, orgId, ctx } = await catalogAdmin();
    const root = await createCategory(repos, ctx, {
      orgId,
      name: "Apparel",
      slug: "apparel",
    });
    const child = await createCategory(repos, ctx, {
      orgId,
      parentId: root.id,
      name: "Shirts",
      slug: "shirts",
    });
    expect(child.parentId).toBe(root.id);
  });

  it("rejects foreign parents and excessive depth", async () => {
    const { repos, orgId, ctx } = await catalogAdmin();
    const foreign = await catalogAdmin();
    await expect(
      createCategory(repos, ctx, {
        orgId,
        parentId: (
          await createCategory(foreign.repos, foreign.ctx, {
            orgId: foreign.orgId,
            name: "Foreign",
            slug: "foreign",
          })
        ).id,
        name: "X",
        slug: "x",
      }),
    ).rejects.toMatchObject({ code: "CATEGORY_NOT_FOUND" });

    let parentId: string | undefined;
    for (const slug of ["l1", "l2", "l3", "l4", "l5"]) {
      const node = await createCategory(repos, ctx, {
        orgId,
        parentId,
        name: slug,
        slug,
      });
      parentId = node.id;
    }
    await expect(
      createCategory(repos, ctx, { orgId, parentId, name: "l6", slug: "l6" }),
    ).rejects.toMatchObject({ code: "CATEGORY_DEPTH_EXCEEDED" });
  });

  it("adds only own-organization products to a collection", async () => {
    const { repos, orgId, ctx } = await catalogAdmin();
    const product = await createProduct(repos, ctx, {
      orgId,
      title: "P",
      slug: "p",
    });
    const foreign = await catalogAdmin();
    const foreignProduct = await createProduct(foreign.repos, foreign.ctx, {
      orgId: foreign.orgId,
      title: "F",
      slug: "f",
    });
    const collection = await createCollection(repos, ctx, {
      orgId,
      name: "Featured",
      slug: "featured",
    });
    await expect(
      addProductsToCollection(repos, ctx, {
        orgId,
        collectionId: collection.id,
        productIds: [product.id, foreignProduct.id],
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
    await addProductsToCollection(repos, ctx, {
      orgId,
      collectionId: collection.id,
      productIds: [product.id],
    });
    expect(await repos.collections.listProductIds(orgId, collection.id)).toEqual([
      product.id,
    ]);
  });
});

describe("asset pipeline (CAT-003)", () => {
  it("registers assets under the org namespace after policy checks", async () => {
    const { repos, orgId, ctx } = await catalogAdmin();
    const asset = await registerAsset(repos, ctx, {
      orgId,
      kind: "IMAGE",
      mime: "image/webp",
      sizeBytes: 1024,
    });
    expect(asset.storageKey.startsWith(`org/${orgId}/image/`)).toBe(true);
    await expect(
      registerAsset(repos, ctx, {
        orgId,
        kind: "IMAGE",
        mime: "image/svg+xml",
        sizeBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: "ASSET_MIME_NOT_ALLOWED" });
    await expect(
      registerAsset(repos, ctx, {
        orgId,
        kind: "VIDEO",
        mime: "video/mp4",
        sizeBytes: 600 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ code: "ASSET_TOO_LARGE" });
  });
});

describe("import (W2)", () => {
  it("imports valid rows and reports per-row failures", async () => {
    const { repos, orgId, ctx } = await catalogAdmin();
    const result = await importProducts(repos, ctx, {
      orgId,
      products: [
        { title: "A", slug: "a" },
        { title: "B", slug: "b" },
        { title: "dup", slug: "a" },
        {
          title: "bad",
          slug: "bad",
          options: [{ name: "Size", values: [] }],
        },
      ],
    });
    expect(result.created).toBe(2);
    expect(result.failed).toEqual([
      { index: 2, code: "PRODUCT_SLUG_TAKEN", message: "duplicate slug a" },
      { index: 3, code: "PRODUCT_OPTIONS_INVALID", message: expect.any(String) },
    ]);
    const audit = await repos.audit.listByOrg(orgId);
    expect(audit.some((e) => e.action === "products.imported")).toBe(true);
  });
});

describe("catalog queries", () => {
  it("returns a product with its variants and the org product list", async () => {
    const { repos, orgId, ctx } = await catalogAdmin();
    const product = await createProduct(repos, ctx, {
      orgId,
      title: "P",
      slug: "p",
      options: [{ name: "Size", values: ["S", "M"] }],
    });
    await addVariant(repos, ctx, {
      orgId,
      productId: product.id,
      sku: "P-S",
      optionValues: { Size: "S" },
    });
    const detail = await getProduct(repos, ctx, {
      orgId,
      productId: product.id,
    });
    expect(detail.product.slug).toBe("p");
    expect(detail.variants).toHaveLength(1);
    const list = await listProducts(repos, ctx, { orgId });
    expect(list).toHaveLength(1);
    const foreign = ownerContext("org-other", "user-attacker");
    await expect(
      getProduct(repos, foreign, { orgId: "org-other", productId: product.id }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });
});
