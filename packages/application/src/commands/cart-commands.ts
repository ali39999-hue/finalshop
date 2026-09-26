import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  CART_TTL_DAYS,
  DomainError,
  type TenantContext,
  addLine,
  assertCartOpen,
  buildAuditEvent,
  isSupportedCurrency,
  removeLine,
  setLineQuantity,
  type CartLine,
} from "@finalshop/domain";
import { requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

/**
 * Customer-facing cart commands (CART-001). These run under a customer
 * identity — they require an authenticated userId but no staff role; the
 * RBAC matrix governs staff operations, not shoppers.
 */

const CreateCartInput = z.object({
  orgId: z.string().min(1),
  customerId: z.string().min(1).optional(),
  currency: z.string().min(3).max(3),
});

export async function createCart(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof CreateCartInput>,
) {
  const parsed = CreateCartInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const actor = requireUserId(ctx);
  if (!isSupportedCurrency(parsed.currency)) {
    throw new DomainError("CURRENCY_UNSUPPORTED", parsed.currency);
  }
  const cart = await repos.carts.create({
    orgId: parsed.orgId,
    customerId: parsed.customerId ?? actor,
    currency: parsed.currency.toUpperCase(),
    expiresAt: new Date(Date.now() + CART_TTL_DAYS * 86_400_000),
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "cart.created",
      subjectType: AUDIT_SUBJECTS.CART,
      subjectId: cart.id,
    }),
  );
  return cart;
}

const VariantInput = z.object({
  orgId: z.string().min(1),
  cartId: z.string().min(1),
  variantId: z.string().min(1),
});

const QuantityInput = VariantInput.extend({
  quantity: z.number().int().min(1).max(999),
});

async function loadOpenCart(
  repos: Repositories,
  orgId: string,
  cartId: string,
): Promise<{ cart: NonNullable<Awaited<ReturnType<Repositories["carts"]["findById"]>>>; lines: CartLine[] }> {
  const cart = await repos.carts.findById(cartId);
  if (!cart || cart.orgId !== orgId) {
    throw new DomainError("CART_NOT_FOUND", `cart ${cartId} not found`);
  }
  const lines = cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
  assertCartOpen({ status: cart.status, lines, expiresAt: cart.expiresAt }, new Date());
  return { cart, lines };
}

async function assertVariantInOrg(repos: Repositories, orgId: string, variantId: string) {
  const variant = await repos.variants.findById(variantId);
  if (!variant || variant.orgId !== orgId) {
    throw new DomainError("PRODUCT_NOT_FOUND", `variant ${variantId} not found`);
  }
}

export async function addCartItem(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof QuantityInput>,
) {
  const parsed = QuantityInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requireUserId(ctx);
  const { lines } = await loadOpenCart(repos, parsed.orgId, parsed.cartId);
  await assertVariantInOrg(repos, parsed.orgId, parsed.variantId);
  addLine(lines, parsed.variantId, parsed.quantity);
  return repos.carts.addItem(parsed);
}

export async function updateCartItemQuantity(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof QuantityInput>,
) {
  const parsed = QuantityInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requireUserId(ctx);
  const { lines } = await loadOpenCart(repos, parsed.orgId, parsed.cartId);
  setLineQuantity(lines, parsed.variantId, parsed.quantity);
  return repos.carts.setItemQuantity(parsed);
}

export async function removeCartItem(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof VariantInput>,
) {
  const parsed = VariantInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requireUserId(ctx);
  const { lines } = await loadOpenCart(repos, parsed.orgId, parsed.cartId);
  removeLine(lines, parsed.variantId);
  return repos.carts.removeItem(parsed);
}
