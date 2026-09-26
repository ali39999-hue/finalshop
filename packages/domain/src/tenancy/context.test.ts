import { describe, expect, it } from "vitest";
import {
  CrossTenantAccessError,
  TenantContextMissingError,
} from "../errors";
import {
  assertTenantContext,
  requireSameTenant,
  withTenantContext,
} from "./context";

describe("tenant context guard (IAM-003)", () => {
  it("passes a valid context through", async () => {
    const ctx = { orgId: "org-1", userId: "user-1" };
    expect(assertTenantContext(ctx)).toBe(ctx);
    await expect(withTenantContext(ctx, async (c) => c.orgId)).resolves.toBe("org-1");
  });

  it("throws when there is no tenant context", () => {
    expect(() => assertTenantContext(null)).toThrow(TenantContextMissingError);
    expect(() => assertTenantContext({ orgId: "" })).toThrow(
      TenantContextMissingError,
    );
  });

  it("rejects operations targeting another organization", () => {
    expect(() => requireSameTenant({ orgId: "org-1" }, "org-2")).toThrow(
      CrossTenantAccessError,
    );
    expect(() => requireSameTenant({ orgId: "org-1" }, "org-1")).not.toThrow();
  });
});
