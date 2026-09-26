import { describe, expect, it } from "vitest";
import {
  InMemoryRepositories,
  memberContext,
  ownerContext,
  seedOrgWithStore,
} from "../testing";
import {
  checkRateLimit,
  createRateLimitPolicy,
  funnelReport,
  trackEvent,
} from "../index";

async function analyticsBase() {
  const repos = new InMemoryRepositories();
  const { orgId } = await seedOrgWithStore(repos);
  return { repos, orgId, ctx: ownerContext(orgId) };
}

describe("analytics ingest & funnels (W12)", () => {
  it("tracks versioned events and reports funnel progression", async () => {
    const { repos, orgId, ctx } = await analyticsBase();
    const shopper = { orgId, userId: "customer-1" };
    await trackEvent(repos, shopper, {
      orgId,
      sessionId: "sess-1",
      name: "cart.updated@1",
      properties: { itemCount: 2 },
    });
    await trackEvent(repos, shopper, {
      orgId,
      sessionId: "sess-1",
      name: "checkout.started@1",
      properties: {},
    });
    await trackEvent(repos, shopper, {
      orgId,
      sessionId: "sess-1",
      name: "order.placed@1",
      properties: {},
    });
    await trackEvent(repos, shopper, {
      orgId,
      sessionId: "sess-2",
      name: "cart.updated@1",
      properties: {},
    });

    const report = await funnelReport(repos, ctx, {
      orgId,
      steps: ["cart.updated@1", "checkout.started@1", "order.placed@1"],
      from: new Date(Date.now() - 3600_000),
      to: new Date(Date.now() + 3600_000),
    });
    expect(report.counts).toEqual([2, 1, 1]);
    expect(report.totalSessions).toBe(2);
  });

  it("blocks PII leakage at ingest", async () => {
    const { repos, orgId } = await analyticsBase();
    await expect(
      trackEvent(repos, ownerContext(orgId), {
        orgId,
        sessionId: "sess-1",
        name: "checkout.started@1",
        properties: { customerEmail: "a@b.c" },
      }),
    ).rejects.toMatchObject({ code: "ANALYTICS_PII_BLOCKED" });
  });

  it("requires analytics.read for reports", async () => {
    const { repos, orgId } = await analyticsBase();
    await expect(
      funnelReport(repos, memberContext(orgId), {
        orgId,
        steps: ["cart.updated@1"],
        from: new Date(0),
        to: new Date(),
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});

describe("rate limiting (W14)", () => {
  it("counts hits per tenant+route window and enforces the limit", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedOrgWithStore(repos);
    const input = { orgId, route: "/checkout", limit: 3, windowSeconds: 60 };
    const first = await checkRateLimit(repos, input);
    expect(first.allowed).toBe(true);
    expect(first.hits).toBe(1);
    const second = await checkRateLimit(repos, input);
    const third = await checkRateLimit(repos, input);
    expect(third.allowed).toBe(true);
    expect(third.hits).toBe(3);
    const fourth = await checkRateLimit(repos, input);
    expect(fourth.allowed).toBe(false);
    expect(fourth.hits).toBe(4);
    void first;
    void second;
  });

  it("isolates counters per tenant", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedOrgWithStore(repos);
    const other = "org-other";
    await checkRateLimit(repos, { orgId, route: "/checkout", limit: 2, windowSeconds: 60 });
    const otherVerdict = await checkRateLimit(repos, {
      orgId: other,
      route: "/checkout",
      limit: 2,
      windowSeconds: 60,
    });
    expect(otherVerdict.hits).toBe(1);
    void orgId;
  });

  it("manages policies with permissions", async () => {
    const { repos, orgId, ctx } = await analyticsBase();
    await createRateLimitPolicy(repos, ctx, {
      orgId,
      route: "/checkout",
      limit: 10,
      windowSeconds: 60,
    });
    await expect(
      createRateLimitPolicy(repos, memberContext(orgId), {
        orgId,
        route: "/x",
        limit: 1,
        windowSeconds: 60,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(await repos.rateLimitPolicies.listByOrg(orgId)).toHaveLength(1);
  });
});
