import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type ReturnStatus,
  type TenantContext,
  assertReturnLines,
  assertReturnTransition,
  buildAuditEvent,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

const ReturnInput = z.object({
  orgId: z.string().min(1),
  orderId: z.string().min(1),
  reason: z.string().min(1).max(500),
  lines: z
    .array(
      z.object({
        orderLineId: z.string().min(1),
        quantity: z.number().int().min(1).max(1000),
      }),
    )
    .min(1),
});

/** Opens an RMA against a confirmed/completed order. */
export async function createReturn(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof ReturnInput>,
) {
  const parsed = ReturnInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const actor = requireUserId(ctx);
  const order = await repos.orders.findById(parsed.orderId);
  if (!order || order.orgId !== parsed.orgId) {
    throw new DomainError("ORDER_NOT_FOUND", `order ${parsed.orderId} not found`);
  }
  if (!["CONFIRMED", "FULFILLING", "PARTIALLY_FULFILLED", "COMPLETED"].includes(order.status)) {
    throw new DomainError("RETURN_INVALID", `order ${order.status} cannot be returned`);
  }
  const orderLines = await repos.orders.listLines(parsed.orgId, order.id);
  const returnedByLine = new Map<string, number>();
  for (const existing of await repos.returns.listByOrder(parsed.orgId, order.id)) {
    if (["REJECTED", "CANCELLED"].includes(existing.status)) continue;
    for (const line of existing.lines) {
      returnedByLine.set(
        line.orderLineId,
        (returnedByLine.get(line.orderLineId) ?? 0) + line.quantity,
      );
    }
  }
  assertReturnLines(
    orderLines.map((line) => ({
      orderLineId: line.id,
      quantity: line.quantity,
      alreadyReturned: returnedByLine.get(line.id) ?? 0,
    })),
    parsed.lines,
  );
  const record = await repos.returns.create({
    orgId: parsed.orgId,
    orderId: order.id,
    reason: parsed.reason,
    lines: parsed.lines.map((line) => ({
      orderLineId: line.orderLineId,
      variantId: orderLines.find((l) => l.id === line.orderLineId)!.variantId,
      quantity: line.quantity,
    })),
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "return.created",
      subjectType: AUDIT_SUBJECTS.RETURN,
      subjectId: record.id,
      after: { orderId: order.id, lines: parsed.lines },
    }),
  );
  return record;
}

async function transitionReturn(
  repos: Repositories,
  orgId: string,
  returnId: string,
  from: ReturnStatus,
  to: ReturnStatus,
  refundId?: string,
) {
  assertReturnTransition(from, to);
  return repos.returns.markStatus({
    id: returnId,
    orgId,
    status: to,
    ...(refundId !== undefined && { refundId }),
  });
}

/** Approve / reject / cancel from the REQUESTED state. */
export async function approveReturn(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; returnId: string },
) {
  const parsed = z
    .object({ orgId: z.string().min(1), returnId: z.string().min(1) })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "return.manage");
  requireUserId(ctx);
  const record = await loadReturn(repos, parsed.orgId, parsed.returnId);
  return transitionReturn(repos, parsed.orgId, record.id, record.status, "APPROVED");
}

export async function rejectReturn(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; returnId: string },
) {
  const parsed = z
    .object({ orgId: z.string().min(1), returnId: z.string().min(1) })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "return.manage");
  requireUserId(ctx);
  const record = await loadReturn(repos, parsed.orgId, parsed.returnId);
  return transitionReturn(repos, parsed.orgId, record.id, record.status, "REJECTED");
}

/** Items are physically back; restock when a target inventory item is given. */
export async function markReturnReceived(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; returnId: string; restockItemId?: string },
) {
  const parsed = z
    .object({
      orgId: z.string().min(1),
      returnId: z.string().min(1),
      restockItemId: z.string().min(1).optional(),
    })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "return.manage");
  requireUserId(ctx);
  const record = await loadReturn(repos, parsed.orgId, parsed.returnId);
  if (parsed.restockItemId) {
    const returnLines = record.lines;
    for (const line of returnLines) {
      const orderLine = (await repos.orders.listLines(parsed.orgId, record.orderId)).find(
        (l) => l.id === line.orderLineId,
      );
      const item = await repos.inventoryItems.findById(parsed.restockItemId);
      if (!item || item.orgId !== parsed.orgId) {
        throw new DomainError("INVENTORY_ITEM_NOT_FOUND", parsed.restockItemId);
      }
      if (orderLine && item.variantId !== orderLine.variantId) {
        throw new DomainError(
          "RETURN_INVALID",
          "restock item must match the returned variant",
        );
      }
      await repos.inventoryItems.adjustOnHand({
        id: parsed.restockItemId,
        orgId: parsed.orgId,
        delta: line.quantity,
      });
    }
  }
  return transitionReturn(repos, parsed.orgId, record.id, record.status, "RECEIVED");
}

/**
 * COMPLETED requires the financial linkage: an EXECUTED refund (PAY-003)
 * covering this return.
 */
export async function completeReturn(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; returnId: string; refundId: string },
) {
  const parsed = z
    .object({
      orgId: z.string().min(1),
      returnId: z.string().min(1),
      refundId: z.string().min(1),
    })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "return.manage");
  const actor = requireUserId(ctx);
  const record = await loadReturn(repos, parsed.orgId, parsed.returnId);
  const refund = await repos.refunds.findById(parsed.refundId);
  if (!refund || refund.orgId !== parsed.orgId) {
    throw new DomainError("REFUND_NOT_FOUND", `refund ${parsed.refundId} not found`);
  }
  if (refund.status !== "EXECUTED") {
    throw new DomainError(
      "RETURN_INVALID",
      "return can only complete against an EXECUTED refund",
    );
  }
  const completed = await transitionReturn(
    repos,
    parsed.orgId,
    record.id,
    record.status,
    "COMPLETED",
    parsed.refundId,
  );
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "return.completed",
      subjectType: AUDIT_SUBJECTS.RETURN,
      subjectId: record.id,
      after: { refundId: parsed.refundId },
    }),
  );
  return completed;
}

async function loadReturn(repos: Repositories, orgId: string, returnId: string) {
  const record = await repos.returns.findById(returnId);
  if (!record || record.orgId !== orgId) {
    throw new DomainError("RETURN_NOT_FOUND", `return ${returnId} not found`);
  }
  return record;
}
