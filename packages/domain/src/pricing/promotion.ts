import { DomainError } from "../errors";
import {
  moneyMin,
  moneyPercentBps,
  moneySubtract,
  type Money,
} from "../money/money";

/**
 * Promotion engine (PRICE-003). Promotions apply in a deterministic order
 * (priority asc, then id) on a running subtotal; exclusive promotions stop
 * the chain; a discount can never push the total below zero.
 */
export type PromotionKind = "PERCENTAGE" | "FIXED";

export interface PromotionRule {
  id: string;
  kind: PromotionKind;
  /** PERCENTAGE: 1..10000 basis points. */
  percentageBps?: number;
  /** FIXED: absolute discount. */
  amount?: Money;
  /** Lower applies first. */
  priority: number;
  /** When true, no further promotions stack after this one. */
  exclusive: boolean;
  isActive: boolean;
}

export interface AppliedPromotion {
  promotionId: string;
  amount: Money;
}

export interface PromotionResult {
  discounts: AppliedPromotion[];
  total: Money;
}

export function applyPromotions(
  subtotal: Money,
  rules: PromotionRule[],
): PromotionResult {
  const active = rules
    .filter((r) => r.isActive)
    .sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const discounts: AppliedPromotion[] = [];
  let running = subtotal;
  for (const rule of active) {
    let discount: Money;
    if (rule.kind === "PERCENTAGE") {
      if (rule.percentageBps === undefined || !Number.isInteger(rule.percentageBps)) {
        throw new DomainError(
          "PROMOTION_INVALID",
          `promotion ${rule.id} is missing percentageBps`,
        );
      }
      if (rule.percentageBps < 1 || rule.percentageBps > 10000) {
        throw new DomainError(
          "PROMOTION_INVALID",
          `promotion ${rule.id} bps out of range`,
        );
      }
      discount = moneyPercentBps(running, rule.percentageBps);
    } else {
      if (!rule.amount) {
        throw new DomainError(
          "PROMOTION_INVALID",
          `promotion ${rule.id} is missing amount`,
        );
      }
      discount = rule.amount;
    }
    // Clamp: never discount below zero, never a negative discount.
    discount = moneyMin(discount, running);
    if (discount.minor > 0n) {
      discounts.push({ promotionId: rule.id, amount: discount });
      running = moneySubtract(running, discount);
    }
    if (rule.exclusive) break;
  }
  return { discounts, total: running };
}
