/**
 * Transactional outbox (roadmap §4, §15): every mutation that feeds derived
 * state (search index, webhooks, emails) enqueues an event in the same
 * transaction; a worker drains the outbox and applies it to the derived
 * stores. The outbox is the ONLY bridge into derived state — caches and
 * indexes are never the source of truth (roadmap §19).
 */

export type OutboxEventType =
  | "product.changed"
  | "price.changed"
  | "inventory.changed"
  | "page.published"
  | "page.unpublished";

export interface OutboxEventRecord {
  readonly id: string;
  readonly orgId: string;
  readonly type: OutboxEventType;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
  readonly processedAt: Date | null;
  /** Increased on every failed dispatch; the worker retries on the next sweep. */
  readonly attempts: number;
}

export function newOutboxEvent(input: {
  id: string;
  orgId: string;
  type: OutboxEventType;
  payload: Record<string, unknown>;
  createdAt?: Date;
}): OutboxEventRecord {
  return Object.freeze({
    id: input.id,
    orgId: input.orgId,
    type: input.type,
    payload: { ...input.payload },
    createdAt: input.createdAt ?? new Date(),
    processedAt: null,
    attempts: 0,
  });
}
