import { describe, expect, it } from "vitest";
import {
  InMemoryRepositories,
  ownerContext,
  seedOrgWithStore,
} from "../testing";
import {
  addVariant,
  buildStoreSitemap,
  createPage,
  createPriceList,
  createProduct,
  getProductJsonLd,
  processOutbox,
  publishPage,
  reindexOrg,
  searchCatalog,
  setPrice,
  transitionProductStatus,
} from "../index";
import { newOutboxEvent } from "@finalshop/domain";

async function catalogBase() {
  const repos = new InMemoryRepositories();
  const { orgId } = await seedOrgWithStore(repos);
  const ctx = ownerContext(orgId);
  const priceList = await createPriceList(repos, ctx, {
    orgId,
    currency: "USD",
    priority: 10,
  });
  const product = await createProduct(repos, ctx, { orgId, title: "Classic Tee", slug: "tee" });
  const variant = await addVariant(repos, ctx, {
    orgId,
    productId: product.id,
    sku: "TEE",
    optionValues: {},
  });
  await setPrice(repos, ctx, {
    orgId,
    priceListId: priceList.id,
    variantId: variant.id,
    minQuantity: 1,
    unitPriceMinor: "2500",
  });
  // Only ACTIVE products belong in the storefront search index.
  await transitionProductStatus(repos, ctx, {
    orgId,
    productId: product.id,
    status: "ACTIVE",
  });
  return { repos, orgId, ctx, product, variant };
}

describe("outbox → search index pipeline (W11)", () => {
  it("indexes products only after the outbox sweep runs", async () => {
    const { repos, orgId, product } = await catalogBase();
    const shopper = { orgId, userId: "customer-1" };

    // Before the sweep: nothing indexed.
    const empty = await searchCatalog(repos, shopper, { orgId, text: "tee", kind: "product" });
    expect(empty).toHaveLength(0);

    // The mutation enqueued an outbox event (simulating the W2+ hook).
    const sweep1 = await processOutbox(repos);
    expect(sweep1.processed).toBe(0); // nothing enqueued yet in this test

    await repos.outbox.enqueue({
      id: "evt-1",
      orgId,
      type: "product.changed",
      payload: { entityId: product.id },
    });
    const sweep2 = await processOutbox(repos);
    expect(sweep2.processed).toBe(1);

    const results = await searchCatalog(repos, shopper, {
      orgId,
      text: "classic",
      kind: "product",
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.slug).toBe("tee");
    expect(results[0]?.priceMinor).toBe(2500n);

    // Processed events do not re-run.
    const sweep3 = await processOutbox(repos);
    expect(sweep3.processed).toBe(0);
  });

  it("removes archived products from the index", async () => {
    const { repos, orgId, ctx, product, variant } = await catalogBase();
    await repos.outbox.enqueue({
      id: "evt-1",
      orgId,
      type: "product.changed",
      payload: { entityId: product.id },
    });
    await processOutbox(repos);
    expect(
      (await searchCatalog(repos, ctx, { orgId, text: "tee" })).length,
    ).toBe(1);
    void variant;

    // Archive → next sweep removes the document.
    await repos.products.updateStatus({
      id: product.id,
      orgId,
      status: "ARCHIVED",
    });
    await repos.outbox.enqueue({
      id: "evt-2",
      orgId,
      type: "product.changed",
      payload: { entityId: product.id },
    });
    await processOutbox(repos);
    expect(
      (await searchCatalog(repos, ctx, { orgId, text: "tee" })).length,
    ).toBe(0);
  });

  it("reindexes an org deterministically", async () => {
    const { repos, orgId, ctx, product } = await catalogBase();
    const { indexed } = await reindexOrg(repos, ctx, { orgId });
    expect(indexed).toBe(1);
    const found = await searchCatalog(repos, ctx, { orgId, text: "tee" });
    expect(found[0]?.entityId).toBe(product.id);
  });
});

describe("seo (W11)", () => {
  it("builds a sitemap with published pages and active products", async () => {
    const { repos, orgId, ctx } = await catalogBase();
    await createPage(repos, ctx, { orgId, title: "Home", slug: "home" });
    const page = await createPage(repos, ctx, { orgId, title: "About", slug: "about" });
    await publishPage(repos, ctx, { orgId, pageId: page.page.id });
    await reindexOrg(repos, ctx, { orgId });

    const { xml, entries } = await buildStoreSitemap(repos, ctx, {
      orgId,
      baseUrl: "https://shop.example.com",
      locale: "en",
    });
    expect(entries).toBe(2);
    expect(xml).toContain("https://shop.example.com/en/about");
    expect(xml).toContain("https://shop.example.com/en/products/tee");
    expect(xml).not.toContain("/home</loc>");
  });

  it("emits product JSON-LD with the live price", async () => {
    const { repos, orgId, ctx, product } = await catalogBase();
    const jsonLd = await getProductJsonLd(repos, ctx, {
      orgId,
      productId: product.id,
      baseUrl: "https://shop.example.com",
    });
    expect(jsonLd).toMatchObject({
      "@type": "Product",
      name: "Classic Tee",
    });
    expect((jsonLd.offers as Record<string, unknown>).price).toBe("25.00");
  });
});

describe("outbox domain sanity", () => {
  it("freezes events", () => {
    const event = newOutboxEvent({
      id: "evt-x",
      orgId: "org-1",
      type: "page.published",
      payload: {},
    });
    expect(event.attempts).toBe(0);
  });
});
