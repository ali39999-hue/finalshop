import type {
  Plugin,
  PrismaClient,
  WebhookDelivery,
  WebhookSubscription,
} from "@prisma/client";
import { DomainError } from "@finalshop/domain";
import type {
  PluginManifest,
  PluginRecord,
  PluginRepository,
  PluginStatus,
  WebhookDeliveryRecord,
  WebhookDeliveryRepository,
  WebhookSubscriptionRecord,
  WebhookSubscriptionRepository,
} from "@finalshop/application";

const toPlugin = (row: Plugin): PluginRecord => ({
  id: row.id,
  orgId: row.orgId,
  manifest: row.manifest as unknown as PluginManifest,
  status: row.status as PluginStatus,
  installedAt: row.installedAt,
  updatedAt: row.updatedAt,
});

const toSubscription = (row: WebhookSubscription): WebhookSubscriptionRecord => ({
  id: row.id,
  orgId: row.orgId,
  url: row.url,
  events: row.events as unknown as string[],
  secret: row.secret,
  isActive: row.isActive,
  createdAt: row.createdAt,
});

const toDelivery = (row: WebhookDelivery): WebhookDeliveryRecord => ({
  id: row.id,
  orgId: row.orgId,
  subscriptionId: row.subscriptionId,
  outboxEventId: row.outboxEventId,
  eventType: row.eventType,
  payload: row.payload as Record<string, unknown>,
  signature: row.signature,
  timestampMs: Number(row.timestampMs),
  status: row.status as WebhookDeliveryRecord["status"],
  attempts: row.attempts,
  createdAt: row.createdAt,
  deliveredAt: row.deliveredAt,
});

const json = (value: unknown) => value as never;

/** Prisma implementations of the extension ports (W13). */
export function createExtensionRepositories(db: PrismaClient): {
  plugins: PluginRepository;
  webhookSubscriptions: WebhookSubscriptionRepository;
  webhookDeliveries: WebhookDeliveryRepository;
} {
  const plugins: PluginRepository = {
    install: async (input) => {
      try {
        const row = await db.plugin.create({
          data: {
            orgId: input.orgId,
            name: input.manifest.name,
            manifest: json(input.manifest),
          },
        });
        return toPlugin(row);
      } catch (err) {
        throw rethrowMapped(err, "Plugin_orgId_name_key", "PLUGIN_ALREADY_INSTALLED", input.manifest.name);
      }
    },
    findById: async (id) => {
      const row = await db.plugin.findUnique({ where: { id } });
      return row ? toPlugin(row) : null;
    },
    listByOrg: async (orgId) => {
      const rows = await db.plugin.findMany({
        where: { orgId },
        orderBy: { installedAt: "asc" },
      });
      return rows.map(toPlugin);
    },
    setStatus: async (input) => {
      const existing = await db.plugin.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("PLUGIN_NOT_FOUND", input.id);
      const row = await db.plugin.update({
        where: { id: input.id },
        data: { status: input.status },
      });
      return toPlugin(row);
    },
    remove: async (input) => {
      await db.plugin.deleteMany({ where: { id: input.id, orgId: input.orgId } });
    },
  };

  const webhookSubscriptions: WebhookSubscriptionRepository = {
    create: async (input) => {
      const row = await db.webhookSubscription.create({
        data: {
          orgId: input.orgId,
          url: input.url,
          events: json(input.events),
          secret: input.secret,
        },
      });
      return toSubscription(row);
    },
    setActive: async (input) => {
      const existing = await db.webhookSubscription.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("WEBHOOK_SUBSCRIPTION_NOT_FOUND", input.id);
      const row = await db.webhookSubscription.update({
        where: { id: input.id },
        data: { isActive: input.isActive },
      });
      return toSubscription(row);
    },
    listActiveForEvent: async (orgId, eventType) => {
      const rows = await db.webhookSubscription.findMany({
        where: { orgId, isActive: true, events: { array_contains: eventType } },
      });
      return rows.map(toSubscription);
    },
  };

  const webhookDeliveries: WebhookDeliveryRepository = {
    create: async (input) => {
      const row = await db.webhookDelivery.create({
        data: {
          orgId: input.orgId,
          subscriptionId: input.subscriptionId,
          outboxEventId: input.outboxEventId,
          eventType: input.eventType,
          payload: json(input.payload),
          signature: input.signature,
          timestampMs: input.timestampMs,
        },
      });
      return toDelivery(row);
    },
    markStatus: async (input) => {
      const existing = await db.webhookDelivery.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("WEBHOOK_DELIVERY_NOT_FOUND", input.id);
      const row = await db.webhookDelivery.update({
        where: { id: input.id },
        data: {
          status: input.status,
          attempts: { increment: 1 },
          ...(input.status === "DELIVERED" && { deliveredAt: new Date() }),
        },
      });
      return toDelivery(row);
    },
    listPending: async (limit = 100) => {
      const rows = await db.webhookDelivery.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: limit,
      });
      return rows.map(toDelivery);
    },
  };

  return { plugins, webhookSubscriptions, webhookDeliveries };
}

function rethrowMapped(err: unknown, constraint: string, code: string, value: string): unknown {
  const prismaError = err as { code?: string; meta?: { target?: unknown } };
  if (
    prismaError.code === "P2002" &&
    JSON.stringify(prismaError.meta?.target ?? "").includes(constraint)
  ) {
    return new DomainError(code, `${value} already exists`);
  }
  return err;
}
