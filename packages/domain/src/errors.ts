/**
 * Domain error hierarchy. Infrastructure maps persistence errors (e.g. unique
 * constraint violations) onto these so callers never see driver-specific types.
 */
export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export class TenantContextMissingError extends DomainError {
  constructor() {
    super("TENANT_CONTEXT_MISSING", "no valid tenant context on the request");
  }
}

export class CrossTenantAccessError extends DomainError {
  constructor(ctxOrgId: string, targetOrgId: string) {
    super(
      "CROSS_TENANT_ACCESS",
      `tenant context ${ctxOrgId} cannot operate on organization ${targetOrgId}`,
    );
  }
}

export class PermissionDeniedError extends DomainError {
  constructor(permission: string, role: string | undefined) {
    super(
      "PERMISSION_DENIED",
      `role ${role ?? "<none>"} is not granted permission ${permission}`,
    );
  }
}

export class DomainResolutionError extends DomainError {
  constructor(code: string, host: string) {
    super(code, `host ${host} could not be resolved to a tenant`);
  }
}
