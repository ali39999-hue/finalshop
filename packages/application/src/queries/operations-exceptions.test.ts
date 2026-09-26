import { describe, expect, it } from "vitest";
import {
  InMemoryRepositories,
  memberContext,
  ownerContext,
  seedOrgWithStore,
} from "../testing";
import {
  addCartItem,
  addVariant,
  captureCheckoutAddress,
  captureCheckoutCustomer,
  createCart,
  createInventoryItem,
  createPriceList,
  createProduct,
  listOperationsExceptions,
  markCheckoutReviewed,
  placeOrder,
  priceCheckout,
  requestRefund,
  setPrice,
  startPaymentAttempt,
  confirmPayment,
  createPaymentIntent,
} from "../index";

async function seededConfirmedOrder() {
  const repos = new InMemoryRepositories();
  const { orgId } = await seedOrgWithStore(repos);
  const staff = ownerContext(orgId);
  const shopper = { orgId, userId: "customer-1" };
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
  const cart = await createCart(repos, shopper, { orgId, currency: "USD" });
  await addCartItem(repos, shopper, {
    orgId,
    cartId: cart.id,
    variantId: variant.id,
    quantity: 1,
  });
  await priceCheckout(repos, shopper, { orgId, cartId: cart.id });
  const checkout = (await repos.checkouts.findByCart(cart.id))!;
  await captureCheckoutCustomer(repos, shopper, {
    orgId,
    checkoutId: checkout.id,
    customerId: shopper.userId,
  });
  await captureCheckoutAddress(repos, shopper, {
    orgId,
    checkoutId: checkout.id,
    address: { name: "C", line1: "L1", city: "X", country: "IR" },
  });
  await markCheckoutReviewed(repos, shopper, { orgId, checkoutId: checkout.id });
  const { order } = await placeOrder(repos, shopper, {
    orgId,
    checkoutId: checkout.id,
    idempotencyKey: `order-${Math.random().toString(36).slice(2, 14)}-k`,
  });
  const intent = await createPaymentIntent(repos, staff, { orgId, orderId: order.id });
  await startPaymentAttempt(repos, staff, { orgId, orderId: order.id, intentId: intent.id });
  await confirmPayment(repos, staff, {
    orgId,
    orderId: order.id,
    intentId: intent.id,
    providerRef: "ch_1",
  });
  return { repos, orgId, staff, order, variant, shopper };
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

describe("operations exceptions feed (W10)", () => {
  it("surfaces stale payments, unfulfilled orders and out-of-stock variants", async () => {
    const { repos, orgId, staff, order, variant, shopper } =
      await seededConfirmedOrder();
    // Age the confirmed order: placed "30 hours ago", nothing shipped.
    const stored = (await repos.orders.findById(order.id))!;
    stored.placedAt = new Date(Date.now() - 30 * 3_600_000);

    // A second order stays PENDING_PAYMENT and ages the same way.
    const priceList = (await repos.priceLists.listByOrg(orgId))[0]!;
    const cart = await createCart(repos, shopper, { orgId, currency: "USD" });
    await addCartItem(repos, shopper, {
      orgId,
      cartId: cart.id,
      variantId: variant.id,
      quantity: 1,
    });
    await priceCheckout(repos, shopper, { orgId, cartId: cart.id });
    const pendingCheckout = (await repos.checkouts.findByCart(cart.id))!;
    await captureCheckout(repos, shopper, orgId, pendingCheckout.id);
    await markCheckoutReviewed(repos, shopper, { orgId, checkoutId: pendingCheckout.id });
    const pendingOrder = (
      await placeOrder(repos, shopper, {
        orgId,
        checkoutId: pendingCheckout.id,
        idempotencyKey: `order-${Math.random().toString(36).slice(2, 14)}-k`,
      })
    ).order;
    const pendingStored = (await repos.orders.findById(pendingOrder.id))!;
    pendingStored.placedAt = new Date(Date.now() - 30 * 3_600_000);

    // A zero-stock variant is an operational exception.
    await createInventoryItem(repos, staff, {
      orgId,
      variantId: variant.id,
      onHand: 0,
    });

    const exceptions = await listOperationsExceptions(repos, staff, {
      orgId,
      staleHours: 24,
    });
    const kinds = exceptions.map((e) => e.kind);
    expect(kinds).toContain("STALE_PENDING_PAYMENT");
    expect(kinds).toContain("UNFULFILLED_ORDER");
    expect(kinds).toContain("OUT_OF_STOCK");
    void priceList;
  });

  it("joins pending refunds into the feed", async () => {
    const { repos, orgId, staff, order } = await seededConfirmedOrder();
    const refund = await requestRefund(repos, staff, {
      orgId,
      intentId: (await repos.paymentIntents.listByOrder(orgId, order.id))[0]!.id,
      amountMinor: "100",
      reason: "test",
    });
    const exceptions = await listOperationsExceptions(repos, staff, {
      orgId,
      staleHours: 24,
    });
    expect(
      exceptions.some((e) => e.kind === "PENDING_REFUND" && e.ref === refund.id),
    ).toBe(true);
  });

  it("denies the feed without order.read", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedOrgWithStore(repos);
    await expect(
      listOperationsExceptions(repos, memberContext(orgId), {
        orgId,
        staleHours: 24,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});
