import { z } from "zod";
import type {
  CheckoutRecord,
  OrderLineRecord,
  OrderRecord,
} from "../order-ports";
import {
  type TenantContext,
  DomainError,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const GetOrderInput = z.object({
  orgId: z.string().min(1),
  orderId: z.string().min(1),
});

/**
 * Staff with order.read see any order in the tenant; the owning customer
 * sees their own order. Everyone else gets the same NOT_FOUND — no
 * existence leak.
 */
export async function getOrder(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof GetOrderInput>,
): Promise<{ order: OrderRecord; lines: OrderLineRecord[] }> {
  const parsed = GetOrderInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const order = await repos.orders.findById(parsed.orderId);
  if (!order || order.orgId !== parsed.orgId) {
    throw new DomainError("ORDER_NOT_FOUND", `order ${parsed.orderId} not found`);
  }
  const isOwner = order.customerId !== null && order.customerId === ctx.userId;
  if (!isOwner) {
    requirePermission(ctx, "order.read");
  }
  const lines = await repos.orders.listLines(parsed.orgId, order.id);
  return { order, lines };
}

export async function getCheckout(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; checkoutId: string },
): Promise<CheckoutRecord> {
  const parsed = z
    .object({ orgId: z.string().min(1), checkoutId: z.string().min(1) })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const checkout = await repos.checkouts.findById(parsed.checkoutId);
  if (!checkout || checkout.orgId !== parsed.orgId) {
    throw new DomainError("CHECKOUT_NOT_FOUND", `checkout ${parsed.checkoutId} not found`);
  }
  return checkout;
}
