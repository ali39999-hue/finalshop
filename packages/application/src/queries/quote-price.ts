import { z } from "zod";
import {
  DomainError,
  type PriceQuote,
  type TenantContext,
  buildQuote,
  isSupportedCurrency,
  money,
  resolveUnitPrice,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant } from "@finalshop/auth";
import type { PromotionRule } from "@finalshop/domain";
import type { Repositories } from "../ports";

export const QuotePriceInput = z.object({
  orgId: z.string().min(1),
  variantId: z.string().min(1),
  currency: z.string().min(3).max(3),
  quantity: z.number().int().min(1).max(100_000),
  at: z.date().default(() => new Date()),
});

export type QuotePriceInput = z.input<typeof QuotePriceInput>;

export interface QuoteResult extends PriceQuote {
  priceListId: string;
}

/**
 * Deterministic pricing pipeline (roadmap §7.2): resolve the unit price from
 * eligible price lists, evaluate active promotions, and return the full
 * breakdown. Tax lines join in W5.
 */
export async function quotePrice(
  repos: Repositories,
  ctx: TenantContext,
  input: QuotePriceInput,
): Promise<QuoteResult> {
  const parsed = QuotePriceInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "price.read");
  const currency = parsed.currency.toUpperCase();
  if (!isSupportedCurrency(currency)) {
    throw new DomainError("CURRENCY_UNSUPPORTED", parsed.currency);
  }

  const lists = await repos.priceLists.listActive(
    parsed.orgId,
    currency,
    parsed.at,
  );
  const prices = await repos.prices.listForVariant(
    parsed.orgId,
    parsed.variantId,
    lists.map((l) => l.id),
  );
  const priorityByList = new Map(lists.map((l) => [l.id, l.priority]));
  const candidates = prices.map((price) => {
    const list = lists.find((l) => l.id === price.priceListId);
    return {
      priceListId: price.priceListId,
      priority: priorityByList.get(price.priceListId) ?? 10000,
      unitPrice: money(list!.currency, price.unitPriceMinor),
      minQuantity: price.minQuantity,
      isActive: true,
      ...(list?.validFrom ? { validFrom: list.validFrom } : {}),
      ...(list?.validTo ? { validTo: list.validTo } : {}),
    };
  });

  const resolution = resolveUnitPrice({
    currency,
    quantity: parsed.quantity,
    at: parsed.at,
    candidates,
  });
  if (!resolution.winner) {
    throw new DomainError(
      "PRICE_NOT_RESOLVED",
      `no price for variant ${parsed.variantId} in ${currency}` +
        (resolution.rejected.length > 0
          ? ` (rejected: ${resolution.rejected
              .map((r) => `${r.priceListId}:${r.reason}`)
              .join(", ")})`
          : ""),
    );
  }

  const activePromotions = await repos.promotions.listActive(parsed.orgId);
  const rules: PromotionRule[] = activePromotions.map((p) => ({
    id: p.id,
    kind: p.kind,
    ...(p.percentageBps !== null && { percentageBps: p.percentageBps }),
    ...(p.kind === "FIXED" && p.currency === currency && p.amountMinor !== null
      ? { amount: money(p.currency, p.amountMinor) }
      : {}),
    priority: p.priority,
    exclusive: p.exclusive,
    isActive: p.isActive,
  }));

  const quote = buildQuote({
    unitPrice: resolution.winner.unitPrice,
    quantity: parsed.quantity,
    promotions: rules,
  });
  return { ...quote, priceListId: resolution.winner.priceListId };
}
