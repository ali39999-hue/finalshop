import { describe, expect, it } from "vitest";
import { PLUGIN_CAPABILITIES, PLUGIN_EVENT_TYPES, validatePluginManifest, type PluginManifest } from "./plugin";
import {
  assertWebhookUrl,
  buildDeliveryHeaders,
  signWebhookPayload,
  verifyOutboundSignature,
} from "./outbound-webhook";

function manifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    name: "tax-assistant",
    version: "1.0.0",
    requiredCoreVersion: "1.0.0",
    permissions: ["products.read", "webhooks.receive"],
    eventsSubscribe: ["product.changed"],
    uiSlots: ["admin.order.detail"],
    routes: ["/plugins/tax-assistant/settings"],
    jobs: [],
    ...overrides,
  };
}

describe("plugin manifests (W13, T-09)", () => {
  it("accepts a capability-scoped manifest", () => {
    expect(() => validatePluginManifest(manifest())).not.toThrow();
    expect(PLUGIN_CAPABILITIES.length).toBeGreaterThanOrEqual(4);
    expect(PLUGIN_EVENT_TYPES.length).toBeGreaterThanOrEqual(6);
  });

  it("rejects unknown capabilities, events, slots and bad versions", () => {
    expect(() =>
      validatePluginManifest(manifest({ permissions: ["database.root"] as never })),
    ).toThrow(expect.objectContaining({ code: "PLUGIN_MANIFEST_INVALID" }));
    expect(() =>
      validatePluginManifest(
        manifest({ eventsSubscribe: ["*"] as never }),
      ),
    ).toThrow(expect.objectContaining({ code: "PLUGIN_MANIFEST_INVALID" }));
    expect(() =>
      validatePluginManifest(manifest({ uiSlots: ["kernel.internal"] as never })),
    ).toThrow(expect.objectContaining({ code: "PLUGIN_MANIFEST_INVALID" }));
    expect(() =>
      validatePluginManifest(manifest({ version: "1.0" })),
    ).toThrow(expect.objectContaining({ code: "PLUGIN_MANIFEST_INVALID" }));
    expect(() =>
      validatePluginManifest(manifest({ routes: ["/ok", "relative-path"] })),
    ).toThrow(expect.objectContaining({ code: "PLUGIN_MANIFEST_INVALID" }));
  });
});

describe("outbound webhooks (W13, T-04)", () => {
  const payload = JSON.stringify({ type: "product.changed" });
  const timestampMs = 1758900000000;
  const secret = "whsec_outbound";
  const signature = signWebhookPayload({ secret, timestampMs, payload });

  it("signs and verifies deliveries", () => {
    expect(
      verifyOutboundSignature({ secret, timestampMs, payload, signature }),
    ).toBe(true);
    expect(
      verifyOutboundSignature({
        secret,
        timestampMs,
        payload: payload + " tampered",
        signature,
      }),
    ).toBe(false);
    const headers = buildDeliveryHeaders({ signature, timestampMs });
    expect(headers["x-finalshop-signature"]).toBe(`t=${timestampMs},v1=${signature}`);
  });

  it("enforces HTTPS and rejects private hosts", () => {
    expect(() =>
      assertWebhookUrl("https://plugins.example.com/hook"),
    ).not.toThrow();
    expect(() => assertWebhookUrl("http://plugins.example.com/hook")).toThrow(
      expect.objectContaining({ code: "WEBHOOK_URL_INVALID" }),
    );
    expect(() =>
      assertWebhookUrl("https://localhost/hook"),
    ).toThrow(expect.objectContaining({ code: "WEBHOOK_URL_INVALID" }));
    expect(() =>
      assertWebhookUrl("https://192.168.1.10/hook"),
    ).toThrow(expect.objectContaining({ code: "WEBHOOK_URL_INVALID" }));
    expect(() => assertWebhookUrl("not a url")).toThrow();
  });
});
