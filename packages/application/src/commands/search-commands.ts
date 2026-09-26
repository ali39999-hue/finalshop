import { z } from "zod";
import {
  DomainError,
  getCurrency,
  buildSitemapXml,
  canonicalUrl,
  buildProductJsonLd,
  type SearchDocument,
  type TenantContext,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant } from "@finalshop/auth";
import type { Repositories } from "../ports";

/**
 * W11 indexer: drains the outbox and applies each event to the derived
 * search index. Worker command — no tenant context (org rides on the event).
 */
export async function processOutbox(
  repos: Repositories,
  input: { limit?: number } = {},
) {
  const limit = input.limit ?? 100;
  const pending = await repos.outbox.listPending(null, limit);
  let processed = 0;
  let failed = 0;
  for (const event of pending) {
    try {
      await applyEventToIndex(repos, event.orgId, event.type, event.payload);
      await repos.outbox.markProcessed({ id: event.id, orgId: event.orgId });
      processed += 1;
    } catch {
      await repos.outbox.incrementAttempts({ id: event.id, orgId: event.orgId });
      failed += 1;
    }
  }
  return { processed, failed, remaining: pending.length - processed - failed };
}

async function applyEventToIndex(
  repos: Repositories,
  orgId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const entityId = typeof payload.entityId === "string" ? payload.entityId : null;
  if (!entityId) throw new DomainError("OUTBOX_PAYLOAD_INVALID", "payload.entityId required");

  if (type === "product.changed" || type === "price.changed" || type === "inventory.changed") {
    await indexProduct(repos, orgId, entityId);
  } else if (type === "page.published" || type === "page.unpublished") {
    await indexPage(repos, orgId, entityId);
  } else {
    throw new DomainError("OUTBOX_TYPE_UNKNOWN", type);
  }
}

/** Rebuilds the product document from the source of truth. */
async function indexProduct(repos: Repositories, orgId: string, productId: string) {
  const product = await repos.products.findById(productId);
  if (!product || product.orgId !== orgId || product.status !== "ACTIVE") {
    await repos.searchIndex.remove({ orgId, kind: "product", entityId: productId });
    return;
  }
  const variants = await repos.variants.listByProduct(orgId, product.id);
  const priceListIds = await activePriceListIds(repos, orgId);
  const prices = (
    await Promise.all(
      variants.map((variant) =>
        repos.prices.listForVariant(orgId, variant.id, priceListIds),
      ),
    )
  ).flat();
  const minPrice =
    prices.length > 0
      ? prices.reduce((min, p) => (p.unitPriceMinor < min.unitPriceMinor ? p : min))
      : null;
  const collectionIds: string[] = [];
  for (const collection of await repos.collections.listByOrg(orgId)) {
    const ids = await repos.collections.listProductIds(orgId, collection.id);
    if (ids.includes(product.id)) collectionIds.push(collection.id);
  }
  const bodyParts = [
    product.description ?? "",
    ...variants.map((v) => v.sku),
  ];
  const document: SearchDocument = {
    orgId,
    kind: "product",
    entityId: product.id,
    slug: product.slug,
    locale: "en",
    title: product.title,
    body: bodyParts.filter(Boolean).join(" "),
    currency: minPrice ? "USD" : null,
    priceMinor: minPrice?.unitPriceMinor ?? null,
    collectionIds,
    published: true,
    updatedAt: new Date(),
  };
  await repos.searchIndex.upsert(document);
}

async function activePriceListIds(repos: Repositories, orgId: string): Promise<string[]> {
  return (await repos.priceLists.listByOrg(orgId))
    .filter((pl) => pl.isActive)
    .map((pl) => pl.id);
}

/** Page documents come from the published revision's AST text. */
async function indexPage(repos: Repositories, orgId: string, pageId: string) {
  const page = await repos.pages.findById(pageId);
  if (!page || page.orgId !== orgId || page.status !== "PUBLISHED" || page.publishedRevisionNumber === null) {
    await repos.searchIndex.remove({ orgId, kind: "page", entityId: pageId });
    return;
  }
  const revision = await repos.pageRevisions.findByNumber(
    orgId,
    pageId,
    page.publishedRevisionNumber,
  );
  if (!revision) {
    await repos.searchIndex.remove({ orgId, kind: "page", entityId: pageId });
    return;
  }
  const body = astText(revision.schema);
  const document: SearchDocument = {
    orgId,
    kind: "page",
    entityId: page.id,
    slug: page.slug,
    locale: page.locale,
    title: page.title,
    body,
    currency: null,
    priceMinor: null,
    collectionIds: [],
    published: true,
    updatedAt: new Date(),
  };
  await repos.searchIndex.upsert(document);
}

function astText(node: { props: Record<string, unknown>; children: Array<{ props: Record<string, unknown>; children: unknown[] }> }): string {
  const parts: string[] = [];
  const walk = (current: { props: Record<string, unknown>; children: unknown[] }): void => {
    for (const value of Object.values(current.props ?? {})) {
      if (typeof value === "string" && value.length > 0 && value.length < 500) {
        parts.push(value);
      }
    }
    for (const child of (current.children ?? []) as Array<typeof current>) walk(child);
  };
  walk(node);
  return parts.join(" ");
}

/** Public storefront search (customer context, no staff permission needed). */
export async function searchCatalog(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; text?: string; kind?: "product" | "page"; collectionId?: string; limit?: number },
) {
  const parsed = z
    .object({
      orgId: z.string().min(1),
      text: z.string().max(200).optional(),
      kind: z.enum(["product", "page"]).optional(),
      collectionId: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(100).default(20),
    })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  return repos.searchIndex.search(parsed.orgId, {
    ...(parsed.text !== undefined && { text: parsed.text }),
    ...(parsed.kind !== undefined && { kind: parsed.kind }),
    ...(parsed.collectionId !== undefined && { collectionId: parsed.collectionId }),
    limit: parsed.limit,
  });
}

/** W11: full re-index of an org's products + published pages. */
export async function reindexOrg(repos: Repositories, ctx: TenantContext, input: { orgId: string }) {
  const parsed = z.object({ orgId: z.string().min(1) }).parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "builder.read");
  let indexed = 0;
  for (const product of await repos.products.listByOrg(parsed.orgId, 1000)) {
    await indexProduct(repos, parsed.orgId, product.id);
    indexed += 1;
  }
  for (const page of await repos.pages.listByOrg(parsed.orgId, 1000)) {
    if (page.status === "PUBLISHED") {
      await indexPage(repos, parsed.orgId, page.id);
      indexed += 1;
    }
  }
  return { indexed };
}

/** W11 SEO: sitemap from published pages + active products. */
export async function buildStoreSitemap(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; baseUrl: string; locale: string },
) {
  const parsed = z
    .object({
      orgId: z.string().min(1),
      baseUrl: z.string().min(1).max(200),
      locale: z.string().min(2).max(10),
    })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "cms.read");
  const entries = [] as Array<{ loc: string; changefreq?: "daily" | "weekly" | "monthly"; priority?: string }>;
  for (const page of await repos.pages.listByOrg(parsed.orgId, 500)) {
    if (page.status !== "PUBLISHED") continue;
    entries.push({
      loc: canonicalUrl(parsed.baseUrl, page.locale, page.slug),
      changefreq: "weekly",
      priority: "0.8",
    });
  }
  for (const document of await repos.searchIndex.search(parsed.orgId, { kind: "product", limit: 500 })) {
    entries.push({
      loc: canonicalUrl(parsed.baseUrl, document.locale, `products/${document.slug}`),
      changefreq: "daily",
      priority: "0.6",
    });
  }
  return { xml: buildSitemapXml(entries), entries: entries.length };
}

/** W11 SEO: schema.org JSON-LD for a product with its live price. */
export async function getProductJsonLd(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; productId: string; baseUrl: string },
) {
  const parsed = z
    .object({
      orgId: z.string().min(1),
      productId: z.string().min(1),
      baseUrl: z.string().min(1).max(200),
    })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const product = await repos.products.findById(parsed.productId);
  if (!product || product.orgId !== parsed.orgId) {
    throw new DomainError("PRODUCT_NOT_FOUND", `product ${parsed.productId} not found`);
  }
  const variants = await repos.variants.listByProduct(parsed.orgId, product.id);
  const priceLists = (await repos.priceLists.listByOrg(parsed.orgId)).filter((pl) => pl.isActive && pl.currency === "USD");
  const prices = (
    await Promise.all(
      variants.map((v) => repos.prices.listForVariant(parsed.orgId, v.id, priceLists.map((pl) => pl.id))),
    )
  ).flat();
  const minPrice =
    prices.length > 0
      ? prices.reduce((min, p) => (p.unitPriceMinor < min.unitPriceMinor ? p : min))
      : null;
  const priceMinor = minPrice?.unitPriceMinor ?? null;
  const currency = "USD";
  return buildProductJsonLd({
    name: product.title,
    ...(product.description !== null && { description: product.description }),
    url: `${parsed.baseUrl.replace(/\/+$/, "")}/en/products/${product.slug}`,
    priceMinor,
    currency,
    currencyDecimals: priceMinor !== null ? getCurrency(currency).decimals : 2,
    inStock: variants.length > 0,
  });
}
