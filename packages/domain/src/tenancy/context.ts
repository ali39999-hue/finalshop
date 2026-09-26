import { Role } from "./types";
import { CrossTenantAccessError, TenantContextMissingError } from "../errors";

/**
 * The tenant context is established by domain resolution (host → domain →
 * storefront → store → organization) and must be present before any
 * tenant-scoped operation runs (threat T-01, roadmap §5).
 */
export interface TenantContext {
  readonly orgId: string;
  readonly storeId?: string;
  readonly storefrontId?: string;
  readonly userId?: string;
  readonly role?: Role;
  readonly requestId?: string;
}

/** Throws unless the context carries a valid organization id. */
export function assertTenantContext(
  ctx: TenantContext | null | undefined,
): TenantContext {
  if (!ctx || typeof ctx.orgId !== "string" || ctx.orgId.length === 0) {
    throw new TenantContextMissingError();
  }
  return ctx;
}

/** Throws unless the context is bound to the given organization. */
export function requireSameTenant(ctx: TenantContext, orgId: string): void {
  assertTenantContext(ctx);
  if (ctx.orgId !== orgId) {
    throw new CrossTenantAccessError(ctx.orgId, orgId);
  }
}

/** Runs `fn` only after the context has been validated. */
export async function withTenantContext<T>(
  ctx: TenantContext | null | undefined,
  fn: (ctx: TenantContext) => Promise<T>,
): Promise<T> {
  return fn(assertTenantContext(ctx));
}
