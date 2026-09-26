import { describe, expect, it } from "vitest";
import { PermissionDeniedError } from "@finalshop/domain";
import { PERMISSIONS, ROLE_PERMISSIONS } from "./permissions";
import {
  can,
  canGrantRole,
  requireCanGrantRole,
  requirePermission,
  requireUserId,
} from "./guard";

describe("permission matrix (IAM-002)", () => {
  it("grants OWNER everything via the wildcard", () => {
    for (const permission of PERMISSIONS) {
      expect(can("OWNER", permission)).toBe(true);
    }
  });

  it("denies ADMIN owner-only capabilities", () => {
    expect(can("ADMIN", "org.close")).toBe(false);
    expect(can("ADMIN", "domain.verify")).toBe(false);
    expect(can("ADMIN", "store.create")).toBe(true);
  });

  it("scopes STORE_ADMIN to store operations", () => {
    expect(can("STORE_ADMIN", "storefront.update")).toBe(true);
    expect(can("STORE_ADMIN", "member.invite")).toBe(false);
  });

  it("scopes CATALOG_ADMIN to catalog operations (W2)", () => {
    expect(can("CATALOG_ADMIN", "product.create")).toBe(true);
    expect(can("CATALOG_ADMIN", "asset.upload")).toBe(true);
    expect(can("CATALOG_ADMIN", "org.update")).toBe(false);
    expect(can("CATALOG_ADMIN", "store.create")).toBe(false);
  });

  it("denies anonymous and empty roles", () => {
    expect(can(undefined, "org.read")).toBe(false);
    expect(can("MEMBER", "store.create")).toBe(false);
  });

  it("keeps the matrix total over all roles", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      expect(ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]).toBeDefined();
    }
  });
});

describe("guards", () => {
  const ctx = { orgId: "org-1", userId: "user-1", role: "ADMIN" as const };

  it("requirePermission passes for granted roles and throws otherwise", () => {
    expect(() => requirePermission(ctx, "store.create")).not.toThrow();
    expect(() => requirePermission(ctx, "org.close")).toThrowError(
      PermissionDeniedError,
    );
  });

  it("requireUserId demands a concrete actor", () => {
    expect(requireUserId(ctx)).toBe("user-1");
    expect(() => requireUserId({ orgId: "org-1", role: "ADMIN" })).toThrow(
      PermissionDeniedError,
    );
  });

  it("role escalation rules follow the hierarchy", () => {
    expect(canGrantRole("OWNER", "OWNER")).toBe(true);
    expect(canGrantRole("ADMIN", "ADMIN")).toBe(true);
    expect(canGrantRole("ADMIN", "OWNER")).toBe(false);
    expect(canGrantRole("STORE_ADMIN", "MEMBER")).toBe(false);
    expect(() =>
      requireCanGrantRole({ ...ctx }, "OWNER"),
    ).toThrowError(PermissionDeniedError);
  });
});
