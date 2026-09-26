import {
  Prisma,
  type AnalyticsEvent as AnalyticsEventRow,
  type PrismaClient,
  type RateLimitPolicy as RateLimitPolicyRow,
} from "@prisma/client";
import type {
  AnalyticsEventRecord,
  AnalyticsEventRepository,
  RateLimitCounterRepository,
  RateLimitPolicyRecord,
  RateLimitPolicyRepository,
} from "@finalshop/application";

const toAnalyticsEvent = (row: AnalyticsEventRow): AnalyticsEventRecord => ({
  id: row.id,
  orgId: row.orgId,
  name: row.name,
  version: row.version,
  sessionId: row.sessionId,
  userId: row.userId,
  properties: row.properties as Record<string, unknown>,
  occurredAt: row.occurredAt,
});

const toPolicy = (row: RateLimitPolicyRow): RateLimitPolicyRecord => ({
  id: row.id,
  orgId: row.orgId,
  route: row.route,
  limit: row.limit,
  windowSeconds: row.windowSeconds,
  createdAt: row.createdAt,
});

const json = (value: unknown): Prisma.InputJsonValue =>
  value as unknown as Prisma.InputJsonValue;

/** Prisma implementations of the analytics/rate-limit ports (W12/W14). */
export function createAnalyticsRepositories(db: PrismaClient): {
  analyticsEvents: AnalyticsEventRepository;
  rateLimitPolicies: RateLimitPolicyRepository;
  rateLimitCounters: RateLimitCounterRepository;
} {
  const analyticsEvents: AnalyticsEventRepository = {
    append: async (input) => {
      const row = await db.analyticsEvent.create({
        data: {
          orgId: input.orgId,
          name: input.name,
          version: input.version,
          sessionId: input.sessionId,
          ...(input.userId !== undefined && { userId: input.userId }),
          properties: json(input.properties),
          occurredAt: input.occurredAt,
        },
      });
      return toAnalyticsEvent(row);
    },
    listByNames: async (input) => {
      const rows = await db.analyticsEvent.findMany({
        where: {
          orgId: input.orgId,
          name: { in: input.names },
          occurredAt: { gte: input.from, lte: input.to },
        },
        orderBy: { occurredAt: "asc" },
        take: input.limit ?? 10_000,
      });
      return rows.map(toAnalyticsEvent);
    },
  };

  const rateLimitPolicies: RateLimitPolicyRepository = {
    upsert: async (input) => {
      const row = await db.rateLimitPolicy.upsert({
        where: { orgId_route: { orgId: input.orgId, route: input.route } },
        create: input,
        update: { limit: input.limit, windowSeconds: input.windowSeconds },
      });
      return toPolicy(row);
    },
    find: async (orgId, route) => {
      const row = await db.rateLimitPolicy.findUnique({
        where: { orgId_route: { orgId, route } },
      });
      return row ? toPolicy(row) : null;
    },
    listByOrg: async (orgId) => {
      const rows = await db.rateLimitPolicy.findMany({
        where: { orgId },
        orderBy: { route: "asc" },
      });
      return rows.map(toPolicy);
    },
  };

  const rateLimitCounters: RateLimitCounterRepository = {
    incrementHits: async (input) => {
      // Atomic increment via upsert — the counter is the concurrency point.
      const rows = await db.$queryRaw<Array<{ hits: number }>>`
        INSERT INTO "RateLimitCounter" ("id", "orgId", "route", "windowKey", "hits")
        VALUES (${randomId()}, ${input.orgId}, ${input.route}, ${input.windowKey}, 1)
        ON CONFLICT ("orgId", "route", "windowKey")
        DO UPDATE SET "hits" = "RateLimitCounter"."hits" + 1
        RETURNING "hits"`;
      return Number(rows[0]?.hits ?? 0);
    },
  };

  return { analyticsEvents, rateLimitPolicies, rateLimitCounters };
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
