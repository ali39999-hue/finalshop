import { describe, expect, it } from "vitest";
import { InMemoryRepositories, ownerContext, seedOrgWithStore } from "../testing";
import {
  addCartItem,
  addVariant,
  approveRefund,
  captureCheckoutAddress,
  captureCheckoutCustomer,
  createCart,
  createPaymentIntent,
  createPriceList,
  createProduct,
  executeRefund,
  failPayment,
  ingestWebhook,
  markCheckoutReviewed,
  placeOrder,
  priceCheckout,
  reconcileSettlementById,
  recordSettlement,
  requestRefund,
  setPrice,
  startPaymentAttempt,
  confirmPayment,
} from "../index";

/** Seeds an org with a priced product and a placed order, returns helpers. */
async function seededOrder() {
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
    unitPriceMinor: "4000",
  });

  const cart = await createCart(repos, shopper, { orgId, currency: "USD" });
  await addCartItem(repos, shopper, {
    orgId,
    cartId: cart.id,
    variantId: variant.id,
    quantity: 1,
  });
  const { quote } = await priceCheckout(repos, shopper, { orgId, cartId: cart.id });
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
    idempotencyKey: `order-test-${Math.random().toString(36).slice(2, 12)}-k`,
  });
  return { repos, orgId, staff, shopper, order, quote };
}

describe("payment lifecycle (PAY-001)", () => {
  it("confirms payment, flips the order, and posts a balanced journal", async () => {
    const { repos, orgId, staff, order } = await seededOrder();
    const intent = await createPaymentIntent(repos, staff, { orgId, orderId: order.id });
    expect(intent.amountMinor).toBe(order.totalMinor);

    await startPaymentAttempt(repos, staff, {
      orgId,
      orderId: order.id,
      intentId: intent.id,
      providerId: "stripe",
    });
    const confirmed = await confirmPayment(repos, staff, {
      orgId,
      orderId: order.id,
      intentId: intent.id,
      providerRef: "ch_123",
    });
    expect(confirmed.intent.status).toBe("SUCCEEDED");
    expect(confirmed.order.status).toBe("CONFIRMED");

    // Double confirmation is rejected by the state machine.
    await expect(
      confirmPayment(repos, staff, {
        orgId,
        orderId: order.id,
        intentId: intent.id,
        providerRef: "ch_123",
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_TRANSITION_INVALID" });

    // FIN-001: exactly one balanced capture journal.
    expect(
      await repos.journals.existsForSource(orgId, "payment.intent", intent.id),
    ).toBe(true);
    const journals = await repos.journals.listByPeriod(
      orgId,
      new Date(0),
      new Date(Date.now() + 86_400_000),
    );
    const capture = journals.find((j) => j.sourceId === intent.id)!;
    const debits = capture.lines.reduce((s, l) => s + l.debitMinor, 0n);
    const credits = capture.lines.reduce((s, l) => s + l.creditMinor, 0n);
    expect(debits).toBe(credits);
  });

  it("fails payments and marks the checkout", async () => {
    const { repos, orgId, staff, order } = await seededOrder();
    const intent = await createPaymentIntent(repos, staff, { orgId, orderId: order.id });
    await startPaymentAttempt(repos, staff, { orgId, orderId: order.id, intentId: intent.id });
    await failPayment(repos, staff, {
      orgId,
      orderId: order.id,
      intentId: intent.id,
      reason: "card declined",
    });
    const checkout = await repos.checkouts.findById(order.checkoutId);
    expect(checkout?.status).toBe("PAYMENT_FAILED");
    // Retry path: FAILED → PROCESSING is legal again.
    await startPaymentAttempt(repos, staff, {
      orgId,
      orderId: order.id,
      intentId: intent.id,
    });
  });
});

describe("webhook inbox (PAY-002)", () => {
  it("dedupes event ids and processes capture exactly once", async () => {
    const { repos, orgId, staff, order } = await seededOrder();
    const intent = await createPaymentIntent(repos, staff, { orgId, orderId: order.id });
    await startPaymentAttempt(repos, staff, { orgId, orderId: order.id, intentId: intent.id });

    const first = await ingestWebhook(repos, {
      orgId,
      provider: "stripe",
      eventId: "evt_001",
      type: "payment.captured",
      payload: { intentId: intent.id, providerRef: "ch_1" },
    });
    expect(first).toMatchObject({ duplicate: false, status: "PROCESSED" });

    const replay = await ingestWebhook(repos, {
      orgId,
      provider: "stripe",
      eventId: "evt_001",
      type: "payment.captured",
      payload: { intentId: intent.id, providerRef: "ch_1" },
    });
    expect(replay.duplicate).toBe(true);

    // Exactly one capture journal despite the replay.
    const journals = await repos.journals.listByPeriod(
      orgId,
      new Date(0),
      new Date(Date.now() + 86_400_000),
    );
    expect(journals.filter((j) => j.sourceId === intent.id)).toHaveLength(1);
    const confirmed = await repos.orders.findById(order.id);
    expect(confirmed?.status).toBe("CONFIRMED");
  });
});

describe("refunds (PAY-003)", () => {
  it("enforces the money trace: refunds never exceed captures", async () => {
    const { repos, orgId, staff, order } = await seededOrder();
    const intent = await createPaymentIntent(repos, staff, { orgId, orderId: order.id });
    await startPaymentAttempt(repos, staff, { orgId, orderId: order.id, intentId: intent.id });
    await confirmPayment(repos, staff, {
      orgId,
      orderId: order.id,
      intentId: intent.id,
      providerRef: "ch_1",
    });

    const refund = await requestRefund(repos, staff, {
      orgId,
      intentId: intent.id,
      amountMinor: "1000",
      reason: "damaged item",
    });
    await approveRefund(repos, staff, { orgId, refundId: refund.id });
    await executeRefund(repos, staff, {
      orgId,
      refundId: refund.id,
      providerRef: "re_1",
    });
    expect(await repos.refunds.sumExecutedMinor(orgId, intent.id)).toBe(1000n);

    // Over-refunding is rejected by the trace invariant.
    await expect(
      requestRefund(repos, staff, {
        orgId,
        intentId: intent.id,
        amountMinor: "9999",
        reason: "too much",
      }),
    ).rejects.toMatchObject({ code: "REFUND_EXCEEDS_CAPTURED" });
  });
});

describe("settlement reconciliation (FIN-002)", () => {
  it("matches the ledger cash movement", async () => {
    const { repos, orgId, staff, order } = await seededOrder();
    const intent = await createPaymentIntent(repos, staff, { orgId, orderId: order.id });
    await startPaymentAttempt(repos, staff, { orgId, orderId: order.id, intentId: intent.id });
    await confirmPayment(repos, staff, {
      orgId,
      orderId: order.id,
      intentId: intent.id,
      providerRef: "ch_1",
    });

    const settlement = await recordSettlement(repos, staff, {
      orgId,
      provider: "stripe",
      currency: "USD",
      grossMinor: order.totalMinor.toString(),
      feeMinor: "0",
      netMinor: order.totalMinor.toString(),
      periodStart: new Date(Date.now() - 86_400_000),
      periodEnd: new Date(Date.now() + 86_400_000),
    });
    const result = await reconcileSettlementById(repos, staff, {
      orgId,
      settlementId: settlement.id,
    });
    expect(result.status).toBe("MATCHED");
    expect(result.deltaMinor).toBe(0n);
  });
});
