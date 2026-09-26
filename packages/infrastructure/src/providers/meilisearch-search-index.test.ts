import { describe, expect, it } from "vitest";
import { DomainError } from "@finalshop/domain";
import type { SearchDocument } from "@finalshop/application";
import { MeilisearchSearchIndex } from "./meilisearch-search-index";

function fakeFetch(respond: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const calls: Array<{ url: string; init?: RequestInit | undefined }> = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const { status, body } = respond(url, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetchFn };
}

const document: SearchDocument = {
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
  updatedAt: new Date("2026-09-26T12:00:00Z"),
};

const _unusedIndex = new MeilisearchSearchIndex(
  "https://search.example.com",
  "unit-test-search-auth",
  "catalog",
  fakeFetch(() => ({ status: 200, body: { estimatedTotalHits: 0, hits: [] } })).fetchFn,
);

describe("MeilisearchSearchIndex (Atlas §13 adapter)", () => {
  it("upserts documents with the composite tenant-scoped id", async () => {
    const { calls, fetchFn } = fakeFetch(() => ({ status: 202, body: { taskUid: 1 } }));
    const meili = new MeilisearchSearchIndex(
      "https://search.example.com",
      "unit-test-search-auth",
      "catalog",
      fetchFn,
    );
    await meili.upsert(document);
    const body = JSON.parse(calls[0]?.init?.body as string) as Array<Record<string, unknown>>;
    expect(body[0]?.id).toBe("org-1:product:prd-1");
    expect(body[0]?.priceMinor).toBe("2500");
  });

  it("searches with enforced tenant and facet filters", async () => {
    const { calls, fetchFn } = fakeFetch(() => ({
      status: 200,
      body: {
        hits: [
          {
            id: "org-1:product:prd-1",
            orgId: "org-1",
            kind: "product",
            entityId: "prd-1",
            slug: "tee",
            locale: "en",
            title: "Classic Tee",
            body: "soft cotton",
            currency: "USD",
            priceMinor: "2500",
            collectionIds: ["col-1"],
            published: true,
            updatedAt: "2026-09-26T12:00:00Z",
          },
        ],
      },
    }));
    const meili = new MeilisearchSearchIndex(
      "https://search.example.com",
      "unit-test-search-auth",
      "catalog",
      fetchFn,
    );
    const results = await meili.search("org-1", {
      text: "tee",
      kind: "product",
      collectionId: "col-1",
      limit: 10,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.priceMinor).toBe(2500n);
    const body = JSON.parse(calls[0]?.init?.body as string) as {
      q: string;
      filter: string;
      limit: number;
    };
    expect(body.q).toBe("tee");
    expect(body.filter).toContain('orgId = "org-1"');
    expect(body.filter).toContain('kind = "product"');
    expect(body.filter).toContain('published = true');
    expect(body.filter).toContain('collectionIds IN ["col-1"]');
  });

  it("surfaces provider failures as domain errors", async () => {
    const failing = new MeilisearchSearchIndex(
      "https://search.example.com",
      "unit-test-search-auth",
      "catalog",
      fakeFetch(() => ({ status: 500, body: { message: "index not found" } })).fetchFn,
    );
    await expect(failing.upsert(document)).rejects.toBeInstanceOf(DomainError);
  });
});
