import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type TenantContext,
  assertOrderTransition,
  buildAuditEvent,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

const OrderInput = z.object({
  orgId: z.string().min(1),
  orderId: z.string().min(1),
});

/**
 * W4/W5 bridge: marks payment as confirmed (provider webhooks take over in
 * W5) and walks PAYMENT_CONFIRMED → ORDER_CONFIRMED on the checkout while
 * the order becomes CONFIRMED.
 */
export async function confirmOrderPayment(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof OrderInput>,
) {
  const parsed = OrderInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const actor = requireUserId(ctx);
  const order = await repos.orders.findById(parsed.orderId);
  if (!order || order.orgId !== parsed.orgId) {
    throw new DomainError("ORDER_NOT_FOUND", `order ${parsed.orderId} not found`);
  }
  assertOrderTransition(order.status, "CONFIRMED");

  const checkout = await repos.checkouts.findById(order.checkoutId);
  if (checkout && checkout.status === "PAYMENT_PENDING") {
    await repos.checkouts.markStatus({
      id: checkout.id,
      orgId: parsed.orgId,
      status: "PAYMENT_CONFIRMED",
    });
    await repos.checkouts.markStatus({
      id: checkout.id,
      orgId: parsed.orgId,
      status: "ORDER_CONFIRMED",
    });
  }
  const confirmed = await repos.orders.markStatus({
    id: order.id,
    orgId: parsed.orgId,
    status: "CONFIRMED",
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "order.payment_confirmed",
      subjectType: AUDIT_SUBJECTS.ORDER,
      subjectId: order.id,
      before: { status: order.status },
      after: { status: "CONFIRMED" },
    }),
  );
  return confirmed;
}

export async function cancelOrder(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof OrderInput>,
) {
  const parsed = OrderInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "order.update");
  const actor = requireUserId(ctx);
  const order = await repos.orders.findById(parsed.orderId);
  if (!order || order.orgId !== parsed.orgId) {
    throw new DomainError("ORDER_NOT_FOUND", `order ${parsed.orderId} not found`);
  }
  assertOrderTransition(order.status, "CANCELLED");
  const cancelled = await repos.orders.markStatus({
    id: order.id,
    orgId: parsed.orgId,
    status: "CANCELLED",
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "order.cancelled",
      subjectType: AUDIT_SUBJECTS.ORDER,
      subjectId: order.id,
      before: { status: order.status },
      after: { status: "CANCELLED" },
    }),
  );
  return cancelled;
}
