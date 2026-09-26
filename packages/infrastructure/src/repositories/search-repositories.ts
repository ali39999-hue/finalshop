import {
  Prisma,
  type OutboxEvent,
  type PrismaClient,
  type SearchDocument as SearchDocumentRow,
} from "@prisma/client";
import type {
  OutboxEventRecord,
  OutboxEventType,
  OutboxRepository,
  SearchDocument,
  SearchIndexRepository,
} from "@finalshop/application";

const toOutbox = (row: OutboxEvent): OutboxEventRecord => ({
  id: row.id,
  orgId: row.orgId,
  type: row.type as OutboxEventType,
  payload: row.payload as Record<string, unknown>,
  createdAt: row.createdAt,
  processedAt: row.processedAt,
  attempts: row.attempts,
});

const toSearchDocument = (row: SearchDocumentRow): SearchDocument => ({
  orgId: row.orgId,
  kind: row.kind as SearchDocument["kind"],
  entityId: row.entityId,
  slug: row.slug,
  locale: row.locale,
  title: row.title,
  body: row.body,
  currency: row.currency,
  priceMinor: row.priceMinor,
  collectionIds: row.collectionIds as unknown as string[],
  published: row.published,
  updatedAt: row.updatedAt,
});

const json = (value: unknown): Prisma.InputJsonValue =>
  value as unknown as Prisma.InputJsonValue;

/**
 * Prisma implementations of the outbox/search ports (W11). The in-memory
 * resolver inside SearchIndexRepository.search (via the domain scorer) keeps
 * this swap-compatible with a Meilisearch adapter later (Atlas §13).
 */
export function createSearchRepositories(db: PrismaClient): {
  outbox: OutboxRepository;
  searchIndex: SearchIndexRepository;
} {
  const outbox: OutboxRepository = {
    enqueue: async (input) => {
      const row = await db.outboxEvent.create({
        data: {
          orgId: input.orgId,
          type: input.type,
          payload: json(input.payload),
        },
      });
      return toOutbox(row);
    },
    listPending: async (orgId, limit = 100) => {
      const rows = await db.outboxEvent.findMany({
        where: {
          ...(orgId ? { orgId } : {}),
          processedAt: null,
        },
        orderBy: { createdAt: "asc" },
        take: limit,
      });
      return rows.map(toOutbox);
    },
    markProcessed: async (input) => {
      await db.outboxEvent.updateMany({
        where: { id: input.id, orgId: input.orgId, processedAt: null },
        data: { processedAt: new Date() },
      });
    },
    incrementAttempts: async (input) => {
      await db.outboxEvent.updateMany({
        where: { id: input.id, orgId: input.orgId, processedAt: null },
        data: { attempts: { increment: 1 } },
      });
    },
  };

  const searchIndex: SearchIndexRepository = {
    upsert: async (document) => {
      await db.searchDocument.upsert({
        where: {
          orgId_kind_entityId: {
            orgId: document.orgId,
            kind: document.kind,
            entityId: document.entityId,
          },
        },
        create: {
          orgId: document.orgId,
          kind: document.kind,
          entityId: document.entityId,
          slug: document.slug,
          locale: document.locale,
          title: document.title,
          body: document.body,
          currency: document.currency,
          priceMinor: document.priceMinor,
          collectionIds: json(document.collectionIds),
          published: document.published,
        },
        update: {
          slug: document.slug,
          locale: document.locale,
          title: document.title,
          body: document.body,
          currency: document.currency,
          priceMinor: document.priceMinor,
          collectionIds: json(document.collectionIds),
          published: document.published,
        },
      });
    },
    remove: async (input) => {
      await db.searchDocument.deleteMany({
        where: {
          orgId: input.orgId,
          kind: input.kind,
          entityId: input.entityId,
        },
      });
    },
    search: async (orgId, query) => {
      const rows = await db.searchDocument.findMany({
        where: {
          orgId,
          published: true,
          ...(query.kind ? { kind: query.kind } : {}),
          ...(query.collectionId
            ? { collectionIds: { array_contains: query.collectionId } }
            : {}),
          ...(query.text
            ? {
                OR: [
                  { title: { contains: query.text } },
                  { body: { contains: query.text } },
                ],
              }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: query.limit ?? 50,
      });
      return rows.map(toSearchDocument);
    },
  };

  return { outbox, searchIndex };
}
