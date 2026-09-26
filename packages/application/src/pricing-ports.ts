import type { PromotionKind } from "@finalshop/domain";

export type { PromotionKind };

/**
 * Pricing ports (W3, PRICE-002/003). Monetary amounts travel as BigInt minor
 * units; the currency always rides on the owning price list / promotion.
 */

export interface PriceListRecord {
  id: string;
  orgId: string;
  currency: string;
  /** Lower wins at resolution time. */
  priority: number;
  isActive: boolean;
  validFrom: Date | null;
  validTo: Date | null;
  createdAt: Date;
}

export interface PriceRecord {
  id: string;
  orgId: string;
  priceListId: string;
  variantId: string;
  /** Quantity tiers: same variant can carry several rows. */
  minQuantity: number;
  unitPriceMinor: bigint;
  createdAt: Date;
}

export interface PromotionRecord {
  id: string;
  orgId: string;
  name: string;
  kind: PromotionKind;
  percentageBps: number | null;
  amountMinor: bigint | null;
  /** FIXED promotions only. */
  currency: string | null;
  priority: number;
  exclusive: boolean;
  isActive: boolean;
  createdAt: Date;
}

export interface PriceListRepository {
  create(input: {
    orgId: string;
    currency: string;
    priority: number;
    validFrom?: Date | undefined;
    validTo?: Date | undefined;
  }): Promise<PriceListRecord>;
  findById(id: string): Promise<PriceListRecord | null>;
  setActive(input: {
    id: string;
    orgId: string;
    isActive: boolean;
  }): Promise<PriceListRecord>;
  setPriority(input: {
    id: string;
    orgId: string;
    priority: number;
  }): Promise<PriceListRecord>;
  /** Active lists whose validity window contains `at`. */
  listActive(orgId: string, currency: string, at: Date): Promise<PriceListRecord[]>;
  listByOrg(orgId: string): Promise<PriceListRecord[]>;
}

export interface PriceRepository {
  /** Upsert keyed on (priceListId, variantId, minQuantity). */
  setPrice(input: {
    orgId: string;
    priceListId: string;
    variantId: string;
    minQuantity: number;
    unitPriceMinor: bigint;
  }): Promise<PriceRecord>;
  listForVariant(
    orgId: string,
    variantId: string,
    priceListIds: string[],
  ): Promise<PriceRecord[]>;
}

export interface PromotionRepository {
  create(input: {
    orgId: string;
    name: string;
    kind: PromotionKind;
    percentageBps?: number | undefined;
    amountMinor?: bigint | undefined;
    currency?: string | undefined;
    priority: number;
    exclusive: boolean;
  }): Promise<PromotionRecord>;
  findById(id: string): Promise<PromotionRecord | null>;
  setActive(input: {
    id: string;
    orgId: string;
    isActive: boolean;
  }): Promise<PromotionRecord>;
  listActive(orgId: string): Promise<PromotionRecord[]>;
}
