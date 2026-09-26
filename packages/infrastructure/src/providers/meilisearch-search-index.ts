import { DomainError } from "@finalshop/domain";
import type {
  SearchDocument,
  SearchIndexRepository,
  SearchQuery,
} from "@finalshop/application";

/**
 * Meilisearch adapter (W11/W13, Atlas §13): swaps the DB-backed index for a
 * real search engine behind the same SearchIndexRepository port. Talks to
 * the Meilisearch REST API with fetch (no SDK). The HTTP function is
 * injected so unit tests run offline.
 *
 * Document primary key: `${orgId}:${kind}:${entityId}` — tenant-scoped ids
 * keep one index servable for all orgs with an `orgId` filter enforced at
 * query time.
 */

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface MeiliHit {
  id: string;
  orgId: string;
  kind: string;
  entityId: string;
  slug: string;
  locale: string;
  title: string;
  body: string;
  currency: string | null;
  priceMinor: string | null;
  collectionIds: string[];
  published: boolean;
  updatedAt: string;
}

const docId = (document: SearchDocument): string =>
  `${document.orgId}:${document.kind}:${document.entityId}`;

function toMeiliDocument(document: SearchDocument): Record<string, unknown> {
  return {
    id: docId(document),
    orgId: document.orgId,
    kind: document.kind,
    entityId: document.entityId,
    slug: document.slug,
    locale: document.locale,
    title: document.title,
    body: document.body,
    currency: document.currency,
    priceMinor: document.priceMinor === null ? null : document.priceMinor.toString(),
    collectionIds: document.collectionIds,
    published: document.published,
    updatedAt: document.updatedAt.toISOString(),
  };
}

function fromMeiliHit(hit: MeiliHit): SearchDocument {
  return {
    orgId: hit.orgId,
    kind: hit.kind as SearchDocument["kind"],
    entityId: hit.entityId,
    slug: hit.slug,
    locale: hit.locale,
    title: hit.title,
    body: hit.body,
    currency: hit.currency,
    priceMinor: hit.priceMinor === null ? null : BigInt(hit.priceMinor),
    collectionIds: hit.collectionIds,
    published: hit.published,
    updatedAt: new Date(hit.updatedAt),
  };
}

export class MeilisearchSearchIndex implements SearchIndexRepository {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly indexUid: string,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new DomainError(
        "SEARCH_PROVIDER_ERROR",
        `meilisearch ${response.status}: ${detail.slice(0, 200)}`,
      );
    }
    return (await response.json()) as T;
  }

  /** One-time provisioning: creates the index and facet attributes. */
  async ensureIndex(): Promise<void> {
    await this.request(`/indexes`, {
      method: "POST",
      body: JSON.stringify({ uid: this.indexUid, primaryKey: "id" }),
    }).catch(() => {
      // index already exists — Meilisearch answers 409/202 variants
    });
    await this.request(`/indexes/${this.indexUid}/settings`, {
      method: "PATCH",
      body: JSON.stringify({
        filterableAttributes: ["orgId", "kind", "published", "collectionIds"],
        searchableAttributes: ["title", "body", "slug"],
      }),
    });
  }

  async upsert(document: SearchDocument): Promise<void> {
    await this.request(`/indexes/${this.indexUid}/documents`, {
      method: "POST",
      body: JSON.stringify([toMeiliDocument(document)]),
    });
  }

  async remove(input: {
    orgId: string;
    kind: SearchDocument["kind"];
    entityId: string;
  }): Promise<void> {
    const id = docId({
      orgId: input.orgId,
      kind: input.kind,
      entityId: input.entityId,
    } as SearchDocument);
    await this.request(`/indexes/${this.indexUid}/documents/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async search(orgId: string, query: SearchQuery): Promise<SearchDocument[]> {
    const filters = [`orgId = "${orgId.replace(/"/g, "")}"`, `published = true`];
    if (query.kind) filters.push(`kind = "${query.kind}"`);
    if (query.collectionId) filters.push(`collectionIds IN ["${query.collectionId}"]`);

    const result = await this.request<{ hits: MeiliHit[] }>(
      `/indexes/${this.indexUid}/search`,
      {
        method: "POST",
        body: JSON.stringify({
          ...(query.text !== undefined && { q: query.text }),
          filter: filters.join(" AND "),
          limit: query.limit ?? 50,
        }),
      },
    );
    return result.hits.map(fromMeiliHit);
  }
}
