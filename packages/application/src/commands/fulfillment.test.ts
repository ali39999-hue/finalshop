import { describe, expect, it } from "vitest";
import { InMemoryRepositories, ownerContext, seedOrgWithStore } from "../testing";
import {
  addCartItem,
  addVariant,
  approveRefund,
  captureCheckoutAddress,
  captureCheckoutCustomer,
  completeReturn,
  confirmPayment,
  createCart,
  createFulfillment,
  createInventoryItem,
  createPaymentIntent,
  createPriceList,
  createProduct,
  createReturn,
  createShippingRate,
  deliverFulfillment,
  dispatchFulfillment,
  executeRefund,
  listShippingRates,
  markCheckoutReviewed,
  markReturnReceived,
  placeOrder,
  priceCheckout,
  requestRefund,
  approveReturn,
  setPrice,
  startPaymentAttempt,
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
  const tee = await createProduct(repos, staff, { orgId, title: "Tee", slug: "tee" });
  const teeVariant = await addVariant(repos, staff, {
    orgId,
    productId: tee.id,
    sku: "TEE",
    optionValues: {},
  });
  const cap = await createProduct(repos, staff, { orgId, title: "Cap", slug: "cap" });
  const capVariant = await addVariant(repos, staff, {
    orgId,
    productId: cap.id,
    sku: "CAP",
    optionValues: {},
  });
  await setPrice(repos, staff, {
    orgId,
    priceListId: priceList.id,
    variantId: teeVariant.id,
    minQuantity: 1,
    unitPriceMinor: "2500",
  });
  await setPrice(repos, staff, {
    orgId,
    priceListId: priceList.id,
    variantId: capVariant.id,
    minQuantity: 1,
    unitPriceMinor: "1000",
  });

  const cart = await createCart(repos, shopper, { orgId, currency: "USD" });
  await addCartItem(repos, shopper, {
    orgId,
    cartId: cart.id,
    variantId: teeVariant.id,
    quantity: 3,
  });
  await addCartItem(repos, shopper, {
    orgId,
    cartId: cart.id,
    variantId: capVariant.id,
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
  const lines = await repos.orders.listLines(orgId, order.id);
  const teeLine = lines.find((l) => l.variantId === teeVariant.id)!;
  const capLine = lines.find((l) => l.variantId === capVariant.id)!;
  return { repos, orgId, staff, order, teeLine, capLine, teeVariant, capVariant };
}

describe("fulfillment flow (W6)", () => {
  it("moves the order through partial delivery to completion", async () => {
    const { repos, orgId, staff, order, teeLine, capLine } =
      await seededConfirmedOrder();

    // First (partial) fulfillment: only 2 of 3 tees ship.
    const first = await createFulfillment(repos, staff, {
      orgId,
      orderId: order.id,
      kind: "SHIP",
      lines: [{ orderLineId: teeLine.id, quantity: 2 }],
    });
    const fulfilling = await repos.orders.findById(order.id);
    expect(fulfilling?.status).toBe("FULFILLING");

    await dispatchFulfillment(repos, staff, {
      orgId,
      fulfillmentId: first.id,
      trackingNumber: "TRK-1",
    });
    const shipped = await repos.fulfillments.findById(first.id);
    expect(shipped?.status).toBe("SHIPPED");
    expect(shipped?.trackingNumber).toBe("TRK-1");

    await deliverFulfillment(repos, staff, { orgId, fulfillmentId: first.id });
    // 2 of 3 tees delivered, cap missing → PARTIALLY_FULFILLED.
    expect((await repos.orders.findById(order.id))?.status).toBe("PARTIALLY_FULFILLED");

    const second = await createFulfillment(repos, staff, {
      orgId,
      orderId: order.id,
      kind: "SHIP",
      lines: [
        { orderLineId: teeLine.id, quantity: 1 },
        { orderLineId: capLine.id, quantity: 1 },
      ],
    });
    await dispatchFulfillment(repos, staff, { orgId, fulfillmentId: second.id });
    await deliverFulfillment(repos, staff, { orgId, fulfillmentId: second.id });
    expect((await repos.orders.findById(order.id))?.status).toBe("COMPLETED");

    const events = await repos.fulfillments.listTracking(orgId, first.id);
    expect(events.map((e) => e.description)).toEqual(["Shipped", "Delivered"]);
  });

  it("rejects over-fulfilment beyond outstanding quantities", async () => {
    const { repos, orgId, staff, order, teeLine } = await seededConfirmedOrder();
    await createFulfillment(repos, staff, {
      orgId,
      orderId: order.id,
      lines: [{ orderLineId: teeLine.id, quantity: 3 }],
    });
    await expect(
      createFulfillment(repos, staff, {
        orgId,
        orderId: order.id,
        lines: [{ orderLineId: teeLine.id, quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "FULFILLMENT_INVALID" });
  });
});

describe("returns / RMA with refund linkage (W6)", () => {
  it("completes a return only against an EXECUTED refund and restocks", async () => {
    const { repos, orgId, staff, order, capLine, capVariant } =
      await seededConfirmedOrder();

    const returnRecord = await createReturn(repos, staff, {
      orgId,
      orderId: order.id,
      reason: "wrong color",
      lines: [{ orderLineId: capLine.id, quantity: 1 }],
    });
    await approveReturn(repos, staff, { orgId, returnId: returnRecord.id });

    // Completing requires the refund first.
    const refund = await requestRefund(repos, staff, {
      orgId,
      intentId: (await repos.paymentIntents.listByOrder(orgId, order.id))[0]!.id,
      amountMinor: "1000",
      reason: "wrong color refund",
    });
    await approveRefund(repos, staff, { orgId, refundId: refund.id });
    await executeRefund(repos, staff, { orgId, refundId: refund.id, providerRef: "re_1" });

    // Items arrive back and restock into the cap inventory.
    const item = await createInventoryItem(repos, staff, {
      orgId,
      variantId: capVariant.id,
      onHand: 0,
    });
    await markReturnReceived(repos, staff, {
      orgId,
      returnId: returnRecord.id,
      restockItemId: item.id,
    });
    expect((await repos.inventoryItems.findById(item.id))?.onHand).toBe(1);

    const completed = await completeReturn(repos, staff, {
      orgId,
      returnId: returnRecord.id,
      refundId: refund.id,
    });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.refundId).toBe(refund.id);
  });

  it("rejects completion against a refund that is not executed", async () => {
    const { repos, orgId, staff, order, capLine } = await seededConfirmedOrder();
    const returnRecord = await createReturn(repos, staff, {
      orgId,
      orderId: order.id,
      reason: "changed mind",
      lines: [{ orderLineId: capLine.id, quantity: 1 }],
    });
    await approveReturn(repos, staff, { orgId, returnId: returnRecord.id });
    await markReturnReceived(repos, staff, { orgId, returnId: returnRecord.id });
    const refund = await requestRefund(repos, staff, {
      orgId,
      intentId: (await repos.paymentIntents.listByOrder(orgId, order.id))[0]!.id,
      amountMinor: "1000",
      reason: "refund pending",
    });
    await approveRefund(repos, staff, { orgId, refundId: refund.id });
    await expect(
      completeReturn(repos, staff, {
        orgId,
        returnId: returnRecord.id,
        refundId: refund.id,
      }),
    ).rejects.toMatchObject({ code: "RETURN_INVALID" });
  });
});

describe("shipping rates (W6)", () => {
  it("resolves eligible rates for the tenant, cheapest first", async () => {
    const repos = new InMemoryRepositories();
    const { orgId } = await seedOrgWithStore(repos);
    const staff = ownerContext(orgId);
    await createShippingRate(repos, staff, {
      orgId,
      name: "Standard",
      kind: "FLAT",
      currency: "USD",
      amountMinor: "500",
    });
    await createShippingRate(repos, staff, {
      orgId,
      name: "Pickup",
      kind: "PICKUP",
      currency: "USD",
      amountMinor: "0",
    });
    const rates = await listShippingRates(repos, staff, { orgId, currency: "USD" });
    expect(rates.map((r) => r.kind)).toEqual(["PICKUP", "FLAT"]);
  });
});
