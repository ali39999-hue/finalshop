import { describe, expect, it } from "vitest";
import {
  InMemoryRepositories,
  ownerContext,
  seedOrgWithStore,
} from "../testing";
import {
  addVariant,
  adjustStock,
  commitReservation,
  createInventoryItem,
  createPriceList,
  createProduct,
  createPromotion,
  quotePrice,
  releaseExpiredReservations,
  releaseReservation,
  reserveStock,
  setPrice,
} from "../index";

async function pricedVariant() {
  const repos = new InMemoryRepositories();
  const { orgId } = await seedOrgWithStore(repos);
  const ctx = ownerContext(orgId);
  const product = await createProduct(repos, ctx, {
    orgId,
    title: "Tee",
    slug: "tee",
  });
  const variant = await addVariant(repos, ctx, {
    orgId,
    productId: product.id,
    sku: "TEE-1",
    optionValues: {},
  });
  return { repos, orgId, ctx, variant };
}

describe("price lists and quotes (PRICE-002)", () => {
  it("quotes from the highest-priority active list with a breakdown", async () => {
    const { repos, orgId, ctx, variant } = await pricedVariant();
    const retail = await createPriceList(repos, ctx, {
      orgId,
      currency: "USD",
      priority: 10,
    });
    const wholesale = await createPriceList(repos, ctx, {
      orgId,
      currency: "USD",
      priority: 5,
    });
    await setPrice(repos, ctx, {
      orgId,
      priceListId: retail.id,
      variantId: variant.id,
      minQuantity: 1,
      unitPriceMinor: "2000",
    });
    await setPrice(repos, ctx, {
      orgId,
      priceListId: wholesale.id,
      variantId: variant.id,
      minQuantity: 10,
      unitPriceMinor: "1500",
    });

    const beforePromo = await quotePrice(repos, ctx, {
      orgId,
      variantId: variant.id,
      currency: "USD",
      quantity: 1,
    });
    expect(beforePromo.priceListId).toBe(retail.id);
    expect(beforePromo.total.minor).toBe(2000n);
    expect(beforePromo.discounts).toHaveLength(0);

    const promo = await createPromotion(repos, ctx, {
      orgId,
      name: "10% off",
      kind: "PERCENTAGE",
      percentageBps: 1000,
      priority: 10,
    });

    // Active org-wide promotions apply to every quote (W3 scope).
    const single = await quotePrice(repos, ctx, {
      orgId,
      variantId: variant.id,
      currency: "USD",
      quantity: 1,
    });
    expect(single.discounts[0]?.promotionId).toBe(promo.id);
    expect(single.total.minor).toBe(1800n);

    const bulk = await quotePrice(repos, ctx, {
      orgId,
      variantId: variant.id,
      currency: "USD",
      quantity: 10,
    });
    expect(bulk.priceListId).toBe(wholesale.id);
    expect(bulk.subtotal.minor).toBe(15000n);
    expect(bulk.total.minor).toBe(13500n);
  });

  it("throws PRICE_NOT_RESOLVED when nothing matches, with reasons", async () => {
    const { repos, orgId, ctx, variant } = await pricedVariant();
    await expect(
      quotePrice(repos, ctx, {
        orgId,
        variantId: variant.id,
        currency: "USD",
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: "PRICE_NOT_RESOLVED" });
  });

  it("requires an unsupported currency to fail fast", async () => {
    const { repos, orgId, ctx, variant } = await pricedVariant();
    await expect(
      quotePrice(repos, ctx, {
        orgId,
        variantId: variant.id,
        currency: "XXX",
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: "CURRENCY_UNSUPPORTED" });
  });
});

describe("promotions (PRICE-003)", () => {
  it("validates kind-specific fields", async () => {
    const { repos, orgId, ctx } = await pricedVariant();
    await expect(
      createPromotion(repos, ctx, {
        orgId,
        name: "broken",
        kind: "PERCENTAGE",
        currency: "USD",
        priority: 1,
      }),
    ).rejects.toThrow();
    await expect(
      createPromotion(repos, ctx, {
        orgId,
        name: "fixed-ok",
        kind: "FIXED",
        amountMinor: "500",
        currency: "usd",
        priority: 1,
      }),
    ).resolves.toMatchObject({ currency: "USD" });
  });
});

describe("inventory (INV-001..003)", () => {
  async function itemWithStock(onHand = 5) {
    const base = await pricedVariant();
    const item = await createInventoryItem(base.repos, base.ctx, {
      orgId: base.orgId,
      variantId: base.variant.id,
      onHand,
    });
    return { ...base, item };
  }

  it("creates one item per location", async () => {
    const { repos, orgId, ctx, variant } = await pricedVariant();
    await createInventoryItem(repos, ctx, { orgId, variantId: variant.id, onHand: 3 });
    await expect(
      createInventoryItem(repos, ctx, { orgId, variantId: variant.id, onHand: 3 }),
    ).rejects.toMatchObject({ code: "INVENTORY_ITEM_EXISTS" });
  });

  it("rejects negative stock on adjustments", async () => {
    const { repos, orgId, ctx, item } = await itemWithStock(2);
    await adjustStock(repos, ctx, {
      orgId,
      itemId: item.id,
      delta: -2,
      reason: "cycle count",
    });
    await expect(
      adjustStock(repos, ctx, {
        orgId,
        itemId: item.id,
        delta: -1,
        reason: "cycle count",
      }),
    ).rejects.toMatchObject({ code: "STOCK_LEVEL_INVALID" });
  });

  it("reserves atomically: the second overselling reservation fails", async () => {
    const { repos, orgId, ctx, item } = await itemWithStock(1);
    const first = await reserveStock(repos, ctx, {
      orgId,
      itemId: item.id,
      quantity: 1,
      ttlSeconds: 900,
    });
    expect(first.item.reserved).toBe(1);
    await expect(
      reserveStock(repos, ctx, {
        orgId,
        itemId: item.id,
        quantity: 1,
        ttlSeconds: 900,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });

  it("releases and commits reservations through the lifecycle", async () => {
    const { repos, orgId, ctx, item } = await itemWithStock(5);
    const { reservation } = await reserveStock(repos, ctx, {
      orgId,
      itemId: item.id,
      quantity: 2,
    });
    await releaseReservation(repos, ctx, { orgId, reservationId: reservation.id });
    expect(item.reserved).toBe(0);

    const second = await reserveStock(repos, ctx, {
      orgId,
      itemId: item.id,
      quantity: 2,
    });
    const committed = await commitReservation(repos, ctx, {
      orgId,
      reservationId: second.reservation.id,
    });
    expect(committed.item.onHand).toBe(3);
    expect(committed.item.reserved).toBe(0);
  });

  it("releases expired reservations in the worker sweep", async () => {
    const { repos, orgId, ctx, item } = await itemWithStock(5);
    await reserveStock(repos, ctx, {
      orgId,
      itemId: item.id,
      quantity: 2,
      ttlSeconds: 3600,
    });
    const result = await releaseExpiredReservations(repos, {
      at: new Date(Date.now() + 3700 * 1000),
    });
    expect(result.released).toBe(1);
    expect(item.reserved).toBe(0);
  });

  it("keeps cross-tenant reservations impossible and leak-free", async () => {
    const { repos, item } = await itemWithStock(5);
    const foreign = ownerContext("org-other", "user-attacker");
    await expect(
      reserveStock(repos, foreign, {
        orgId: "org-other",
        itemId: item.id,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: "INVENTORY_ITEM_NOT_FOUND" });
  });
});
