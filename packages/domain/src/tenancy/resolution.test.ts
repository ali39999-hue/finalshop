import { describe, expect, it } from "vitest";
import { DomainResolutionError } from "../errors";
import {
  type ResolvedDomainRecord,
  normalizeHost,
  resolveTenantFromHost,
} from "./resolution";

function aRecord(overrides?: {
  verified?: boolean;
  orgStatus?: "ACTIVE" | "SUSPENDED" | "CLOSED";
  storeStatus?: "ACTIVE" | "INACTIVE";
  splitTenant?: boolean;
}): ResolvedDomainRecord {
  const orgId = overrides?.splitTenant ? "org-2" : "org-1";
  return {
    domain: {
      id: "dom-1",
      orgId: "org-1",
      storefrontId: "sf-1",
      host: "shop.example.com",
      isPrimary: true,
      verified: overrides?.verified ?? true,
    },
    storefront: { id: "sf-1", orgId, storeId: "store-1", locale: "en" },
    store: {
      id: "store-1",
      orgId,
      status: overrides?.storeStatus ?? "ACTIVE",
    },
    organization: {
      id: "org-1",
      status: overrides?.orgStatus ?? "ACTIVE",
    },
  };
}

describe("normalizeHost", () => {
  it("lowercases, trims and strips ports and trailing dots", () => {
    expect(normalizeHost("  SHOP.Example.COM:443 ")).toBe("shop.example.com");
    expect(normalizeHost("shop.example.com.")).toBe("shop.example.com");
  });

  it("rejects paths and bare IPv6", () => {
    expect(() => normalizeHost("shop.example.com/path")).toThrow(
      DomainResolutionError,
    );
    expect(() => normalizeHost("::1")).toThrow(DomainResolutionError);
  });
});

describe("resolveTenantFromHost", () => {
  it("resolves a verified domain to the tenant context chain", () => {
    const result = resolveTenantFromHost("Shop.Example.Com:443", aRecord());
    expect(result).toEqual({
      orgId: "org-1",
      storeId: "store-1",
      storefrontId: "sf-1",
      locale: "en",
      host: "shop.example.com",
    });
  });

  it("rejects unknown and unverified domains", () => {
    expect(() => resolveTenantFromHost("x.example.com", null)).toThrowError(
      expect.objectContaining({ code: "DOMAIN_NOT_FOUND" }),
    );
    expect(() =>
      resolveTenantFromHost("shop.example.com", aRecord({ verified: false })),
    ).toThrowError(expect.objectContaining({ code: "DOMAIN_NOT_VERIFIED" }));
  });

  it("detects cross-tenant integrity violations in the joined record", () => {
    expect(() =>
      resolveTenantFromHost("shop.example.com", aRecord({ splitTenant: true })),
    ).toThrowError(
      expect.objectContaining({ code: "TENANT_INTEGRITY_VIOLATION" }),
    );
  });

  it("rejects inactive organizations and stores", () => {
    expect(() =>
      resolveTenantFromHost("shop.example.com", aRecord({ orgStatus: "SUSPENDED" })),
    ).toThrowError(expect.objectContaining({ code: "ORGANIZATION_INACTIVE" }));
    expect(() =>
      resolveTenantFromHost("shop.example.com", aRecord({ storeStatus: "INACTIVE" })),
    ).toThrowError(expect.objectContaining({ code: "STORE_INACTIVE" }));
  });
});
