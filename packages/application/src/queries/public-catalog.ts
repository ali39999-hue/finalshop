import { z } from "zod";
import type { TenantContext } from "@finalshop/domain";
import { requireSameTenant } from "@finalshop/auth";
import type { ProductRecord } from "../catalog-ports";
import type { Repositories } from "../ports";

export interface PublicProductView {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  /** Lowest active price across variants, minor units. */
  priceMinor: bigint | null;
  currency: string | null;
  variants: Array<{
    id: string;
    sku: string;
    optionValues: Record<string, string>;
    weightGrams: number | null;
  }>;
}

/**
 * Customer-safe catalog reads (storefront): only ACTIVE products, no staff
 * permission — mirrors searchCatalog's public-read discipline.
 */
export async function listPublicProducts(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; limit?: number },
): Promise<PublicProductView[]> {
  const parsed = z
    .object({ orgId: z.string().min(1), limit: z.number().int().min(1).max(200).default(50) })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const products = await repos.products.listByOrg(parsed.orgId, parsed.limit);
  const active = products.filter((p) => p.status === "ACTIVE");
  return Promise.all(active.map((p) => toPublicView(repos, parsed.orgId, p)));
}

export const GetPublicProductInput = z.object({
  orgId: z.string().min(1),
  slug: z.string().min(1),
});

export async function getPublicProductBySlug(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof GetPublicProductInput>,
): Promise<PublicProductView | null> {
  const parsed = GetPublicProductInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const product = await repos.products.findBySlug(parsed.orgId, parsed.slug);
  if (!product || product.status !== "ACTIVE") return null;
  return toPublicView(repos, parsed.orgId, product);
}

async function toPublicView(
  repos: Repositories,
  orgId: string,
  product: ProductRecord,
): Promise<PublicProductView> {
  const variants = await repos.variants.listByProduct(orgId, product.id);
  const priceLists = (await repos.priceLists.listByOrg(orgId)).filter(
    (pl) => pl.isActive,
  );
  const currencyByList = new Map(priceLists.map((pl) => [pl.id, pl.currency]));
  const prices = (
    await Promise.all(
      variants.map((variant) =>
        repos.prices.listForVariant(orgId, variant.id, priceLists.map((pl) => pl.id)),
      ),
    )
  ).flat();
  const minPrice =
    prices.length > 0
      ? prices.reduce((min, p) => (p.unitPriceMinor < min.unitPriceMinor ? p : min))
      : null;
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: product.description,
    priceMinor: minPrice?.unitPriceMinor ?? null,
    currency: minPrice ? (currencyByList.get(minPrice.priceListId) ?? null) : null,
    variants: variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      optionValues: variant.optionValues,
      weightGrams: variant.weightGrams,
    })),
  };
}
