import { DomainError } from "../errors";
import { moneyMultiply, type Money } from "../money/money";
import {
  applyPromotions,
  type AppliedPromotion,
  type PromotionRule,
} from "./promotion";

/**
 * Price quote (roadmap §7.2 steps 5–8): unit price × quantity, promotion
 * evaluation, and a full breakdown so the ERP can always explain where a
 * price came from. A discount in a foreign currency surfaces here as
 * CURRENCY_MISMATCH (via moneySubtract inside applyPromotions). Tax lines
 * join in W5; the breakdown shape already carries per-promotion entries.
 */
export interface PriceQuote {
  currency: string;
  quantity: number;
  unitPrice: Money;
  subtotal: Money;
  discounts: AppliedPromotion[];
  total: Money;
}

export function buildQuote(input: {
  unitPrice: Money;
  quantity: number;
  promotions?: PromotionRule[];
}): PriceQuote {
  const { unitPrice, quantity } = input;
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new DomainError("QUOTE_INVALID", `quantity ${quantity} must be ≥ 1`);
  }
  const subtotal = moneyMultiply(unitPrice, quantity);
  const { discounts, total } = applyPromotions(subtotal, input.promotions ?? []);
  return {
    currency: unitPrice.currency,
    quantity,
    unitPrice,
    subtotal,
    discounts,
    total,
  };
}
