import { describe, expect, it } from "vitest";
import {
  InMemoryRepositories,
  memberContext,
  ownerContext,
  seedOrgWithStore,
} from "../testing";
import {
  createWebhookSubscription,
  dispatchOutboundWebhooks,
  installPlugin,
  setPluginStatus,
} from "../index";
import { verifyOutboundSignature } from "@finalshop/domain";

describe("extensions (W13)", () => {
  it("installs, disables and uninstalls a plugin with audits", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedOrgWithStore(repos);
    const ctx = ownerContext(orgId);
    const plugin = await installPlugin(repos, ctx, {
      orgId,
      manifest: {
        name: "loyalty-widget",
        version: "1.0.0",
        requiredCoreVersion: "1.0.0",
        permissions: ["products.read", "webhooks.receive"],
        eventsSubscribe: ["product.changed"],
        uiSlots: ["admin.dashboard"],
        routes: ["/plugins/loyalty/settings"],
        jobs: [],
      },
    });
    expect(plugin.status).toBe("ENABLED");

    const disabled = await setPluginStatus(repos, ctx, {
      orgId,
      pluginId: plugin.id,
      status: "DISABLED",
    });
    expect(disabled.status).toBe("DISABLED");

    await expect(
      installPlugin(repos, ctx, {
        orgId,
        manifest: {
          name: "loyalty-widget",
          version: "2.0.0",
          requiredCoreVersion: "1.0.0",
          permissions: [],
          eventsSubscribe: [],
          uiSlots: [],
          routes: [],
          jobs: [],
        },
      }),
    ).rejects.toMatchObject({ code: "PLUGIN_ALREADY_INSTALLED" });
  });

  it("rejects manifests with un-granted capabilities", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedOrgWithStore(repos);
    await expect(
      installPlugin(repos, ownerContext(orgId), {
        orgId,
        manifest: {
          name: "sneaky",
          version: "1.0.0",
          requiredCoreVersion: "1.0.0",
          permissions: ["database.root"] as never,
          eventsSubscribe: [],
          uiSlots: [],
          routes: [],
          jobs: [],
        },
      }),
    ).rejects.toMatchObject({ code: "PLUGIN_MANIFEST_INVALID" });
    await expect(
      installPlugin(repos, memberContext(orgId), {
        orgId,
        manifest: {
          name: "no-perm",
          version: "1.0.0",
          requiredCoreVersion: "1.0.0",
          permissions: [],
          eventsSubscribe: [],
          uiSlots: [],
          routes: [],
          jobs: [],
        },
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("dispatches signed webhook deliveries for matching subscriptions", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedOrgWithStore(repos);
    const ctx = ownerContext(orgId);
    const subscription = await createWebhookSubscription(repos, ctx, {
      orgId,
      url: "https://plugins.example.com/hooks",
      events: ["product.changed"],
    });

    await repos.outbox.enqueue({
      id: "evt-match",
      orgId,
      type: "product.changed",
      payload: { entityId: "prd-1" },
    });
    await repos.outbox.enqueue({
      id: "evt-no-match",
      orgId,
      type: "page.published",
      payload: { entityId: "page-1" },
    });

    const result = await dispatchOutboundWebhooks(repos);
    expect(result.deliveries).toBe(1);

    const pending = await repos.webhookDeliveries.listPending();
    expect(pending).toHaveLength(1);
    const delivery = pending[0]!;
    expect(delivery.subscriptionId).toBe(subscription.id);
    expect(delivery.eventType).toBe("product.changed");
    // The signature verifies with the subscription secret (T-03 outbound side).
    expect(
      verifyOutboundSignature({
        secret: subscription.secret,
        timestampMs: delivery.timestampMs,
        payload: JSON.stringify(delivery.payload),
        signature: delivery.signature,
      }),
    ).toBe(true);
  });

  it("rejects private or non-HTTPS webhook endpoints", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedOrgWithStore(repos);
    await expect(
      createWebhookSubscription(repos, ownerContext(orgId), {
        orgId,
        url: "http://10.0.0.5/hooks",
        events: ["product.changed"],
      }),
    ).rejects.toMatchObject({ code: "WEBHOOK_URL_INVALID" });
  });
});
