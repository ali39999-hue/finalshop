import type { PluginManifest } from "@finalshop/domain";

export type { PluginManifest };

/**
 * Extension ports (W13, roadmap §16). Plugins are capability-scoped records;
 * outbound webhook deliveries carry the signature so the HTTP worker can POST
 * them without touching secrets policy.
 */

export type PluginStatus = "ENABLED" | "DISABLED";

export interface PluginRecord {
  id: string;
  orgId: string;
  manifest: PluginManifest;
  status: PluginStatus;
  installedAt: Date;
  updatedAt: Date;
}

export interface WebhookSubscriptionRecord {
  id: string;
  orgId: string;
  url: string;
  /** Outbox event types this endpoint receives. */
  events: string[];
  secret: string;
  isActive: boolean;
  createdAt: Date;
}

export interface WebhookDeliveryRecord {
  id: string;
  orgId: string;
  subscriptionId: string;
  outboxEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  signature: string;
  timestampMs: number;
  status: "PENDING" | "DELIVERED" | "FAILED";
  attempts: number;
  createdAt: Date;
  deliveredAt: Date | null;
}

export interface PluginRepository {
  install(input: { orgId: string; manifest: PluginManifest }): Promise<PluginRecord>;
  findById(id: string): Promise<PluginRecord | null>;
  listByOrg(orgId: string): Promise<PluginRecord[]>;
  setStatus(input: { id: string; orgId: string; status: PluginStatus }): Promise<PluginRecord>;
  remove(input: { id: string; orgId: string }): Promise<void>;
}

export interface WebhookSubscriptionRepository {
  create(input: {
    orgId: string;
    url: string;
    events: string[];
    secret: string;
  }): Promise<WebhookSubscriptionRecord>;
  setActive(input: { id: string; orgId: string; isActive: boolean }): Promise<WebhookSubscriptionRecord>;
  listActiveForEvent(orgId: string, eventType: string): Promise<WebhookSubscriptionRecord[]>;
}

export interface WebhookDeliveryRepository {
  create(input: {
    orgId: string;
    subscriptionId: string;
    outboxEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
    signature: string;
    timestampMs: number;
  }): Promise<WebhookDeliveryRecord>;
  markStatus(input: {
    id: string;
    orgId: string;
    status: "PENDING" | "DELIVERED" | "FAILED";
  }): Promise<WebhookDeliveryRecord>;
  listPending(limit?: number): Promise<WebhookDeliveryRecord[]>;
}
