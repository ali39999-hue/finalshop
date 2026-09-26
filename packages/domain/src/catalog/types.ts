/**
 * Catalog value objects (W2, CAT-001..004).
 * Product/Variant separation follows roadmap §7.1: content, SEO, options and
 * media live on the product; SKU, barcode, weight and (from W3) stock live on
 * the variant.
 */

export type ProductStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type AssetKind = "IMAGE" | "VIDEO" | "FILE";
/** Rule-based ("smart") collections arrive with search/faceting (W11). */
export type CollectionKind = "MANUAL";

export interface ProductOption {
  /** e.g. "Size" */
  name: string;
  /** e.g. ["S", "M", "L"] */
  values: string[];
}

/** Explicit, audited status transitions (roadmap §18: every lifecycle is a state machine). */
export const PRODUCT_STATUS_TRANSITIONS: Record<
  ProductStatus,
  readonly ProductStatus[]
> = {
  DRAFT: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canTransitionProductStatus(
  from: ProductStatus,
  to: ProductStatus,
): boolean {
  return PRODUCT_STATUS_TRANSITIONS[from].includes(to);
}
