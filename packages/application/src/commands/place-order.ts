import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type TenantContext,
  assertIdempotencyKey,
  buildAuditEvent,
  buildOrderLines,
  computeOrderTotals,
  stableStringify,
} from "@finalshop/domain";
import { requireSameTenant, requireUserId } from "@finalshop/auth";
import type { OrderRecord } from "../order-ports";
import type { Repositories } from "../ports";

export const PlaceOrderInput = z.object({
  orgId: z.string().min(1),
  checkoutId: z.string().min(1),
  /** CHK-002: order placement is a sensitive mutation — key is mandatory. */
  idempotencyKey: z.string().min(16).max(128),
});

export type PlaceOrderInput = z.input<typeof PlaceOrderInput>;

export interface PlaceOrderResult {
  order: OrderRecord;
  /** True when the idempotency key replayed a completed request. */
  replayed: boolean;
}

/**
 * Places the order from the frozen quote snapshot (price lock) and walks
 * REVIEWED → PAYMENT_PENDING. Totals are recomputed server-side from the
 * snapshot lines; payment confirmation (W5) completes the machine.
 */
export async function placeOrder(
  repos: Repositories,
  ctx: TenantContext,
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const parsed = PlaceOrderInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const actor = requireUserId(ctx);
  const key = assertIdempotencyKey(parsed.idempotencyKey);
  const requestHash = stableStringify({
    orgId: parsed.orgId,
    checkoutId: parsed.checkoutId,
  });

  // 1. Replay handling (CHK-002).
  const existing = await repos.idempotency.find(parsed.orgId, key);
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new DomainError(
        "IDEMPOTENCY_KEY_REUSED",
        "key was already used with a different payload",
      );
    }
    if (existing.status === "PENDING") {
      throw new DomainError(
        "IDEMPOTENCY_IN_PROGRESS",
        "an identical request is still in flight",
      );
    }
    if (existing.status === "COMPLETED" && existing.resultSnapshot) {
      const order = await repos.orders.findById(
        existing.resultSnapshot.orderId as string,
      );
      if (order) return { order, replayed: true };
    }
    throw new DomainError("IDEMPOTENCY_KEY_REUSED", "prior attempt failed; use a new key");
  }
  await repos.idempotency.start({ orgId: parsed.orgId, key, requestHash });

  try {
    // 2. Load the reviewed checkout and its frozen quote.
    const checkout = await repos.checkouts.findById(parsed.checkoutId);
    if (!checkout || checkout.orgId !== parsed.orgId) {
      throw new DomainError(
        "CHECKOUT_NOT_FOUND",
        `checkout ${parsed.checkoutId} not found`,
      );
    }
    if (checkout.status !== "REVIEWED" || !checkout.quote) {
      throw new DomainError(
        "CHECKOUT_CONFLICT",
        `checkout must be REVIEWED with a quote, is ${checkout.status}`,
      );
    }
    const cart = await repos.carts.findById(checkout.cartId);
    if (!cart || cart.status !== "OPEN") {
      throw new DomainError("CART_NOT_OPEN", "cart is no longer open");
    }

    // 3. Checkout enters the payment stage.
    await repos.checkouts.markStatus({
      id: checkout.id,
      orgId: parsed.orgId,
      status: "PAYMENT_PENDING",
    });

    // 4. Build the order from the snapshot — server-authoritative totals.
    const quote = checkout.quote;
    const lines = buildOrderLines(
      quote.lines.map((l) => ({
        variantId: l.variantId,
        sku: l.sku,
        title: l.title,
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
      })),
      quote.currency,
      quote.discountMinor,
    );
    const totals = computeOrderTotals(lines);
    const sequence = await repos.orders.nextSequence(parsed.orgId);
    const order = await repos.orders.create({
      orgId: parsed.orgId,
      sequence,
      checkoutId: checkout.id,
      customerId: checkout.customerId,
      currency: quote.currency,
      status: "PENDING_PAYMENT",
      lines,
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountMinor,
      totalMinor: totals.totalMinor,
    });

    // 5. The cart has been consumed.
    await repos.carts.markStatus({
      id: cart.id,
      orgId: parsed.orgId,
      status: "CONVERTED",
    });

    // 6. Record completion for idempotent replays.
    await repos.idempotency.complete({
      orgId: parsed.orgId,
      key,
      resultSnapshot: { orderId: order.id, orderNumber: order.orderNumber },
    });
    await repos.audit.record(
      buildAuditEvent({
        orgId: parsed.orgId,
        actorId: actor,
        action: "order.placed",
        subjectType: AUDIT_SUBJECTS.ORDER,
        subjectId: order.id,
        after: {
          orderNumber: order.orderNumber,
          totalMinor: order.totalMinor.toString(),
          currency: order.currency,
        },
      }),
    );
    return { order, replayed: false };
  } catch (err) {
    await repos.idempotency.fail({
      orgId: parsed.orgId,
      key,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
