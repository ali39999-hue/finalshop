"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addCartItem,
  createCart,
  markCheckoutReviewed,
  placeOrder,
  priceCheckout,
  captureCheckoutCustomer,
  captureCheckoutAddress,
  confirmPayment,
  createPaymentIntent,
  startPaymentAttempt,
  removeCartItem,
  updateCartItemQuantity,
} from "@finalshop/application";
import {
  CART_COOKIE,
  VISITOR_COOKIE,
  getDemoOrgId,
  getRepos,
} from "../lib/kernel";
import { track } from "../lib/analytics";

export async function addToCart(formData: FormData) {
  const orgId = await getDemoOrgId();
  const repos = getRepos();
  const store = await cookies();
  const visitorId = store.get(VISITOR_COOKIE)?.value ?? crypto.randomUUID();
  if (!store.get(VISITOR_COOKIE)) {
    store.set(VISITOR_COOKIE, visitorId, { httpOnly: true, path: "/" });
  }
  const shopper = { orgId, userId: visitorId };

  let cartId = store.get(CART_COOKIE)?.value;
  let cart = cartId ? await repos.carts.findById(cartId) : undefined;
  if (!cart || cart.status !== "OPEN") {
    const created = await createCart(repos, shopper, { orgId, currency: "USD" });
    cartId = created.id;
    cart = created;
    store.set(CART_COOKIE, cartId, { httpOnly: true, path: "/" });
  }

  await addCartItem(repos, shopper, {
    orgId,
    cartId: cart.id,
    variantId: String(formData.get("variantId")),
    quantity: Number(formData.get("quantity") ?? 1),
  });
  await track(repos, shopper, "cart.updated@1", { cartId: cart.id });
  revalidatePath("/cart");
  redirect("/cart");
}

export async function updateCartQuantity(formData: FormData) {
  const orgId = await getDemoOrgId();
  const repos = getRepos();
  const store = await cookies();
  const cartId = store.get(CART_COOKIE)?.value;
  if (!cartId) return;
  await updateCartItemQuantity(repos, { orgId, userId: store.get(VISITOR_COOKIE)?.value ?? "" }, {
    orgId,
    cartId,
    variantId: String(formData.get("variantId")),
    quantity: Number(formData.get("quantity")),
  });
  revalidatePath("/cart");
}

export async function removeCartLine(formData: FormData) {
  const orgId = await getDemoOrgId();
  const repos = getRepos();
  const store = await cookies();
  const cartId = store.get(CART_COOKIE)?.value;
  if (!cartId) return;
  await removeCartItem(repos, { orgId, userId: store.get(VISITOR_COOKIE)?.value ?? "" }, {
    orgId,
    cartId,
    variantId: String(formData.get("variantId")),
  });
  revalidatePath("/cart");
}

/** Walks CART → PRICED → … → REVIEWED and places the order (idempotent). */
export async function submitCheckout(formData: FormData) {
  const orgId = await getDemoOrgId();
  const repos = getRepos();
  const store = await cookies();
  const visitorId = store.get(VISITOR_COOKIE)?.value ?? crypto.randomUUID();
  if (!store.get(VISITOR_COOKIE)) {
    store.set(VISITOR_COOKIE, visitorId, { httpOnly: true, path: "/" });
  }
  const shopper = { orgId, userId: visitorId };
  const cartId = store.get(CART_COOKIE)?.value;
  if (!cartId) redirect("/cart");

  // Price lock at the checkout boundary — the quote snapshot is stored on
  // the checkout and consumed by placeOrder.
  await priceCheckout(repos, shopper, { orgId, cartId });
  const checkout = (await repos.checkouts.findByCart(cartId))!;
  await captureCheckoutCustomer(repos, shopper, {
    orgId,
    checkoutId: checkout.id,
    customerId: visitorId,
  });
  await captureCheckoutAddress(repos, shopper, {
    orgId,
    checkoutId: checkout.id,
    address: {
      name: String(formData.get("name")),
      line1: String(formData.get("line1")),
      city: String(formData.get("city")),
      country: String(formData.get("country")),
    },
  });
  await markCheckoutReviewed(repos, shopper, { orgId, checkoutId: checkout.id });
  await track(repos, shopper, "checkout.started@1", { checkoutId: checkout.id });

  const idempotencyKey = `web-${checkout.id}-${Date.now()}`;
  const { order } = await placeOrder(repos, shopper, {
    orgId,
    checkoutId: checkout.id,
    idempotencyKey,
  });
  await track(repos, shopper, "order.placed@1", {
    checkoutId: checkout.id,
    orderNumber: order.orderNumber,
  });

  // Demo payment simulation: the W5 provider adapter/webhook does this in
  // production — here the storefront server confirms the captured payment.
  const staff = { orgId, userId: "demo-owner", role: "OWNER" as const };
  const intent = await createPaymentIntent(repos, staff, {
    orgId,
    orderId: order.id,
  });
  await startPaymentAttempt(repos, staff, {
    orgId,
    orderId: order.id,
    intentId: intent.id,
    providerId: "demo",
  });
  await confirmPayment(repos, staff, {
    orgId,
    orderId: order.id,
    intentId: intent.id,
    providerRef: `demo_${intent.id}`,
  });

  store.delete(CART_COOKIE);
  redirect(`/order/${order.orderNumber}`);
}

export async function confirmOrderPaymentDemo(formData: FormData) {
  const orgId = await getDemoOrgId();
  const repos = getRepos();
  const staff = { orgId, userId: "demo-owner", role: "OWNER" as const };
  const intent = await createPaymentIntent(repos, staff, {
    orgId,
    orderId: String(formData.get("orderId")),
  });
  await startPaymentAttempt(repos, staff, {
    orgId,
    orderId: String(formData.get("orderId")),
    intentId: intent.id,
    providerId: "demo",
  });
  await confirmPayment(repos, staff, {
    orgId,
    orderId: String(formData.get("orderId")),
    intentId: intent.id,
    providerRef: `demo_${intent.id}`,
  });
  revalidatePath(`/order/${String(formData.get("orderNumber"))}`);
}
