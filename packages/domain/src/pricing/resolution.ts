import type { Money } from "../money/money";
import { DomainError } from "../errors";

/**
 * Deterministic price resolution (PRICE-002, roadmap §7.2 steps 2–4):
 * eligible candidates are filtered, then sorted by (priority asc,
 * minQuantity desc, priceListId asc) so the same inputs always yield the
 * same price — pricing must be reproducible for the ERP and the ledger.
 * Rejection reasons are always surfaced so the ERP can explain a price.
 */
export interface PriceCandidate {
  priceListId: string;
  priority: number;
  unitPrice: Money;
  minQuantity: number;
  isActive: boolean;
  validFrom?: Date;
  validTo?: Date;
}

export type RejectionReason =
  | "INACTIVE"
  | "CURRENCY_MISMATCH"
  | "WINDOW_NOT_VALID"
  | "QUANTITY_BELOW_MIN";

export interface RejectedCandidate {
  priceListId: string;
  reason: RejectionReason;
}

export interface ResolvedPrice {
  unitPrice: Money;
  priceListId: string;
}

export interface ResolutionOutcome {
  winner: ResolvedPrice | null;
  rejected: RejectedCandidate[];
}

export function resolveUnitPrice(input: {
  currency: string;
  quantity: number;
  at: Date;
  candidates: PriceCandidate[];
}): ResolutionOutcome {
  const { currency, quantity, at, candidates } = input;
  const rejected: RejectedCandidate[] = [];

  const eligible = candidates.filter((candidate) => {
    if (!candidate.isActive) {
      rejected.push({ priceListId: candidate.priceListId, reason: "INACTIVE" });
      return false;
    }
    if (candidate.unitPrice.currency !== currency) {
      rejected.push({
        priceListId: candidate.priceListId,
        reason: "CURRENCY_MISMATCH",
      });
      return false;
    }
    if (candidate.validFrom && at < candidate.validFrom) {
      rejected.push({
        priceListId: candidate.priceListId,
        reason: "WINDOW_NOT_VALID",
      });
      return false;
    }
    if (candidate.validTo && at > candidate.validTo) {
      rejected.push({
        priceListId: candidate.priceListId,
        reason: "WINDOW_NOT_VALID",
      });
      return false;
    }
    if (candidate.minQuantity > quantity) {
      rejected.push({
        priceListId: candidate.priceListId,
        reason: "QUANTITY_BELOW_MIN",
      });
      return false;
    }
    return true;
  });

  if (eligible.length === 0) return { winner: null, rejected };

  eligible.sort(
    (a, b) =>
      a.priority - b.priority ||
      b.minQuantity - a.minQuantity ||
      (a.priceListId < b.priceListId ? -1 : a.priceListId > b.priceListId ? 1 : 0),
  );

  const winner = eligible[0]!;
  if (winner.unitPrice.minor < 0n) {
    throw new DomainError(
      "PRICE_INVALID",
      `price list ${winner.priceListId} carries a negative price`,
    );
  }
  return {
    winner: { unitPrice: winner.unitPrice, priceListId: winner.priceListId },
    rejected,
  };
}
