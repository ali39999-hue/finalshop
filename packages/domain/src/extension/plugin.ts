import { DomainError } from "../errors";

/**
 * Extension platform (W13, roadmap §16): plugins are capability-based. A
 * plugin declares what it needs in a manifest; the platform validates the
 * manifest against whitelists and grants ONLY those capabilities. Plugins
 * never get direct database access (threat T-09) — they receive extension
 * points: events, UI slots, routes and jobs.
 */

export const PLUGIN_CAPABILITIES = [
  "products.read",
  "orders.read",
  "customers.read",
  "webhooks.receive",
  "ui.slots",
  "jobs.schedule",
] as const;

export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

export const PLUGIN_EVENT_TYPES = [
  "product.changed",
  "price.changed",
  "inventory.changed",
  "page.published",
  "page.unpublished",
  "order.placed",
  "order.confirmed",
  "refund.executed",
] as const;

export type PluginEventType = (typeof PLUGIN_EVENT_TYPES)[number];

export const PLUGIN_UI_SLOTS = [
  "storefront.header",
  "storefront.product.page",
  "admin.dashboard",
  "admin.order.detail",
] as const;

export type PluginUiSlot = (typeof PLUGIN_UI_SLOTS)[number];

export interface PluginManifest {
  /** Slug: lowercase letters, digits, dashes. */
  name: string;
  version: string;
  requiredCoreVersion: string;
  permissions: readonly string[];
  eventsSubscribe: readonly string[];
  uiSlots: readonly string[];
  routes: readonly string[];
  jobs: readonly string[];
  configSchema?: Record<string, unknown>;
}

const NAME_REGEX = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const VERSION_REGEX = /^\d+\.\d+\.\d+$/;
const ROUTE_REGEX = /^\/[A-Za-z0-9\-/._]*$/;

export function validatePluginManifest(manifest: PluginManifest): void {
  const fail = (detail: string) => {
    throw new DomainError("PLUGIN_MANIFEST_INVALID", detail);
  };
  if (!NAME_REGEX.test(manifest.name)) {
    fail(`plugin name ${manifest.name} must be a slug`);
  }
  if (!VERSION_REGEX.test(manifest.version)) {
    fail(`version ${manifest.version} must be semver (x.y.z)`);
  }
  if (!VERSION_REGEX.test(manifest.requiredCoreVersion)) {
    fail(`requiredCoreVersion ${manifest.requiredCoreVersion} must be semver`);
  }
  for (const permission of manifest.permissions) {
    if (!(PLUGIN_CAPABILITIES as readonly string[]).includes(permission)) {
      fail(`unknown capability ${permission}`);
    }
  }
  for (const eventType of manifest.eventsSubscribe) {
    if (!(PLUGIN_EVENT_TYPES as readonly string[]).includes(eventType)) {
      fail(`unknown event ${eventType}`);
    }
  }
  for (const slot of manifest.uiSlots) {
    if (!(PLUGIN_UI_SLOTS as readonly string[]).includes(slot)) {
      fail(`unknown UI slot ${slot}`);
    }
  }
  for (const route of manifest.routes) {
    if (!ROUTE_REGEX.test(route)) {
      fail(`route ${route} must be an absolute path`);
    }
  }
}
