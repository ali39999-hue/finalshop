import { describe, expect, it } from "vitest";
import {
  InMemoryRepositories,
  ownerContext,
  seedOrgWithStore,
} from "../testing";
import { attachDomain, resolveByHost, verifyDomain } from "../index";

describe("domain resolution end-to-end (TEN-003)", () => {
  it("resolves a verified custom domain through the full chain", async () => {
    const repos = new InMemoryRepositories();
    const { orgId, storefrontId, ownerUserId } = await seedOrgWithStore(repos);
    const ctx = ownerContext(orgId, ownerUserId);
    const domain = await attachDomain(repos, ctx, {
      orgId,
      storefrontId,
      host: "Shop.Acme.Com:443",
      isPrimary: true,
    });
    expect(domain.host).toBe("shop.acme.com");
    expect(domain.verified).toBe(false);

    await expect(
      resolveByHost(repos, "shop.acme.com"),
    ).rejects.toMatchObject({ code: "DOMAIN_NOT_VERIFIED" });

    await verifyDomain(repos, ctx, { orgId, domainId: domain.id });
    const resolution = await resolveByHost(repos, "SHOP.ACME.COM");
    expect(resolution).toMatchObject({
      orgId,
      storefrontId,
      host: "shop.acme.com",
      locale: "en",
    });
  });

  it("returns DOMAIN_NOT_FOUND for unknown hosts", async () => {
    const repos = new InMemoryRepositories();
    await expect(resolveByHost(repos, "unknown.example.com")).rejects.toMatchObject(
      { code: "DOMAIN_NOT_FOUND" },
    );
  });

  it("rejects invalid hosts before touching the database", async () => {
    const repos = new InMemoryRepositories();
    await expect(resolveByHost(repos, "evil.com/path")).rejects.toMatchObject({
      code: "INVALID_HOST",
    });
  });

  it("marks exactly one primary domain per organization", async () => {
    const repos = new InMemoryRepositories();
    const { orgId, storefrontId, ownerUserId } = await seedOrgWithStore(repos);
    const ctx = ownerContext(orgId, ownerUserId);
    const first = await attachDomain(repos, ctx, {
      orgId,
      storefrontId,
      host: "one.acme.com",
      isPrimary: true,
    });
    const second = await attachDomain(repos, ctx, {
      orgId,
      storefrontId,
      host: "two.acme.com",
      isPrimary: true,
    });
    const stillPrimary = await repos.domains.findById(first.id);
    expect(second.isPrimary).toBe(true);
    expect(stillPrimary?.isPrimary).toBe(false);
  });

  it("rejects attaching to a foreign storefront without leaking existence", async () => {
    const repos = new InMemoryRepositories();
    const { storefrontId } = await seedOrgWithStore(repos, "acme");
    const foreign = ownerContext("org-other", "user-attacker");
    await expect(
      attachDomain(repos, foreign, {
        orgId: "org-other",
        storefrontId,
        host: "steal.example.com",
      }),
    ).rejects.toMatchObject({ code: "STOREFRONT_NOT_FOUND" });
  });

  it("keeps host uniqueness global", async () => {
    const repos = new InMemoryRepositories();
    const a = await seedOrgWithStore(repos, "acme");
    const b = await seedOrgWithStore(repos, "beta");
    const ctxA = ownerContext(a.orgId, a.ownerUserId);
    const ctxB = ownerContext(b.orgId, b.ownerUserId);
    await attachDomain(repos, ctxA, {
      orgId: a.orgId,
      storefrontId: a.storefrontId,
      host: "shared.example.com",
    });
    await expect(
      attachDomain(repos, ctxB, {
        orgId: b.orgId,
        storefrontId: b.storefrontId,
        host: "shared.example.com",
      }),
    ).rejects.toMatchObject({ code: "DOMAIN_HOST_TAKEN" });
  });
});
