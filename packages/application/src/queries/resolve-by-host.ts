import {
  type TenantResolution,
  normalizeHost,
  resolveTenantFromHost,
} from "@finalshop/domain";
import type { Repositories } from "../ports";

/**
 * Public query (TEN-003): resolves an incoming host to the tenant chain.
 * Fetching is infrastructure's job; all validation lives in the pure domain
 * function so the rules are unit-testable (see packages/domain).
 */
export async function resolveByHost(
  repos: Repositories,
  host: string,
): Promise<TenantResolution> {
  const normalized = normalizeHost(host);
  const record = await repos.domains.findByHostJoined(normalized);
  return resolveTenantFromHost(host, record);
}
