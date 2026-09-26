import { describe, expect, it } from "vitest";
import { InMemoryRepositories, ownerContext, seedOrgWithStore } from "../testing";
import {
  addCartItem,
  addVariant,
  captureCheckoutAddress,
  captureCheckoutCustomer,
  commitReservation,
  createCart,
  createInventoryItem,
  createPriceList,
  createProduct,
  createPromotion,
  confirmOrderPayment,
  getOrder,
  markCheckoutReviewed,
  placeOrder,
  priceCheckout,
  reserveStock,
  setPrice,
} from "../index";

/**
 * QA-001 golden customer journey, kernel level:
 * browse-ready catalog → cart → priced checkout (price lock) → customer →
 * address → review → order placement (idempotent) → payment confirmed →
 * stock committed. The browser-level E2E joins when the storefront exists.
 */
describe("golden customer journey (QA-001)", () => {
  it("walks browse → cart → checkout → order → payment", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedCatalog(repos);
    const staff = ownerContext(orgId);
    const shopper = { orgId, userId: "customer-1" };

    // Cart (CART-001)
    const cart = await createCart(repos, shopper, { orgId, currency: "USD" });
    const tee = (await repos.products.findBySlug(orgId, "tee"))!;
    const cap = (await repos.products.findBySlug(orgId, "cap"))!;
    const teeVariant = (await repos.variants.listByProduct(orgId, tee.id))[0]!;
    const capVariant = (await repos.variants.listByProduct(orgId, cap.id))[0]!;
    await addCartItem(repos, shopper, {
      orgId,
      cartId: cart.id,
      variantId: teeVariant.id,
      quantity: 2,
    });
    await addCartItem(repos, shopper, {
      orgId,
      cartId: cart.id,
      variantId: capVariant.id,
      quantity: 1,
    });

    // Price lock at the checkout boundary (CART-002):
    // 2×25.00 + 1×10.00 = 60.00, 10% promo → total 54.00
    const { quote } = await priceCheckout(repos, shopper, { orgId, cartId: cart.id });
    expect(quote.subtotalMinor).toBe(6000n);
    expect(quote.discountMinor).toBe(600n);
    expect(quote.totalMinor).toBe(5400n);

    const checkout = (await repos.checkouts.findByCart(cart.id))!;
    await captureCheckoutCustomer(repos, shopper, {
      orgId,
      checkoutId: checkout.id,
      customerId: "customer-1",
    });
    await captureCheckoutAddress(repos, shopper, {
      orgId,
      checkoutId: checkout.id,
      address: {
        name: "Sara Customer",
        line1: "Main St 1",
        city: "Tehran",
        country: "IR",
      },
    });
    await markCheckoutReviewed(repos, shopper, { orgId, checkoutId: checkout.id });

    // Hold stock while payment runs (INV-003).
    const teeItem = await createInventoryItem(repos, staff, {
      orgId,
      variantId: teeVariant.id,
      onHand: 5,
    });
    const { reservation } = await reserveStock(repos, staff, {
      orgId,
      itemId: teeItem.id,
      quantity: 2,
    });

    // Idempotent order placement (CHK-002).
    const key = "order-2026-09-26-0001";
    const placed = await placeOrder(repos, shopper, {
      orgId,
      checkoutId: checkout.id,
      idempotencyKey: key,
    });
    expect(placed.replayed).toBe(false);
    expect(placed.order.orderNumber).toBe("SO-00000001");
    expect(placed.order.totalMinor).toBe(5400n);
    expect(placed.order.status).toBe("PENDING_PAYMENT");

    const replay = await placeOrder(repos, shopper, {
      orgId,
      checkoutId: checkout.id,
      idempotencyKey: key,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.order.id).toBe(placed.order.id);

    // Same key with a different payload → rejected.
    await expect(
      placeOrder(repos, shopper, {
        orgId,
        checkoutId: "chk-other",
        idempotencyKey: key,
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });

    // Payment confirmed (W5 replaces this command with provider webhooks).
    const confirmed = await confirmOrderPayment(repos, staff, {
      orgId,
      orderId: placed.order.id,
    });
    expect(confirmed.status).toBe("CONFIRMED");

    // Reserved stock commits with the confirmed order.
    await commitReservation(repos, staff, { orgId, reservationId: reservation.id });
    const stock = await repos.inventoryItems.findById(teeItem.id);
    expect(stock).toMatchObject({ onHand: 3, reserved: 0 });

    // The customer reads their own order without staff permissions.
    const view = await getOrder(repos, shopper, { orgId, orderId: placed.order.id });
    expect(view.lines).toHaveLength(2);

    // The cart is consumed.
    const converted = await repos.carts.findById(cart.id);
    expect(converted?.status).toBe("CONVERTED");
  });
});

async function seedCatalog(repos: InMemoryRepositories): Promise<{ orgId: string }> {
  const { orgId } = await seedOrgWithStore(repos);
  const ctx = ownerContext(orgId);
  const priceList = await createPriceList(repos, ctx, {
    orgId,
    currency: "USD",
    priority: 10,
  });
  await createPromotion(repos, ctx, {
    orgId,
    name: "10% off everything",
    kind: "PERCENTAGE",
    percentageBps: 1000,
    priority: 10,
  });

  async function addProduct(title: string, slug: string, unitPriceMinor: string) {
    const product = await createProduct(repos, ctx, { orgId, title, slug });
    const variant = await addVariant(repos, ctx, {
      orgId,
      productId: product.id,
      sku: slug.toUpperCase(),
      optionValues: {},
    });
    await setPrice(repos, ctx, {
      orgId,
      priceListId: priceList.id,
      variantId: variant.id,
      minQuantity: 1,
      unitPriceMinor,
    });
  }

  await addProduct("Tee", "tee", "2500");
  await addProduct("Cap", "cap", "1000");
  return { orgId };
}
