import { DomainError } from "../errors";

/**
 * Returns / RMA (W6, roadmap §15): REQUESTED → APPROVED → RECEIVED →
 * COMPLETED, with rejection and cancellation exits. COMPLETED requires the
 * financial linkage (an EXECUTED refund, PAY-003) and optionally restocks
 * the received items into an inventory item.
 */

export type ReturnStatus =
  | "REQUESTED"
  | "APPROVED"
  | "RECEIVED"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

export const RETURN_TRANSITIONS: Record<ReturnStatus, readonly ReturnStatus[]> = {
  REQUESTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["RECEIVED", "CANCELLED"],
  RECEIVED: ["COMPLETED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function assertReturnTransition(from: ReturnStatus, to: ReturnStatus): void {
  if (!RETURN_TRANSITIONS[from].includes(to)) {
    throw new DomainError(
      "RETURN_TRANSITION_INVALID",
      `cannot transition return ${from} → ${to}`,
    );
  }
}

export interface ReturnLineInput {
  orderLineId: string;
  quantity: number;
}

/** Same outstanding-quantity discipline as fulfillments, from the return side. */
export function assertReturnLines(
  orderLines: Array<{ orderLineId: string; quantity: number; alreadyReturned: number }>,
  returnLines: ReturnLineInput[],
): void {
  if (returnLines.length === 0) {
    throw new DomainError("RETURN_INVALID", "a return needs lines");
  }
  const ordered = new Map(orderLines.map((l) => [l.orderLineId, l]));
  for (const line of returnLines) {
    const reference = ordered.get(line.orderLineId);
    if (!reference) {
      throw new DomainError(
        "RETURN_INVALID",
        `line ${line.orderLineId} is not part of the order`,
      );
    }
    const outstanding = reference.quantity - reference.alreadyReturned;
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > outstanding) {
      throw new DomainError(
        "RETURN_INVALID",
        `line ${line.orderLineId}: requested ${line.quantity} exceeds outstanding ${outstanding}`,
      );
    }
  }
}
