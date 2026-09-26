import type {
  AssetKind,
  CollectionKind,
  ProductOption,
  ProductStatus,
} from "@finalshop/domain";

export type { AssetKind, CollectionKind, ProductOption, ProductStatus };

/**
 * Catalog ports (W2, CAT-001..004). Defined here, implemented by
 * packages/infrastructure, faked by the in-memory doubles.
 */

export interface ProductRecord {
  id: string;
  orgId: string;
  slug: string;
  title: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  status: ProductStatus;
  options: ProductOption[];
  createdAt: Date;
  updatedAt: Date;
}

export interface VariantRecord {
  id: string;
  orgId: string;
  productId: string;
  sku: string;
  barcode: string | null;
  optionValues: Record<string, string>;
  weightGrams: number | null;
  createdAt: Date;
}

export interface CategoryRecord {
  id: string;
  orgId: string;
  parentId: string | null;
  slug: string;
  name: string;
  createdAt: Date;
}

export interface CollectionRecord {
  id: string;
  orgId: string;
  slug: string;
  name: string;
  kind: CollectionKind;
  createdAt: Date;
}

export interface AssetRecord {
  id: string;
  orgId: string;
  kind: AssetKind;
  storageKey: string;
  mime: string;
  sizeBytes: number;
  checksum: string | null;
  createdAt: Date;
}

export interface ProductRevisionRecord {
  id: string;
  orgId: string;
  productId: string;
  revisionNumber: number;
  snapshot: Record<string, unknown>;
  authorId: string;
  createdAt: Date;
}

export interface ProductRepository {
  create(input: {
    orgId: string;
    slug: string;
    title: string;
    description?: string | undefined;
    options: ProductOption[];
  }): Promise<ProductRecord>;
  findBySlug(orgId: string, slug: string): Promise<ProductRecord | null>;
  findById(id: string): Promise<ProductRecord | null>;
  listByIds(orgId: string, ids: string[]): Promise<ProductRecord[]>;
  listByOrg(
    orgId: string,
    limit?: number,
    offset?: number,
  ): Promise<ProductRecord[]>;
  updateContent(input: {
    id: string;
    orgId: string;
    title?: string | undefined;
    description?: string | undefined;
    seoTitle?: string | undefined;
    seoDescription?: string | undefined;
  }): Promise<ProductRecord>;
  updateStatus(input: {
    id: string;
    orgId: string;
    status: ProductStatus;
  }): Promise<ProductRecord>;
}

export interface VariantRepository {
  create(input: {
    orgId: string;
    productId: string;
    sku: string;
    barcode?: string | undefined;
    optionValues: Record<string, string>;
    weightGrams?: number | undefined;
  }): Promise<VariantRecord>;
  findById(id: string): Promise<VariantRecord | null>;
  findBySku(orgId: string, sku: string): Promise<VariantRecord | null>;
  listByProduct(orgId: string, productId: string): Promise<VariantRecord[]>;
}

export interface CategoryRepository {
  create(input: {
    orgId: string;
    parentId?: string | undefined;
    slug: string;
    name: string;
  }): Promise<CategoryRecord>;
  findById(id: string): Promise<CategoryRecord | null>;
  findBySlug(orgId: string, slug: string): Promise<CategoryRecord | null>;
  /** The node itself plus all its ancestors, nearest first (one element for a root). */
  parentChain(orgId: string, categoryId: string): Promise<CategoryRecord[]>;
  listByOrg(orgId: string): Promise<CategoryRecord[]>;
}

export interface CollectionRepository {
  create(input: {
    orgId: string;
    slug: string;
    name: string;
    kind: CollectionKind;
  }): Promise<CollectionRecord>;
  findById(id: string): Promise<CollectionRecord | null>;
  findBySlug(orgId: string, slug: string): Promise<CollectionRecord | null>;
  listByOrg(orgId: string): Promise<CollectionRecord[]>;
  addProducts(input: {
    orgId: string;
    collectionId: string;
    productIds: string[];
  }): Promise<void>;
  listProductIds(orgId: string, collectionId: string): Promise<string[]>;
}

export interface AssetRepository {
  create(input: {
    orgId: string;
    kind: AssetKind;
    storageKey: string;
    mime: string;
    sizeBytes: number;
    checksum?: string | undefined;
  }): Promise<AssetRecord>;
  findById(id: string): Promise<AssetRecord | null>;
  listByIds(orgId: string, ids: string[]): Promise<AssetRecord[]>;
  listByOrg(orgId: string, limit?: number): Promise<AssetRecord[]>;
}

export interface ProductRevisionRepository {
  create(input: {
    orgId: string;
    productId: string;
    revisionNumber: number;
    snapshot: Record<string, unknown>;
    authorId: string;
  }): Promise<ProductRevisionRecord>;
  latestNumber(orgId: string, productId: string): Promise<number | null>;
  listByProduct(orgId: string, productId: string): Promise<ProductRevisionRecord[]>;
}
