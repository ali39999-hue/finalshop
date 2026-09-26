import { z } from "zod";
import type { TenantContext } from "@finalshop/domain";
import { requirePermission, requireSameTenant } from "@finalshop/auth";
import type { Repositories } from "../ports";

/**
 * W10 operations exceptions feed (roadmap §13 "Queues, Exceptions, Tasks"):
 * one query that surfaces everything needing human attention, categorized.
 * The ERP dashboard renders this; the kernel computes it.
 */

export type ExceptionKind =
  | "STALE_PENDING_PAYMENT"
  | "UNFULFILLED_ORDER"
  | "OUT_OF_STOCK"
  | "PENDING_REFUND"
  | "PENDING_RETURN";

export interface OperationsException {
  kind: ExceptionKind;
  ref: string;
  detail: string;
  ageHours: number;
}

const ExceptionsInput = z.object({
  orgId: z.string().min(1),
  /** Orders/refunds older than this many hours surface as exceptions. */
  staleHours: z.number().int().min(1).max(24 * 30).default(24),
});

export async function listOperationsExceptions(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof ExceptionsInput>,
): Promise<OperationsException[]> {
  const parsed = ExceptionsInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "order.read");

  const now = Date.now();
  const staleCutoff = now - parsed.staleHours * 3_600_000;
  const exceptions: OperationsException[] = [];
  const ageHours = (since: Date) =>
    Math.round(((now - since.getTime()) / 3_600_000) * 10) / 10;

  // 1. Orders awaiting payment too long.
  const pendingPayment = await repos.orders.listByStatus(parsed.orgId, "PENDING_PAYMENT");
  for (const order of pendingPayment) {
    if (order.placedAt.getTime() <= staleCutoff) {
      exceptions.push({
        kind: "STALE_PENDING_PAYMENT",
        ref: order.orderNumber,
        detail: `awaiting payment for ${ageHours(order.placedAt)}h`,
        ageHours: ageHours(order.placedAt),
      });
    }
  }

  // 2. Confirmed/fulfilling orders with nothing shipped yet.
  const unfulfilled = await repos.orders.listByStatus(parsed.orgId, "CONFIRMED");
  for (const order of unfulfilled) {
    const fulfillments = await repos.fulfillments.listByOrder(parsed.orgId, order.id);
    if (fulfillments.length === 0 && order.placedAt.getTime() <= staleCutoff) {
      exceptions.push({
        kind: "UNFULFILLED_ORDER",
        ref: order.orderNumber,
        detail: `confirmed ${ageHours(order.placedAt)}h ago, nothing shipped`,
        ageHours: ageHours(order.placedAt),
      });
    }
  }

  // 3. Variants with zero availability.
  const products = await repos.products.listByOrg(parsed.orgId, 1000);
  for (const product of products) {
    const variants = await repos.variants.listByProduct(parsed.orgId, product.id);
    for (const variant of variants) {
      const items = await repos.inventoryItems.findByVariant(parsed.orgId, variant.id);
      const available = items.reduce((sum, item) => sum + item.onHand - item.reserved, 0);
      if (available <= 0) {
        exceptions.push({
          kind: "OUT_OF_STOCK",
          ref: variant.sku,
          detail: `${product.title} is out of stock`,
          ageHours: 0,
        });
      }
    }
  }

  // 4. Refunds waiting on approval/execution.
  for (const refund of await repos.refunds.listPending(parsed.orgId)) {
    exceptions.push({
      kind: "PENDING_REFUND",
      ref: refund.id,
      detail: `${refund.status} refund of ${refund.amountMinor.toString()} ${refund.currency}`,
      ageHours: ageHours(refund.createdAt),
    });
  }

  // 5. Returns stuck in REQUESTED.
  for (const returnRecord of await repos.returns.listByStatus(parsed.orgId, "REQUESTED")) {
    exceptions.push({
      kind: "PENDING_RETURN",
      ref: returnRecord.id,
      detail: `RMA ${returnRecord.id} awaiting decision`,
      ageHours: ageHours(returnRecord.createdAt),
    });
  }

  return exceptions.sort((a, b) => b.ageHours - a.ageHours);
}
