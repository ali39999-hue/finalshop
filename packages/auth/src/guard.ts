import {
  type Role,
  type TenantContext,
  PermissionDeniedError,
  requireSameTenant as requireSameTenantDomain,
} from "@finalshop/domain";
import { can, type Permission } from "./permissions";

/** Throws unless the context role carries the permission. */
export function requirePermission(
  ctx: TenantContext,
  permission: Permission,
): void {
  if (!can(ctx.role, permission)) {
    throw new PermissionDeniedError(permission, ctx.role);
  }
}

/** Commands that write audit events need a concrete actor. */
export function requireUserId(ctx: TenantContext): string {
  if (typeof ctx.userId !== "string" || ctx.userId.length === 0) {
    throw new PermissionDeniedError("actor.userId", ctx.role);
  }
  return ctx.userId;
}

export function requireSameTenant(ctx: TenantContext, orgId: string): void {
  requireSameTenantDomain(ctx, orgId);
}

/**
 * Role-assignment rule (IAM-001): only the OWNER can grant or hold others at
 * OWNER level; ADMINs administer everyone below OWNER.
 */
export function canGrantRole(granter: Role, target: Role): boolean {
  if (granter === "OWNER") return true;
  if (granter === "ADMIN") return target !== "OWNER";
  return false;
}

export function requireCanGrantRole(ctx: TenantContext, target: Role): void {
  requirePermission(ctx, "member.role.assign");
  if (!ctx.role || !canGrantRole(ctx.role, target)) {
    throw new PermissionDeniedError(`role.escalation.to.${target}`, ctx.role);
  }
}

export { can };
export type { Permission };
