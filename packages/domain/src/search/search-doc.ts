import { DomainError } from "../errors";

/**
 * Search documents (W11, roadmap §15): the index is DERIVED state built from
 * the outbox. The kernel defines the document shape and a deterministic
 * in-memory resolver; production swaps the repository for a Meilisearch /
 * Typesense adapter behind the same port (Atlas §13).
 */

export type SearchDocumentKind = "product" | "page";

export interface SearchDocument {
  orgId: string;
  kind: SearchDocumentKind;
  entityId: string;
  slug: string;
  locale: string;
  title: string;
  body: string;
  /** Facets. */
  currency: string | null;
  priceMinor: bigint | null;
  collectionIds: string[];
  published: boolean;
  updatedAt: Date;
}

export interface SearchQuery {
  text?: string;
  kind?: SearchDocumentKind;
  collectionId?: string;
  limit?: number;
}

export interface ScoredDocument {
  document: SearchDocument;
  score: number;
}

const TERM_WEIGHT_TITLE = 3;
const TERM_WEIGHT_BODY = 1;

function occurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  const lowerHay = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let count = 0;
  let position = lowerHay.indexOf(lowerNeedle);
  while (position !== -1) {
    count += 1;
    position = lowerHay.indexOf(lowerNeedle, position + lowerNeedle.length);
  }
  return count;
}

/**
 * Deterministic scoring: per-term title hits weigh 3×, body hits 1×;
 * documents without any term match are excluded. Equal scores break by id.
 */
export function searchDocuments(
  documents: SearchDocument[],
  query: SearchQuery,
): ScoredDocument[] {
  if (query.limit !== undefined && query.limit < 1) {
    throw new DomainError("SEARCH_QUERY_INVALID", "limit must be ≥ 1");
  }
  const terms = (query.text ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);

  const scored: ScoredDocument[] = [];
  for (const document of documents) {
    if (!document.published) continue;
    if (query.kind && document.kind !== query.kind) continue;
    if (query.collectionId && !document.collectionIds.includes(query.collectionId)) {
      continue;
    }
    let score = 0;
    for (const term of terms) {
      score += TERM_WEIGHT_TITLE * occurrences(document.title, term);
      score += TERM_WEIGHT_BODY * occurrences(document.body, term);
    }
    if (terms.length > 0 && score === 0) continue;
    scored.push({ document, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.document.entityId < b.document.entityId ? -1 : 1),
  );
  return query.limit !== undefined ? scored.slice(0, query.limit) : scored;
}
