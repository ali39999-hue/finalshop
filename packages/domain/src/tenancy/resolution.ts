import {
  OrganizationStatus,
  StoreStatus,
} from "./types";
import { DomainResolutionError } from "../errors";

/**
 * Pure implementation of the domain resolution algorithm (TEN-003):
 * Host → Domain → Storefront → Store → Organization.
 * The infrastructure layer only fetches the joined record; every validation
 * rule lives here so it is unit-testable without a database.
 */
export interface ResolvedDomainRecord {
  domain: {
    id: string;
    orgId: string;
    storefrontId: string;
    host: string;
    isPrimary: boolean;
    verified: boolean;
  };
  storefront: {
    id: string;
    orgId: string;
    storeId: string;
    locale: string;
  };
  store: {
    id: string;
    orgId: string;
    status: StoreStatus;
  };
  organization: {
    id: string;
    status: OrganizationStatus;
  };
}

export interface TenantResolution {
  orgId: string;
  storeId: string;
  storefrontId: string;
  locale: string;
  host: string;
}

/**
 * Normalizes an incoming Host header: trims, lowercases, strips a trailing
 * FQDN dot and a single port. Paths and bare IPv6 are rejected.
 */
export function normalizeHost(input: string): string {
  let host = input.trim().toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.includes("/")) {
    throw new DomainResolutionError("INVALID_HOST", input);
  }
  if (host.includes(":")) {
    const colons = host.match(/:/g)?.length ?? 0;
    if (colons > 1) throw new DomainResolutionError("INVALID_HOST", input);
    host = host.replace(/:\d+$/, "");
  }
  if (host.length === 0) throw new DomainResolutionError("INVALID_HOST", input);
  return host;
}

/** Validates the full chain and produces the tenant resolution result. */
export function resolveTenantFromHost(
  rawHost: string,
  record: ResolvedDomainRecord | null | undefined,
): TenantResolution {
  const host = normalizeHost(rawHost);
  if (!record) throw new DomainResolutionError("DOMAIN_NOT_FOUND", host);
  if (!record.domain.verified) {
    throw new DomainResolutionError("DOMAIN_NOT_VERIFIED", host);
  }
  const { domain, storefront, store, organization } = record;
  const sameTenant =
    domain.orgId === storefront.orgId &&
    storefront.orgId === store.orgId &&
    store.orgId === organization.id;
  if (!sameTenant) {
    throw new DomainResolutionError("TENANT_INTEGRITY_VIOLATION", host);
  }
  if (organization.status !== "ACTIVE") {
    throw new DomainResolutionError("ORGANIZATION_INACTIVE", host);
  }
  if (store.status !== "ACTIVE") {
    throw new DomainResolutionError("STORE_INACTIVE", host);
  }
  return {
    orgId: organization.id,
    storeId: store.id,
    storefrontId: storefront.id,
    locale: storefront.locale,
    host,
  };
}
