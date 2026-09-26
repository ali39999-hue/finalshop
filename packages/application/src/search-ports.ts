import type { OutboxEventRecord, OutboxEventType, SearchDocument, SearchQuery } from "@finalshop/domain";

export type { OutboxEventRecord, OutboxEventType, SearchDocument, SearchQuery };

/**
 * Search/outbox ports (W11). The search index is derived state; production
 * swaps SearchIndexRepository for a Meilisearch/Typesense adapter.
 */

export interface OutboxRepository {
  enqueue(event: {
    id: string;
    orgId: string;
    type: OutboxEventType;
    payload: Record<string, unknown>;
  }): Promise<OutboxEventRecord>;
  listPending(orgId: string | null, limit?: number): Promise<OutboxEventRecord[]>;
  markProcessed(input: { id: string; orgId: string }): Promise<void>;
  incrementAttempts(input: { id: string; orgId: string }): Promise<void>;
}

export interface SearchIndexRepository {
  upsert(document: SearchDocument): Promise<void>;
  remove(input: { orgId: string; kind: SearchDocument["kind"]; entityId: string }): Promise<void>;
  search(orgId: string, query: SearchQuery): Promise<SearchDocument[]>;
}
