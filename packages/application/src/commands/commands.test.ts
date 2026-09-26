import { describe, expect, it } from "vitest";
import {
  InMemoryRepositories,
  adminContext,
  memberContext,
  ownerContext,
  seedOrgWithStore,
} from "../testing";
import {
  addMember,
  createBranch,
  createOrganization,
  createStore,
} from "../index";

describe("createOrganization", () => {
  it("creates the organization with an OWNER membership and audits it", async () => {
    const repos = new InMemoryRepositories();
    const { organization, membership } = await createOrganization(repos, {
      name: "Acme",
      slug: "acme",
      ownerUserId: "user-owner",
    });
    expect(organization.status).toBe("ACTIVE");
    expect(membership.role).toBe("OWNER");
    const audit = await repos.audit.listByOrg(organization.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe("organization.created");
  });

  it("rejects duplicate slugs", async () => {
    const repos = new InMemoryRepositories();
    await createOrganization(repos, {
      name: "Acme",
      slug: "acme",
      ownerUserId: "user-owner",
    });
    await expect(
      createOrganization(repos, {
        name: "Other",
        slug: "acme",
        ownerUserId: "user-2",
      }),
    ).rejects.toMatchObject({ code: "ORGANIZATION_SLUG_TAKEN" });
  });

  it("validates the slug format", async () => {
    const repos = new InMemoryRepositories();
    await expect(
      createOrganization(repos, {
        name: "Acme",
        slug: "Not A Slug",
        ownerUserId: "user-owner",
      }),
    ).rejects.toThrow();
  });
});

describe("createStore (TEN-002)", () => {
  it("creates an additional store with a default storefront", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedOrgWithStore(repos);
    const { store, storefront } = await createStore(
      repos,
      ownerContext(orgId),
      { orgId, name: "Second", slug: "second" },
    );
    expect(store.orgId).toBe(orgId);
    expect(storefront.isDefault).toBe(true);
    expect(storefront.locale).toBe("en");
  });

  it("rejects cross-tenant operations", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedOrgWithStore(repos);
    const foreign = ownerContext("org-other", "user-attacker");
    await expect(
      createStore(repos, foreign, { orgId, name: "Steal", slug: "steal" }),
    ).rejects.toMatchObject({ code: "CROSS_TENANT_ACCESS" });
  });

  it("rejects callers without store.create permission", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedOrgWithStore(repos);
    await expect(
      createStore(repos, memberContext(orgId), {
        orgId,
        name: "Nope",
        slug: "nope",
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("enforces per-organization slug uniqueness", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedOrgWithStore(repos);
    await expect(
      createStore(repos, ownerContext(orgId), {
        orgId,
        name: "Dup",
        slug: "main",
      }),
    ).rejects.toMatchObject({ code: "STORE_SLUG_TAKEN" });
  });
});

describe("createBranch (TEN-002)", () => {
  it("creates a branch under a store of the same tenant", async () => {
    const repos = new InMemoryRepositories();
    const { orgId, storeId } = await seedOrgWithStore(repos);
    const branch = await createBranch(repos, ownerContext(orgId), {
      orgId,
      storeId,
      name: "Downtown",
      kind: "RETAIL_LOCATION",
    });
    expect(branch.kind).toBe("RETAIL_LOCATION");
  });

  it("does not leak stores from other tenants", async () => {
    const repos = new InMemoryRepositories();
    const { storeId } = await seedOrgWithStore(repos);
    const foreign = ownerContext("org-other", "user-attacker");
    await expect(
      createBranch(repos, foreign, {
        orgId: "org-other",
        storeId,
        name: "X",
        kind: "WAREHOUSE",
      }),
    ).rejects.toMatchObject({ code: "STORE_NOT_FOUND" });
  });
});

describe("addMember (IAM-001)", () => {
  it("lets the OWNER add members and audits the grant", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedOrgWithStore(repos);
    const membership = await addMember(repos, ownerContext(orgId), {
      orgId,
      userId: "user-admin",
      role: "ADMIN",
    });
    expect(membership.role).toBe("ADMIN");
    const audit = await repos.audit.listByOrg(orgId);
    expect(audit.some((e) => e.action === "member.added")).toBe(true);
  });

  it("blocks ADMIN-to-OWNER escalation", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedOrgWithStore(repos);
    await expect(
      addMember(repos, adminContext(orgId), {
        orgId,
        userId: "user-x",
        role: "OWNER",
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("rejects duplicate memberships", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedOrgWithStore(repos);
    await addMember(repos, ownerContext(orgId), {
      orgId,
      userId: "user-admin",
      role: "ADMIN",
    });
    await expect(
      addMember(repos, ownerContext(orgId), {
        orgId,
        userId: "user-admin",
        role: "SUPPORT",
      }),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_EXISTS" });
  });
});
