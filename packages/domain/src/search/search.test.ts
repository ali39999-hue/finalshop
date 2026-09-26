import { describe, expect, it } from "vitest";
import { newOutboxEvent } from "./outbox";
import { searchDocuments, type SearchDocument } from "./search-doc";
import { buildProductJsonLd, buildSitemapXml, canonicalUrl } from "../seo/seo";

function doc(overrides?: Partial<SearchDocument>): SearchDocument {
  return {
    orgId: "org-1",
    kind: "product",
    entityId: "prd-1",
    slug: "tee",
    locale: "en",
    title: "Classic Tee",
    body: "soft cotton",
    currency: "USD",
    priceMinor: 2500n,
    collectionIds: ["col-1"],
    published: true,
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe("outbox (W11)", () => {
  it("creates frozen pending events", () => {
    const event = newOutboxEvent({
      id: "evt-1",
      orgId: "org-1",
      type: "product.changed",
      payload: { entityId: "prd-1" },
    });
    expect(event.processedAt).toBeNull();
    expect(event.attempts).toBe(0);
    expect(Object.isFrozen(event)).toBe(true);
  });
});

describe("search (W11)", () => {
  const documents = [
    doc(),
    doc({ entityId: "prd-2", slug: "hoodie", title: "Heavy Hoodie", body: "warm fleece", collectionIds: [] }),
    doc({ entityId: "page-1", kind: "page", slug: "about", title: "About us", body: "cotton story", collectionIds: [] }),
    doc({ entityId: "prd-3", slug: "draft", title: "Unpublished tee", published: false }),
  ];

  it("matches title terms with a higher weight than body terms", () => {
    const results = searchDocuments(documents, { text: "tee" });
    expect(results[0]?.document.entityId).toBe("prd-1");
    expect(results[0]?.score).toBe(3);
    expect(results.map((r) => r.document.entityId)).not.toContain("prd-3");
  });

  it("applies kind and facet filters", () => {
    const pages = searchDocuments(documents, { text: "cotton", kind: "page" });
    expect(pages.map((r) => r.document.entityId)).toEqual(["page-1"]);
    const inCollection = searchDocuments(documents, { collectionId: "col-1" });
    expect(inCollection).toHaveLength(1);
  });

  it("applies limits", () => {
    const results = searchDocuments(documents, { text: "tee", limit: 1 });
    expect(results).toHaveLength(1);
  });
});

describe("seo (W11)", () => {
  it("builds canonical urls with locale prefixes", () => {
    expect(canonicalUrl("https://shop.example.com/", "en", "products/tee")).toBe(
      "https://shop.example.com/en/products/tee",
    );
  });

  it("generates valid sitemap xml with escaping", () => {
    const xml = buildSitemapXml([
      { loc: "https://shop.example.com/en/home", changefreq: "weekly", priority: "1.0" },
      { loc: 'https://shop.example.com/en/a?b=1&c=2', lastmod: "2026-09-26T00:00:00.000Z" },
    ]);
    expect(xml).toContain("<loc>https://shop.example.com/en/home</loc>");
    expect(xml).toContain("&amp;c=2");
    expect(xml).toContain("<priority>1.0</priority>");
  });

  it("renders JSON-LD offers with decimal major prices", () => {
    const jsonLd = buildProductJsonLd({
      name: "Tee",
      url: "https://shop.example.com/en/tee",
      priceMinor: 2500n,
      currency: "USD",
      currencyDecimals: 2,
      inStock: true,
    });
    expect(jsonLd.offers).toMatchObject({ price: "25.00", priceCurrency: "USD" });
    const outOfStock = buildProductJsonLd({
      name: "Tee",
      url: "x",
      priceMinor: null,
      currency: "USD",
      currencyDecimals: 2,
      inStock: false,
    });
    expect(outOfStock.offers).toBeUndefined();
  });
});
