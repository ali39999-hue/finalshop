import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type PluginManifest,
  type TenantContext,
  assertWebhookUrl,
  buildAuditEvent,
  signWebhookPayload,
  validatePluginManifest,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

const ManifestInput = z.object({
  name: z.string().min(2).max(64),
  version: z.string().min(5).max(20),
  requiredCoreVersion: z.string().min(5).max(20),
  permissions: z.array(z.string().max(100)).max(20),
  eventsSubscribe: z.array(z.string().max(100)).max(20),
  uiSlots: z.array(z.string().max(100)).max(20),
  routes: z.array(z.string().max(200)).max(50),
  jobs: z.array(z.string().max(100)).max(20),
  configSchema: z.record(z.string(), z.unknown()).optional(),
});

/** W13: installs a plugin after full manifest validation (T-09). */
export async function installPlugin(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; manifest: z.input<typeof ManifestInput> },
) {
  const parsed = z
    .object({ orgId: z.string().min(1), manifest: ManifestInput })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "extension.manage");
  const actor = requireUserId(ctx);
  const manifest = parsed.manifest as unknown as PluginManifest;
  validatePluginManifest(manifest);

  const duplicates = await repos.plugins.listByOrg(parsed.orgId);
  if (duplicates.some((p) => p.manifest.name === manifest.name)) {
    throw new DomainError(
      "PLUGIN_ALREADY_INSTALLED",
      `plugin ${manifest.name} is already installed`,
    );
  }
  const plugin = await repos.plugins.install({ orgId: parsed.orgId, manifest });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "extension.plugin_installed",
      subjectType: AUDIT_SUBJECTS.PLUGIN,
      subjectId: plugin.id,
      after: { name: manifest.name, version: manifest.version },
    }),
  );
  return plugin;
}

const PluginIdInput = z.object({
  orgId: z.string().min(1),
  pluginId: z.string().min(1),
});

async function loadPlugin(repos: Repositories, orgId: string, pluginId: string) {
  const plugin = await repos.plugins.findById(pluginId);
  if (!plugin || plugin.orgId !== orgId) {
    throw new DomainError("PLUGIN_NOT_FOUND", `plugin ${pluginId} not found`);
  }
  return plugin;
}

export async function setPluginStatus(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof PluginIdInput> & { status: "ENABLED" | "DISABLED" },
) {
  const parsed = PluginIdInput.extend({
    status: z.enum(["ENABLED", "DISABLED"]),
  }).parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "extension.manage");
  const actor = requireUserId(ctx);
  const plugin = await repos.plugins.setStatus({
    id: parsed.pluginId,
    orgId: parsed.orgId,
    status: parsed.status,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: parsed.status === "ENABLED" ? "extension.plugin_enabled" : "extension.plugin_disabled",
      subjectType: AUDIT_SUBJECTS.PLUGIN,
      subjectId: plugin.id,
      after: { status: parsed.status },
    }),
  );
  return plugin;
}

/** Removes the plugin row together with its webhook subscriptions. */
export async function uninstallPlugin(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof PluginIdInput>,
) {
  const parsed = PluginIdInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "extension.manage");
  const actor = requireUserId(ctx);
  const plugin = await loadPlugin(repos, parsed.orgId, parsed.pluginId);
  await repos.plugins.remove({ id: plugin.id, orgId: parsed.orgId });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "extension.plugin_uninstalled",
      subjectType: AUDIT_SUBJECTS.PLUGIN,
      subjectId: plugin.id,
      before: { name: plugin.manifest.name },
    }),
  );
}

const SubscriptionInput = z.object({
  orgId: z.string().min(1),
  url: z.string().min(8).max(500),
  events: z.array(z.string().min(3).max(100)).min(1).max(20),
});

/** Registers an outbound webhook endpoint (HTTPS, non-private — T-04). */
export async function createWebhookSubscription(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof SubscriptionInput>,
) {
  const parsed = SubscriptionInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "extension.manage");
  requireUserId(ctx);
  assertWebhookUrl(parsed.url);
  const secret = `whsec_${randomUUID()}${randomUUID()}`;
  return repos.webhookSubscriptions.create({
    orgId: parsed.orgId,
    url: parsed.url,
    events: parsed.events,
    secret,
  });
}

/**
 * W13 worker command: pairs pending outbox events with matching active
 * subscriptions and creates signed webhook deliveries. The HTTP POST itself
 * is performed by the delivery worker (infra), which marks each delivery.
 */
export async function dispatchOutboundWebhooks(
  repos: Repositories,
  input: { limit?: number } = {},
) {
  const pending = await repos.outbox.listPending(null, input.limit ?? 100);
  let deliveries = 0;
  for (const event of pending) {
    const subscriptions = await repos.webhookSubscriptions.listActiveForEvent(
      event.orgId,
      event.type,
    );
    for (const subscription of subscriptions) {
      const timestampMs = Date.now();
      const payload = JSON.stringify({ type: event.type, data: event.payload });
      const signature = signWebhookPayload({
        secret: subscription.secret,
        timestampMs,
        payload,
      });
      await repos.webhookDeliveries.create({
        orgId: event.orgId,
        subscriptionId: subscription.id,
        outboxEventId: event.id,
        eventType: event.type,
        payload: { type: event.type, data: event.payload },
        signature,
        timestampMs,
      });
      deliveries += 1;
    }
    await repos.outbox.markProcessed({ id: event.id, orgId: event.orgId });
  }
  return { deliveries, scanned: pending.length };
}
