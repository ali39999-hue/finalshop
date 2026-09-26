import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type FulfillmentKind,
  type TenantContext,
  assertFulfilmentLines,
  assertFulfillmentTransition,
  buildAuditEvent,
  canTransitionOrder,
  fulfilmentStageAfterDelivery,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

const FulfilmentInput = z.object({
  orgId: z.string().min(1),
  orderId: z.string().min(1),
  kind: z.enum(["SHIP", "PICKUP"]).default("SHIP"),
  lines: z
    .array(
      z.object({
        orderLineId: z.string().min(1),
        quantity: z.number().int().min(1).max(1000),
      }),
    )
    .min(1),
});

async function loadOrder(repos: Repositories, orgId: string, orderId: string) {
  const order = await repos.orders.findById(orderId);
  if (!order || order.orgId !== orgId) {
    throw new DomainError("ORDER_NOT_FOUND", `order ${orderId} not found`);
  }
  const lines = await repos.orders.listLines(orgId, orderId);
  return { order, lines };
}

/** Creates a (possibly partial) fulfillment and moves the order to FULFILLING. */
export async function createFulfillment(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof FulfilmentInput>,
) {
  const parsed = FulfilmentInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "fulfillment.manage");
  const actor = requireUserId(ctx);
  const { order, lines } = await loadOrder(repos, parsed.orgId, parsed.orderId);
  if (!["CONFIRMED", "FULFILLING", "PARTIALLY_FULFILLED"].includes(order.status)) {
    throw new DomainError(
      "FULFILLMENT_INVALID",
      `order ${order.status} cannot be fulfilled`,
    );
  }

  const fulfilledByLine = new Map<string, number>();
  for (const fulfillment of await repos.fulfillments.listByOrder(parsed.orgId, order.id)) {
    for (const line of fulfillment.lines) {
      fulfilledByLine.set(
        line.orderLineId,
        (fulfilledByLine.get(line.orderLineId) ?? 0) + line.quantity,
      );
    }
  }
  assertFulfilmentLines(
    lines.map((line) => ({
      orderLineId: line.id,
      quantity: line.quantity,
      alreadyFulfilled: fulfilledByLine.get(line.id) ?? 0,
    })),
    parsed.lines,
  );

  const fulfillment = await repos.fulfillments.create({
    orgId: parsed.orgId,
    orderId: order.id,
    kind: parsed.kind as FulfillmentKind,
    lines: parsed.lines.map((line) => ({
      orderLineId: line.orderLineId,
      variantId: lines.find((l) => l.id === line.orderLineId)!.variantId,
      quantity: line.quantity,
    })),
  });
  if (order.status === "CONFIRMED") {
    if (!canTransitionOrder(order.status, "FULFILLING")) {
      throw new DomainError("ORDER_TRANSITION_INVALID", order.status);
    }
    await repos.orders.markStatus({
      id: order.id,
      orgId: parsed.orgId,
      status: "FULFILLING",
    });
  }
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "fulfillment.created",
      subjectType: AUDIT_SUBJECTS.FULFILLMENT,
      subjectId: fulfillment.id,
      after: { orderId: order.id, kind: parsed.kind, lines: parsed.lines },
    }),
  );
  return fulfillment;
}

const DispatchInput = z.object({
  orgId: z.string().min(1),
  fulfillmentId: z.string().min(1),
  trackingNumber: z.string().min(1).max(100).optional(),
  location: z.string().max(100).optional(),
});

/** SHIP → SHIPPED (tracking event) or PICKUP → READY_FOR_PICKUP. */
export async function dispatchFulfillment(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof DispatchInput>,
) {
  const parsed = DispatchInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "fulfillment.manage");
  const actor = requireUserId(ctx);
  const fulfillment = await repos.fulfillments.findById(parsed.fulfillmentId);
  if (!fulfillment || fulfillment.orgId !== parsed.orgId) {
    throw new DomainError(
      "FULFILLMENT_NOT_FOUND",
      `fulfillment ${parsed.fulfillmentId} not found`,
    );
  }
  const to = fulfillment.kind === "PICKUP" ? "READY_FOR_PICKUP" : "SHIPPED";
  assertFulfillmentTransition(fulfillment.status, to);
  const updated = await repos.fulfillments.markStatus({
    id: fulfillment.id,
    orgId: parsed.orgId,
    status: to,
    ...(parsed.trackingNumber !== undefined && {
      trackingNumber: parsed.trackingNumber,
    }),
  });
  await repos.fulfillments.addTrackingEvent({
    orgId: parsed.orgId,
    fulfillmentId: fulfillment.id,
    occurredAt: new Date(),
    description: to === "SHIPPED" ? "Shipped" : "Ready for pickup",
    ...(parsed.location !== undefined && { location: parsed.location }),
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "fulfillment.dispatched",
      subjectType: AUDIT_SUBJECTS.FULFILLMENT,
      subjectId: fulfillment.id,
      after: { status: to, trackingNumber: parsed.trackingNumber ?? null },
    }),
  );
  return updated;
}

/** DELIVERED; when the last outstanding quantity arrives, the order completes. */
export async function deliverFulfillment(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; fulfillmentId: string; location?: string },
) {
  const parsed = z
    .object({
      orgId: z.string().min(1),
      fulfillmentId: z.string().min(1),
      location: z.string().max(100).optional(),
    })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "fulfillment.manage");
  const actor = requireUserId(ctx);
  const fulfillment = await repos.fulfillments.findById(parsed.fulfillmentId);
  if (!fulfillment || fulfillment.orgId !== parsed.orgId) {
    throw new DomainError(
      "FULFILLMENT_NOT_FOUND",
      `fulfillment ${parsed.fulfillmentId} not found`,
    );
  }
  assertFulfillmentTransition(fulfillment.status, "DELIVERED");
  const updated = await repos.fulfillments.markStatus({
    id: fulfillment.id,
    orgId: parsed.orgId,
    status: "DELIVERED",
  });
  await repos.fulfillments.addTrackingEvent({
    orgId: parsed.orgId,
    fulfillmentId: fulfillment.id,
    occurredAt: new Date(),
    description: "Delivered",
    ...(parsed.location !== undefined && { location: parsed.location }),
  });

  // Recompute the order stage across all fulfillments.
  const order = await repos.orders.findById(fulfillment.orderId);
  if (order) {
    const orderLines = await repos.orders.listLines(parsed.orgId, order.id);
    const all = await repos.fulfillments.listByOrder(parsed.orgId, order.id);
    const deliveredByLine = new Map<string, number>();
    for (const f of all) {
      if (f.status !== "DELIVERED") continue;
      for (const line of f.lines) {
        deliveredByLine.set(
          line.orderLineId,
          (deliveredByLine.get(line.orderLineId) ?? 0) + line.quantity,
        );
      }
    }
    const ordered = orderLines.map((l) => l.quantity);
    const delivered = orderLines.map((l) => deliveredByLine.get(l.id) ?? 0);
    const stage = fulfilmentStageAfterDelivery(ordered, delivered);
    if (order.status !== stage && canTransitionOrder(order.status, stage)) {
      await repos.orders.markStatus({
        id: order.id,
        orgId: parsed.orgId,
        status: stage,
      });
    }
  }
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "fulfillment.delivered",
      subjectType: AUDIT_SUBJECTS.FULFILLMENT,
      subjectId: fulfillment.id,
    }),
  );
  return updated;
}
