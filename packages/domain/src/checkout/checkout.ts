import { DomainError } from "../errors";

/**
 * Checkout state machine (CHK-001, roadmap §8). The machine is independent
 * of UI steps: the storefront may render whatever wizard it likes, the
 * backend only accepts the transitions below.
 *
 * Happy path: CART → PRICED → CUSTOMER_CAPTURED → ADDRESS_CAPTURED →
 * REVIEWED → PAYMENT_PENDING → PAYMENT_CONFIRMED → ORDER_CONFIRMED.
 * FULFILLING/COMPLETED arrive with W6; payment failure/retry in W5.
 */
export type CheckoutStatus =
  | "CART"
  | "PRICED"
  | "CUSTOMER_CAPTURED"
  | "ADDRESS_CAPTURED"
  | "REVIEWED"
  | "PAYMENT_PENDING"
  | "PAYMENT_CONFIRMED"
  | "ORDER_CONFIRMED"
  | "FULFILLING"
  | "COMPLETED"
  | "CANCELLED"
  | "PAYMENT_FAILED"
  | "EXPIRED";

export const CHECKOUT_TRANSITIONS: Record<
  CheckoutStatus,
  readonly CheckoutStatus[]
> = {
  CART: ["PRICED", "CANCELLED", "EXPIRED"],
  PRICED: ["CUSTOMER_CAPTURED", "CANCELLED", "EXPIRED"],
  CUSTOMER_CAPTURED: ["ADDRESS_CAPTURED", "CANCELLED"],
  ADDRESS_CAPTURED: ["REVIEWED", "CANCELLED"],
  REVIEWED: ["PAYMENT_PENDING", "CANCELLED"],
  PAYMENT_PENDING: ["PAYMENT_CONFIRMED", "PAYMENT_FAILED", "CANCELLED"],
  PAYMENT_CONFIRMED: ["ORDER_CONFIRMED"],
  ORDER_CONFIRMED: ["FULFILLING"],
  FULFILLING: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  PAYMENT_FAILED: ["PAYMENT_PENDING"],
  EXPIRED: [],
};

/** States from which the customer can still abandon the checkout. */
export const CANCELLABLE_CHECKOUT_STATES: readonly CheckoutStatus[] = [
  "CART",
  "PRICED",
  "CUSTOMER_CAPTURED",
  "ADDRESS_CAPTURED",
  "REVIEWED",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
];

export function canTransitionCheckout(from: CheckoutStatus, to: CheckoutStatus): boolean {
  return CHECKOUT_TRANSITIONS[from].includes(to);
}

export function assertCheckoutTransition(from: CheckoutStatus, to: CheckoutStatus): void {
  if (!canTransitionCheckout(from, to)) {
    throw new DomainError(
      "CHECKOUT_TRANSITION_INVALID",
      `cannot transition checkout ${from} → ${to}`,
    );
  }
}
