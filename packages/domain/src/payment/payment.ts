import { DomainError } from "../errors";
import { assertOrderTransition, type OrderStatus } from "../order/order";

/**
 * Payment kernel (PAY-001, roadmap §9): the domain model is provider-
 * agnostic — providers appear only as `providerId`/`providerRef` references,
 * never as fields on the aggregate. State machines are explicit (roadmap
 * §18). The W4/W5 bridge lives here: a succeeded payment moves the order
 * PENDING_PAYMENT → CONFIRMED.
 */

export type PaymentIntentStatus =
  | "CREATED"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED";

export const PAYMENT_INTENT_TRANSITIONS: Record<
  PaymentIntentStatus,
  readonly PaymentIntentStatus[]
> = {
  CREATED: ["PROCESSING", "CANCELED"],
  PROCESSING: ["SUCCEEDED", "FAILED"],
  SUCCEEDED: [], // terminal — refunds never reopen or alter the intent
  FAILED: ["PROCESSING"], // retry with a new attempt
  CANCELED: [],
};

export type PaymentAttemptStatus = "PROCESSING" | "SUCCEEDED" | "FAILED";

export type RefundStatus = "REQUESTED" | "APPROVED" | "EXECUTED" | "REJECTED" | "FAILED";

export const REFUND_TRANSITIONS: Record<RefundStatus, readonly RefundStatus[]> = {
  REQUESTED: ["APPROVED", "REJECTED"],
  APPROVED: ["EXECUTED", "FAILED"],
  EXECUTED: [],
  REJECTED: [],
  FAILED: [], // retry by creating a new refund request
};

export function canTransitionPaymentIntent(
  from: PaymentIntentStatus,
  to: PaymentIntentStatus,
): boolean {
  return PAYMENT_INTENT_TRANSITIONS[from].includes(to);
}

export function assertPaymentIntentTransition(
  from: PaymentIntentStatus,
  to: PaymentIntentStatus,
): void {
  if (!canTransitionPaymentIntent(from, to)) {
    throw new DomainError(
      "PAYMENT_TRANSITION_INVALID",
      `cannot transition payment intent ${from} → ${to}`,
    );
  }
}

export function assertRefundTransition(from: RefundStatus, to: RefundStatus): void {
  if (!REFUND_TRANSITIONS[from].includes(to)) {
    throw new DomainError(
      "REFUND_TRANSITION_INVALID",
      `cannot transition refund ${from} → ${to}`,
    );
  }
}

export function assertIntentAmount(currency: string, amountMinor: bigint): void {
  if (amountMinor <= 0n) {
    throw new DomainError("PAYMENT_AMOUNT_INVALID", String(amountMinor));
  }
  void currency;
}

/**
 * PAY-003 money trace: the sum of executed + in-flight refunds may never
 * exceed the captured amount.
 */
export function assertRefundable(input: {
  capturedMinor: bigint;
  refundedMinor: bigint;
  requestedMinor: bigint;
}): void {
  const { capturedMinor, refundedMinor, requestedMinor } = input;
  if (capturedMinor <= 0n) {
    throw new DomainError("REFUND_INVALID", "nothing captured to refund");
  }
  if (refundedMinor < 0n || requestedMinor <= 0n) {
    throw new DomainError("REFUND_INVALID", "refund amounts out of range");
  }
  if (refundedMinor + requestedMinor > capturedMinor) {
    throw new DomainError(
      "REFUND_EXCEEDS_CAPTURED",
      `captured ${capturedMinor}, already refunded ${refundedMinor}, requested ${requestedMinor}`,
    );
  }
}

/** Guard used by payment confirmation before flipping the order. */
export function assertOrderConfirmable(status: OrderStatus): void {
  assertOrderTransition(status, "CONFIRMED");
}
