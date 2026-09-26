import {
  Prisma,
  type Asset,
  type Category,
  type Collection,
  type PrismaClient,
  type Product,
  type ProductRevision,
  type ProductVariant,
} from "@prisma/client";
import { DomainError, type ProductOption, type ProductStatus } from "@finalshop/domain";
import type {
  AssetKind,
  AssetRecord,
  AssetRepository,
  CategoryRecord,
  CategoryRepository,
  CollectionRecord,
  CollectionRepository,
  CollectionKind,
  ProductRecord,
  ProductRepository,
  ProductRevisionRecord,
  ProductRevisionRepository,
  VariantRecord,
  VariantRepository,
} from "@finalshop/application";
import { rethrowMapped } from "./prisma-repositories";

const toProduct = (row: Product): ProductRecord => ({
  id: row.id,
  orgId: row.orgId,
  slug: row.slug,
  title: row.title,
  description: row.description,
  seoTitle: row.seoTitle,
  seoDescription: row.seoDescription,
  status: row.status as ProductStatus,
  options: row.options as unknown as ProductOption[],
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toVariant = (row: ProductVariant): VariantRecord => ({
  id: row.id,
  orgId: row.orgId,
  productId: row.productId,
  sku: row.sku,
  barcode: row.barcode,
  optionValues: row.optionValues as unknown as Record<string, string>,
  weightGrams: row.weightGrams,
  createdAt: row.createdAt,
});

const toCategory = (row: Category): CategoryRecord => ({
  id: row.id,
  orgId: row.orgId,
  parentId: row.parentId,
  slug: row.slug,
  name: row.name,
  createdAt: row.createdAt,
});

const toCollection = (row: Collection): CollectionRecord => ({
  id: row.id,
  orgId: row.orgId,
  slug: row.slug,
  name: row.name,
  kind: row.kind as CollectionKind,
  createdAt: row.createdAt,
});

const toAsset = (row: Asset): AssetRecord => ({
  id: row.id,
  orgId: row.orgId,
  kind: row.kind as AssetKind,
  storageKey: row.storageKey,
  mime: row.mime,
  sizeBytes: row.sizeBytes,
  checksum: row.checksum,
  createdAt: row.createdAt,
});

const toRevision = (row: ProductRevision): ProductRevisionRecord => ({
  id: row.id,
  orgId: row.orgId,
  productId: row.productId,
  revisionNumber: row.revisionNumber,
  snapshot: row.snapshot as unknown as Record<string, unknown>,
  authorId: row.authorId,
  createdAt: row.createdAt,
});

/** Product/Variant rows carry JSON columns; cast through unknown for Prisma. */
const json = (value: unknown): Prisma.InputJsonValue =>
  value as unknown as Prisma.InputJsonValue;

/**
 * Prisma implementations of the catalog ports (W2). Composite invariants
 * (option matching, depth, status transitions) live in the domain/application
 * layers; this file persists and maps.
 */
export function createCatalogRepositories(db: PrismaClient): {
  products: ProductRepository;
  variants: VariantRepository;
  categories: CategoryRepository;
  collections: CollectionRepository;
  assets: AssetRepository;
  revisions: ProductRevisionRepository;
} {
  const products: ProductRepository = {
    create: async (input) => {
      try {
        const row = await db.product.create({
          data: {
            orgId: input.orgId,
            slug: input.slug,
            title: input.title,
            ...(input.description !== undefined && {
              description: input.description,
            }),
            options: json(input.options),
          },
        });
        return toProduct(row);
      } catch (err) {
        throw rethrowMapped(
          err,
          "Product_orgId_slug_key",
          "PRODUCT_SLUG_TAKEN",
          input.slug,
        );
      }
    },
    findBySlug: async (orgId, slug) => {
      const row = await db.product.findUnique({
        where: { orgId_slug: { orgId, slug } },
      });
      return row ? toProduct(row) : null;
    },
    findById: async (id) => {
      const row = await db.product.findUnique({ where: { id } });
      return row ? toProduct(row) : null;
    },
    listByIds: async (orgId, ids) => {
      if (ids.length === 0) return [];
      const rows = await db.product.findMany({
        where: { orgId, id: { in: ids } },
      });
      return rows.map(toProduct);
    },
    listByOrg: async (orgId, limit = 50, offset = 0) => {
      const rows = await db.product.findMany({
        where: { orgId },
        orderBy: { createdAt: "asc" },
        take: limit,
        skip: offset,
      });
      return rows.map(toProduct);
    },
    updateContent: async (input) => {
      const existing = await db.product.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) {
        throw new DomainError("PRODUCT_NOT_FOUND", `product ${input.id} not found`);
      }
      const data: Prisma.ProductUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) data.description = input.description;
      if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle;
      if (input.seoDescription !== undefined) {
        data.seoDescription = input.seoDescription;
      }
      const row = await db.product.update({ where: { id: input.id }, data });
      return toProduct(row);
    },
    updateStatus: async (input) => {
      const existing = await db.product.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) {
        throw new DomainError("PRODUCT_NOT_FOUND", `product ${input.id} not found`);
      }
      const row = await db.product.update({
        where: { id: input.id },
        data: { status: input.status },
      });
      return toProduct(row);
    },
  };

  const variants: VariantRepository = {
    create: async (input) => {
      try {
        const row = await db.productVariant.create({
          data: {
            orgId: input.orgId,
            productId: input.productId,
            sku: input.sku,
            ...(input.barcode !== undefined && { barcode: input.barcode }),
            optionValues: json(input.optionValues),
            ...(input.weightGrams !== undefined && {
              weightGrams: input.weightGrams,
            }),
          },
        });
        return toVariant(row);
      } catch (err) {
        throw rethrowMapped(err, "ProductVariant_orgId_sku_key", "SKU_TAKEN", input.sku);
      }
    },
    findById: async (id) => {
      const row = await db.productVariant.findUnique({ where: { id } });
      return row ? toVariant(row) : null;
    },
    findBySku: async (orgId, sku) => {
      const row = await db.productVariant.findUnique({
        where: { orgId_sku: { orgId, sku } },
      });
      return row ? toVariant(row) : null;
    },
    listByProduct: async (orgId, productId) => {
      const rows = await db.productVariant.findMany({
        where: { orgId, productId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toVariant);
    },
  };

  const categories: CategoryRepository = {
    create: async (input) => {
      try {
        const row = await db.category.create({
          data: {
            orgId: input.orgId,
            ...(input.parentId !== undefined && { parentId: input.parentId }),
            slug: input.slug,
            name: input.name,
          },
        });
        return toCategory(row);
      } catch (err) {
        throw rethrowMapped(
          err,
          "Category_orgId_slug_key",
          "CATEGORY_SLUG_TAKEN",
          input.slug,
        );
      }
    },
    findById: async (id) => {
      const row = await db.category.findUnique({ where: { id } });
      return row ? toCategory(row) : null;
    },
    findBySlug: async (orgId, slug) => {
      const row = await db.category.findUnique({
        where: { orgId_slug: { orgId, slug } },
      });
      return row ? toCategory(row) : null;
    },
    // The node itself plus its ancestors, nearest first; the visited guard
    // terminates cleanly on corrupted (cyclic) data.
    parentChain: async (orgId, categoryId) => {
      const chain: CategoryRecord[] = [];
      const guard = new Set<string>();
      let cursor = await db.category.findUnique({ where: { id: categoryId } });
      while (cursor && cursor.orgId === orgId && !guard.has(cursor.id)) {
        guard.add(cursor.id);
        chain.push(toCategory(cursor));
        if (!cursor.parentId) break;
        cursor = await db.category.findUnique({ where: { id: cursor.parentId } });
      }
      return chain;
    },
    listByOrg: async (orgId) => {
      const rows = await db.category.findMany({
        where: { orgId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toCategory);
    },
  };

  const collections: CollectionRepository = {
    create: async (input) => {
      try {
        const row = await db.collection.create({
          data: {
            orgId: input.orgId,
            slug: input.slug,
            name: input.name,
            kind: input.kind,
          },
        });
        return toCollection(row);
      } catch (err) {
        throw rethrowMapped(
          err,
          "Collection_orgId_slug_key",
          "COLLECTION_SLUG_TAKEN",
          input.slug,
        );
      }
    },
    findById: async (id) => {
      const row = await db.collection.findUnique({ where: { id } });
      return row ? toCollection(row) : null;
    },
    findBySlug: async (orgId, slug) => {
      const row = await db.collection.findUnique({
        where: { orgId_slug: { orgId, slug } },
      });
      return row ? toCollection(row) : null;
    },
    listByOrg: async (orgId) => {
      const rows = await db.collection.findMany({
        where: { orgId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toCollection);
    },
    addProducts: async (input) => {
      await db.collectionProduct.createMany({
        data: input.productIds.map((productId) => ({
          orgId: input.orgId,
          collectionId: input.collectionId,
          productId,
        })),
        skipDuplicates: true,
      });
    },
    listProductIds: async (orgId, collectionId) => {
      const rows = await db.collectionProduct.findMany({
        where: { orgId, collectionId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => row.productId);
    },
  };

  const assets: AssetRepository = {
    create: async (input) => {
      try {
        const row = await db.asset.create({
          data: {
            orgId: input.orgId,
            kind: input.kind,
            storageKey: input.storageKey,
            mime: input.mime,
            sizeBytes: input.sizeBytes,
            ...(input.checksum !== undefined && { checksum: input.checksum }),
          },
        });
        return toAsset(row);
      } catch (err) {
        throw rethrowMapped(
          err,
          "Asset_storageKey_key",
          "ASSET_KEY_TAKEN",
          input.storageKey,
        );
      }
    },
    findById: async (id) => {
      const row = await db.asset.findUnique({ where: { id } });
      return row ? toAsset(row) : null;
    },
    listByOrg: async (orgId, limit = 200) => {
      const rows = await db.asset.findMany({
        where: { orgId },
        orderBy: { createdAt: "asc" },
        take: limit,
      });
      return rows.map(toAsset);
    },
    listByIds: async (orgId, ids) => {
      if (ids.length === 0) return [];
      const rows = await db.asset.findMany({
        where: { orgId, id: { in: ids } },
      });
      return rows.map(toAsset);
    },
  };

  const revisions: ProductRevisionRepository = {
    create: async (input) => {
      try {
        const row = await db.productRevision.create({
          data: {
            orgId: input.orgId,
            productId: input.productId,
            revisionNumber: input.revisionNumber,
            snapshot: json(input.snapshot),
            authorId: input.authorId,
          },
        });
        return toRevision(row);
      } catch (err) {
        throw rethrowMapped(
          err,
          "ProductRevision_productId_revisionNumber_key",
          "REVISION_CONFLICT",
          input.revisionNumber.toString(),
        );
      }
    },
    latestNumber: async (orgId, productId) => {
      const row = await db.productRevision.findFirst({
        where: { orgId, productId },
        orderBy: { revisionNumber: "desc" },
        select: { revisionNumber: true },
      });
      return row?.revisionNumber ?? null;
    },
    listByProduct: async (orgId, productId) => {
      const rows = await db.productRevision.findMany({
        where: { orgId, productId },
        orderBy: { revisionNumber: "asc" },
      });
      return rows.map(toRevision);
    },
  };

  return { products, variants, categories, collections, assets, revisions };
}
