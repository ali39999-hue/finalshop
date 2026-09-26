import { DomainError } from "../errors";

/**
 * Fulfillment (W6, roadmap §24: shipment, tracking, pickup): an order can
 * carry several fulfillments (partial fulfilment); each ships a subset of
 * the order lines. Stock was already committed at payment confirmation —
 * shipping is the physical movement, tracked by appended events.
 */

export type FulfillmentStatus = "PENDING" | "SHIPPED" | "READY_FOR_PICKUP" | "DELIVERED" | "CANCELLED";

export type FulfillmentKind = "SHIP" | "PICKUP";

export const FULFILLMENT_TRANSITIONS: Record<
  FulfillmentStatus,
  readonly FulfillmentStatus[]
> = {
  PENDING: ["SHIPPED", "READY_FOR_PICKUP", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  READY_FOR_PICKUP: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function assertFulfillmentTransition(
  from: FulfillmentStatus,
  to: FulfillmentStatus,
): void {
  if (!FULFILLMENT_TRANSITIONS[from].includes(to)) {
    throw new DomainError(
      "FULFILLMENT_TRANSITION_INVALID",
      `cannot transition fulfillment ${from} → ${to}`,
    );
  }
}

export interface OrderedLine {
  orderLineId: string;
  quantity: number;
  alreadyFulfilled: number;
}

export interface FulfillmentLineInput {
  orderLineId: string;
  quantity: number;
}

/**
 * A fulfillment may cover part of a line, never more than the outstanding
 * quantity (ordered − already fulfilled).
 */
export function assertFulfilmentLines(
  orderLines: OrderedLine[],
  fulfillmentLines: FulfillmentLineInput[],
): void {
  if (fulfillmentLines.length === 0) {
    throw new DomainError("FULFILLMENT_INVALID", "a fulfillment needs lines");
  }
  const ordered = new Map(orderLines.map((l) => [l.orderLineId, l]));
  for (const line of fulfillmentLines) {
    const reference = ordered.get(line.orderLineId);
    if (!reference) {
      throw new DomainError(
        "FULFILLMENT_INVALID",
        `line ${line.orderLineId} is not part of the order`,
      );
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new DomainError("FULFILLMENT_INVALID", `invalid quantity on ${line.orderLineId}`);
    }
    const outstanding = reference.quantity - reference.alreadyFulfilled;
    if (line.quantity > outstanding) {
      throw new DomainError(
        "FULFILLMENT_INVALID",
        `line ${line.orderLineId}: requested ${line.quantity} exceeds outstanding ${outstanding}`,
      );
    }
  }
}

/** Stage the order lands in after a delivery event. */
export function fulfilmentStageAfterDelivery(
  orderedPerLine: number[],
  deliveredPerLine: number[],
): "FULFILLING" | "PARTIALLY_FULFILLED" | "COMPLETED" {
  const allDelivered = orderedPerLine.every(
    (ordered, i) => (deliveredPerLine[i] ?? 0) >= ordered,
  );
  if (allDelivered) return "COMPLETED";
  const anyDelivered = orderedPerLine.some(
    (ordered, i) => (deliveredPerLine[i] ?? 0) > 0,
  );
  return anyDelivered ? "PARTIALLY_FULFILLED" : "FULFILLING";
}

export interface TrackingEventInput {
  occurredAt: Date;
  description: string;
  location?: string;
}
