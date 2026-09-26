import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type CheckoutStatus,
  type TenantContext,
  applyPromotions,
  assertCheckoutTransition,
  buildAuditEvent,
  CANCELLABLE_CHECKOUT_STATES,
  money,
  resolveUnitPrice,
} from "@finalshop/domain";
import { requireSameTenant, requireUserId } from "@finalshop/auth";
import type { AddressRecord, QuoteSnapshot } from "../order-ports";
import type { Repositories } from "../ports";

async function loadCheckout(repos: Repositories, orgId: string, checkoutId: string) {
  const checkout = await repos.checkouts.findById(checkoutId);
  if (!checkout || checkout.orgId !== orgId) {
    throw new DomainError("CHECKOUT_NOT_FOUND", `checkout ${checkoutId} not found`);
  }
  return checkout;
}

async function transition(
  repos: Repositories,
  orgId: string,
  checkoutId: string,
  from: CheckoutStatus,
  to: CheckoutStatus,
) {
  assertCheckoutTransition(from, to);
  return repos.checkouts.markStatus({ id: checkoutId, orgId, status: to });
}

/**
 * CART-002: prices the whole cart once and freezes the result as the
 * checkout quote snapshot — the price lock at the checkout boundary. Unit
 * prices resolve per line from the price lists; org promotions apply once on
 * the subtotal.
 */
export async function priceCheckout(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; cartId: string },
) {
  const parsed = z
    .object({ orgId: z.string().min(1), cartId: z.string().min(1) })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requireUserId(ctx);

  const cart = await repos.carts.findById(parsed.cartId);
  if (!cart || cart.orgId !== parsed.orgId) {
    throw new DomainError("CART_NOT_FOUND", `cart ${parsed.cartId} not found`);
  }
  if (cart.items.length === 0) {
    throw new DomainError("CART_EMPTY", "cannot price an empty cart");
  }
  let checkout = await repos.checkouts.findByCart(cart.id);
  if (checkout && !["CART", "PRICED"].includes(checkout.status)) {
    throw new DomainError(
      "CHECKOUT_CONFLICT",
      `checkout is ${checkout.status} and already priced`,
    );
  }
  if (!checkout) {
    checkout = await repos.checkouts.create({
      orgId: parsed.orgId,
      cartId: cart.id,
      currency: cart.currency,
    });
  }

  const at = new Date();
  const lists = await repos.priceLists.listActive(parsed.orgId, cart.currency, at);
  const priorityByList = new Map(lists.map((l) => [l.id, l.priority]));
  const lines = [];
  const priceListIds = new Set<string>();

  for (const item of cart.items) {
    const variant = await repos.variants.findById(item.variantId);
    if (!variant || variant.orgId !== parsed.orgId) {
      throw new DomainError("PRODUCT_NOT_FOUND", `variant ${item.variantId} not found`);
    }
    const product = await repos.products.findById(variant.productId);
    const prices = await repos.prices.listForVariant(
      parsed.orgId,
      item.variantId,
      lists.map((l) => l.id),
    );
    const resolution = resolveUnitPrice({
      currency: cart.currency,
      quantity: item.quantity,
      at,
      candidates: prices.map((price) => {
        const list = lists.find((l) => l.id === price.priceListId);
        return {
          priceListId: price.priceListId,
          priority: priorityByList.get(price.priceListId) ?? 10000,
          unitPrice: money(list!.currency, price.unitPriceMinor),
          minQuantity: price.minQuantity,
          isActive: true,
          ...(list?.validFrom ? { validFrom: list.validFrom } : {}),
          ...(list?.validTo ? { validTo: list.validTo } : {}),
        };
      }),
    });
    if (!resolution.winner) {
      throw new DomainError(
        "PRICE_NOT_RESOLVED",
        `no price for variant ${item.variantId}` +
          (resolution.rejected.length > 0
            ? ` (rejected: ${resolution.rejected
                .map((r) => `${r.priceListId}:${r.reason}`)
                .join(", ")})`
            : ""),
      );
    }
    priceListIds.add(resolution.winner.priceListId);
    lines.push({
      variantId: variant.id,
      sku: variant.sku,
      title: product?.title ?? variant.sku,
      quantity: item.quantity,
      unitPriceMinor: resolution.winner.unitPrice.minor,
      lineTotalMinor: resolution.winner.unitPrice.minor * BigInt(item.quantity),
    });
  }

  const subtotalMinor = lines.reduce((sum, l) => sum + l.lineTotalMinor, 0n);
  const promotions = await repos.promotions.listActive(parsed.orgId);
  const { total: totalAfterDiscounts } = applyPromotions(
    money(cart.currency, subtotalMinor),
    promotions.map((p) => ({
      id: p.id,
      kind: p.kind,
      ...(p.percentageBps !== null && { percentageBps: p.percentageBps }),
      ...(p.kind === "FIXED" && p.currency === cart.currency && p.amountMinor !== null
        ? { amount: money(p.currency, p.amountMinor) }
        : {}),
      priority: p.priority,
      exclusive: p.exclusive,
      isActive: p.isActive,
    })),
  );
  const discountMinor = subtotalMinor - totalAfterDiscounts.minor;

  const quote: QuoteSnapshot = {
    currency: cart.currency,
    lines,
    subtotalMinor,
    discountMinor,
    totalMinor: totalAfterDiscounts.minor,
    priceListIds: [...priceListIds],
    quotedAt: at.toISOString(),
  };
  checkout = await repos.checkouts.setQuote({
    id: checkout.id,
    orgId: parsed.orgId,
    quote,
  });
  checkout = await transition(repos, parsed.orgId, checkout.id, checkout.status, "PRICED");
  return { checkout, quote };
}

export async function captureCheckoutCustomer(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; checkoutId: string; customerId: string },
) {
  const parsed = z
    .object({
      orgId: z.string().min(1),
      checkoutId: z.string().min(1),
      customerId: z.string().min(1),
    })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const _actor = requireUserId(ctx);
  let checkout = await loadCheckout(repos, parsed.orgId, parsed.checkoutId);
  checkout = await repos.checkouts.setCustomer({
    id: checkout.id,
    orgId: parsed.orgId,
    customerId: parsed.customerId,
  });
  return transition(repos, parsed.orgId, checkout.id, checkout.status, "CUSTOMER_CAPTURED");
}

export const AddressInput = z.object({
  name: z.string().min(1).max(200),
  line1: z.string().min(1).max(300),
  line2: z.string().max(300).optional(),
  city: z.string().min(1).max(100),
  region: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().length(2),
  phone: z.string().max(30).optional(),
});

export async function captureCheckoutAddress(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; checkoutId: string; address: z.input<typeof AddressInput> },
) {
  const parsed = z
    .object({
      orgId: z.string().min(1),
      checkoutId: z.string().min(1),
      address: AddressInput,
    })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requireUserId(ctx);
  const checkout = await loadCheckout(repos, parsed.orgId, parsed.checkoutId);
  const address = parsed.address as AddressRecord;
  await repos.checkouts.setAddress({
    id: checkout.id,
    orgId: parsed.orgId,
    address,
  });
  return transition(repos, parsed.orgId, checkout.id, checkout.status, "ADDRESS_CAPTURED");
}

export async function markCheckoutReviewed(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; checkoutId: string },
) {
  const parsed = z
    .object({ orgId: z.string().min(1), checkoutId: z.string().min(1) })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requireUserId(ctx);
  const checkout = await loadCheckout(repos, parsed.orgId, parsed.checkoutId);
  if (!checkout.quote) {
    throw new DomainError("CHECKOUT_CONFLICT", "checkout has no priced quote");
  }
  return transition(repos, parsed.orgId, checkout.id, checkout.status, "REVIEWED");
}

export async function cancelCheckout(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; checkoutId: string },
) {
  const parsed = z
    .object({ orgId: z.string().min(1), checkoutId: z.string().min(1) })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const actor = requireUserId(ctx);
  const checkout = await loadCheckout(repos, parsed.orgId, parsed.checkoutId);
  if (!CANCELLABLE_CHECKOUT_STATES.includes(checkout.status)) {
    throw new DomainError(
      "CHECKOUT_TRANSITION_INVALID",
      `cannot cancel a checkout in ${checkout.status}`,
    );
  }
  const cancelled = await repos.checkouts.markStatus({
    id: checkout.id,
    orgId: parsed.orgId,
    status: "CANCELLED",
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "checkout.cancelled",
      subjectType: AUDIT_SUBJECTS.CHECKOUT,
      subjectId: checkout.id,
      before: { status: checkout.status },
      after: { status: "CANCELLED" },
    }),
  );
  return cancelled;
}
