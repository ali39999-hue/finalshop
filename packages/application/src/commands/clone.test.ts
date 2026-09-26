import { describe, expect, it } from "vitest";
import type { TenantContext } from "@finalshop/domain";
import {
  InMemoryRepositories,
  ownerContext,
  seedOrgWithStore,
} from "../testing";
import {
  addCartItem,
  addVariant,
  applyOverride,
  approveRefund,
  captureCheckoutAddress,
  captureCheckoutCustomer,
  cloneStore,
  createCart,
  createOrganization,
  createPage,
  createPaymentIntent,
  createPriceList,
  createProduct,
  detachFork,
  executeRefund,
  forkStore,
  listForkLinks,
  markCheckoutReviewed,
  placeOrder,
  priceCheckout,
  requestRefund,
  syncFromParent,
  createTheme,
  savePageRevision,
  setPrice,
  startPaymentAttempt,
  confirmPayment,
} from "../index";

async function seededSourceStore() {
  const repos = new InMemoryRepositories();
  const { orgId } = await seedOrgWithStore(repos);
  const staff = ownerContext(orgId);
  const theme = await createTheme(repos, staff, {
    orgId,
    name: "Parent Theme",
    tokens: {
      colors: { background: "#ffffff", text: "#1a1a1a", primary: "#0b5fff" },
      typography: { fontFamily: "Inter", scale: { base: 16 } },
      spacing: { sm: 4 },
      radius: { md: 8 },
      shadow: { card: "0 1px 2px" },
      motion: { durationMs: 150, easing: "ease-out" },
    },
  });
  const priceList = await createPriceList(repos, staff, {
    orgId,
    currency: "USD",
    priority: 10,
  });
  const product = await createProduct(repos, staff, { orgId, title: "Tee", slug: "tee" });
  const variant = await addVariant(repos, staff, {
    orgId,
    productId: product.id,
    sku: "TEE",
    optionValues: {},
  });
  await setPrice(repos, staff, {
    orgId,
    priceListId: priceList.id,
    variantId: variant.id,
    minQuantity: 1,
    unitPriceMinor: "2500",
  });
  const { page } = await createPage(repos, staff, {
    orgId,
    title: "Home",
    slug: "home",
  });
  // A placed order lives in the source org and must never be cloned.
  const shopper = { orgId, userId: "customer-1" };
  const cart = await createCart(repos, shopper, { orgId, currency: "USD" });
  await addCartItem(repos, shopper, {
    orgId,
    cartId: cart.id,
    variantId: variant.id,
    quantity: 1,
  });
  await priceCheckout(repos, shopper, { orgId, cartId: cart.id });
  const checkout = (await repos.checkouts.findByCart(cart.id))!;
  await captureCheckout(repos, shopper, orgId, checkout.id);
  await markCheckoutReviewed(repos, shopper, { orgId, checkoutId: checkout.id });
  const { order } = await placeOrder(repos, shopper, {
    orgId,
    checkoutId: checkout.id,
    idempotencyKey: `order-clone-test-${Math.random().toString(36).slice(2, 12)}-k`,
  });
  return { repos, orgId, staff, theme, priceList, product, variant, page, order };
}

async function captureCheckout(
  repos: InMemoryRepositories,
  shopper: { orgId: string; userId: string },
  orgId: string,
  checkoutId: string,
) {
  await captureCheckoutCustomer(repos, shopper, {
    orgId,
    checkoutId,
    customerId: shopper.userId,
  });
  await captureCheckoutAddress(repos, shopper, {
    orgId,
    checkoutId,
    address: { name: "C", line1: "L1", city: "X", country: "IR" },
  });
}

async function newOrg(repos: InMemoryRepositories, slug: string) {
  const { organization } = await createOrganization(repos, {
    name: slug,
    slug,
    ownerUserId: "owner-child",
  });
  return organization.id;
}

describe("cloneStore (CLONE-001..003)", () => {
  it("copies the whitelisted structure with remapped ids and no orders", async () => {
    const { repos, orgId, theme, priceList, product, page, order } =
      await seededSourceStore();
    const targetOrgId = await newOrg(repos, "child-store");
    const ctx = ownerContext(orgId, "owner-source");

    const { manifest } = await cloneStoreFor(repos, ctx, {
      sourceOrgId: orgId,
      targetOrgId,
      profile: "STORE_BLUEPRINT",
    });

    // All structure copied with fresh ids.
    expect(manifest.entries.length).toBeGreaterThanOrEqual(5);
    const remappedProduct = manifest.entries.find((e) => e.kind === "product")!;
    expect(remappedProduct.targetId).not.toBe(product.id);
    const copiedVariant = (
      await repos.variants.listByProduct(targetOrgId, remappedProduct.targetId)
    )[0]!;
    // The price points at the REMAPPED price list and variant.
    const copiedPrices = await repos.prices.listForVariant(
      targetOrgId,
      copiedVariant.id,
      (await repos.priceLists.listByOrg(targetOrgId)).map((pl) => pl.id),
    );
    expect(copiedPrices).toHaveLength(1);
    expect(copiedPrices[0]?.priceListId).toBe(
      manifest.entries.find((e) => e.kind === "priceList")?.targetId,
    );

    // Transactional data stays behind.
    const targetOrders = [...repos["orderMap"].values()].filter(
      (o) => o.orgId === targetOrgId,
    );
    expect(targetOrders).toHaveLength(0);
    expect((await repos.orders.findById(order.id))?.orgId).toBe(orgId);
    expect((await repos.themes.findById(theme.id))?.orgId).toBe(orgId);
    expect((await repos.pages.findById(page.id))?.orgId).toBe(orgId);
    expect(await repos.priceLists.listByOrg(targetOrgId)).toHaveLength(1);

    // The manifest is persisted for audit/rollback.
    const stored = await repos.cloneManifests.listByOrg(targetOrgId);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.manifest.profile).toBe("STORE_BLUEPRINT");
    void priceList;
  });

  it("rejects non-owners and same-org clones", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedOrgWithStore(repos);
    const targetOrgId = await newOrg(repos, "child-b");
    await expect(
      cloneStoreFor(repos, ownerContext(targetOrgId, "owner-child"), {
        sourceOrgId: orgId,
        targetOrgId,
        profile: "STORE_BLUEPRINT",
      }),
    ).rejects.toMatchObject({ code: "CLONE_UNAUTHORIZED" });
    await expect(
      cloneStoreFor(repos, ownerContext(orgId, "owner-source"), {
        sourceOrgId: orgId,
        targetOrgId: orgId,
        profile: "STORE_BLUEPRINT",
      }),
    ).rejects.toMatchObject({ code: "CLONE_SAME_ORG" });
  });
});

describe("fork sync lifecycle (FORK-001/002)", () => {
  it("syncs inherited pages, flags overridden, skips detached", async () => {
    const { repos, orgId, staff, page } = await seededSourceStore();
    const targetOrgId = await newOrg(repos, "forked-child");
    const parentOwner = ownerContext(orgId, "owner-source");
    const { forkLinks } = await forkStore(repos, parentOwner, {
      sourceOrgId: orgId,
      targetOrgId,
      profile: "CHILD_BRANCH",
    });
    const pageLink = forkLinks.find((l) => l.entityType === "page")!;
    expect(pageLink.status).toBe("ACTIVE");

    // Parent evolves its page.
    await savePageRevision(repos, staff, {
      orgId: orgId,
      pageId: page.id,
      schema: {
        id: "root",
        type: "layout.section",
        props: {},
        children: [
          { id: "hero-9", type: "content.text", props: { text: "New campaign" }, children: [] },
        ],
      },
    });

    // Inherited: the child receives the parent schema as a NEW revision.
    const childDesigner = ownerContext(targetOrgId, "owner-child");
    const synced = await syncFromParent(repos, childDesigner, {
      orgId: targetOrgId,
      forkLinkId: pageLink.id,
    });
    expect(synced.applied).toBe(1);
    const childPage = (await repos.pages.listByOrg(targetOrgId))[0]!;
    const childLatest = await repos.pageRevisions.latestNumber(targetOrgId, childPage.id);
    expect(childLatest).toBe(2);

    // The child overrides its page → sync becomes a conflict.
    await applyOverride(repos, childDesigner, {
      orgId: targetOrgId,
      forkLinkId: pageLink.id,
      field: "schema",
      decision: "overridden",
      value: { id: "root", type: "layout.section", props: {}, children: [] },
    });
    await savePageRevision(repos, childDesigner, {
      orgId: targetOrgId,
      pageId: childPage.id,
      schema: {
        id: "root",
        type: "layout.section",
        props: {},
        children: [
          { id: "local-1", type: "content.text", props: { text: "Local" }, children: [] },
        ],
      },
    });
    const conflicted = await syncFromParent(repos, childDesigner, {
      orgId: targetOrgId,
      forkLinkId: pageLink.id,
    });
    expect(conflicted.conflicts).toHaveLength(1);
    expect(conflicted.applied).toBe(0);

    // Detach → sync skips entirely; the link stays for audit.
    await detachFork(repos, childDesigner, { orgId: targetOrgId, forkLinkId: pageLink.id });
    const detached = await syncFromParent(repos, childDesigner, {
      orgId: targetOrgId,
      forkLinkId: pageLink.id,
    });
    expect(detached.applied).toBe(0);
    expect(detached.skipped).toEqual(["schema"]);
    const links = await listForkLinks(repos, childDesigner, { orgId: targetOrgId });
    expect(links).toHaveLength(3);
    expect(links.find((l) => l.entityType === "page")?.status).toBe("DETACHED");
  });

  it("keeps refunds inside the fork lifecycle untouched", async () => {
    const { repos, orgId, staff, order } = await seededSourceStore();
    const targetOrgId = await newOrg(repos, "forked-child");
    const { forkLinks } = await forkStore(repos, ownerContext(orgId, "owner-source"), {
      sourceOrgId: orgId,
      targetOrgId,
      profile: "CHILD_BRANCH",
    });
    expect(forkLinks.length).toBeGreaterThanOrEqual(1);
    // Refund machinery in the source org is unaffected by forking.
    const intent = await createPaymentIntent(repos, staff, { orgId, orderId: order.id });
    await startPaymentAttempt(repos, staff, { orgId, orderId: order.id, intentId: intent.id });
    await confirmPayment(repos, staff, {
      orgId,
      orderId: order.id,
      intentId: intent.id,
      providerRef: "ch_9",
    });
    const refund = await requestRefund(repos, staff, {
      orgId,
      intentId: intent.id,
      amountMinor: "100",
      reason: "goodwill",
    });
    await approveRefund(repos, staff, { orgId, refundId: refund.id });
    const executed = await executeRefund(repos, staff, {
      orgId,
      refundId: refund.id,
      providerRef: "re_9",
    });
    expect(executed.status).toBe("EXECUTED");
  });
});

async function cloneStoreFor(
  repos: InMemoryRepositories,
  ctx: TenantContext,
  input: { sourceOrgId: string; targetOrgId: string; profile: "STORE_BLUEPRINT" | "CHILD_BRANCH" },
) {
  if (input.profile === "CHILD_BRANCH") {
    return forkStore(repos, ctx, input);
  }
  return cloneStore(repos, ctx, input);
}
