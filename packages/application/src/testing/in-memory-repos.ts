import { DomainError, type TenantContext } from "@finalshop/domain";
import type {
  InventoryItemRecord,
  InventoryItemRepository,
  ReservationRecord,
  ReservationRepository,
} from "../inventory-ports";
import type {
  PriceListRecord,
  PriceListRepository,
  PriceRecord,
  PriceRepository,
  PromotionRecord,
  PromotionRepository,
} from "../pricing-ports";
import type {
  CartItemRecord,
  CartRecord,
  CartRepository,
  CheckoutRecord,
  CheckoutRepository,
  IdempotencyRecord,
  IdempotencyRepository,
  OrderLineRecord,
  OrderRecord,
  OrderRepository,
} from "../order-ports";
import type {
  JournalLineRecord,
  JournalRecord,
  JournalRepository,
  PaymentAttemptRecord,
  PaymentAttemptRepository,
  PaymentIntentRecord,
  PaymentIntentRepository,
  RefundRecord,
  RefundRepository,
  SettlementRecord,
  SettlementRepository,
  TaxRateRecord,
  TaxRateRepository,
  WebhookEventRecord,
  WebhookEventRepository,
} from "../payment-finance-ports";
import type {
  FulfillmentLineRecord,
  FulfillmentRecord,
  FulfillmentRepository,
  ReturnLineRecord,
  ReturnRecord,
  ReturnRepository,
  ShippingRateRecord,
  ShippingRateRepository,
  TrackingEventRecord,
} from "../fulfillment-ports";
import type {
  PageRecord,
  PageRepository,
  PageRevisionRecord,
  PageRevisionRepository,
} from "../cms-ports";
import type {
  BlockDefinitionRecord,
  BlockDefinitionRepository,
  ThemeRecord,
  ThemeRepository,
  ThemeTemplateRecord,
  ThemeTemplateRepository,
} from "../builder-theme-ports";
import type {
  CloneManifestRecord,
  CloneManifestRepository,
  ForkLinkRecord,
  ForkLinkRepository,
} from "../clone-ports";
import type {
  OutboxEventRecord,
  OutboxRepository,
  SearchDocument,
  SearchIndexRepository,
} from "../search-ports";
import type {
  PluginRecord,
  PluginRepository,
  WebhookDeliveryRecord,
  WebhookDeliveryRepository,
  WebhookSubscriptionRecord,
  WebhookSubscriptionRepository,
} from "../extension-ports";
import type {
  AnalyticsEventRecord,
  AnalyticsEventRepository,
  RateLimitCounterRecord,
  RateLimitCounterRepository,
  RateLimitPolicyRecord,
  RateLimitPolicyRepository,
} from "../analytics-ports";
import type {
  UserRecord,
  UserRepository,
} from "../user-ports";
import type {
  AssetRecord,
  AssetRepository,
  CategoryRecord,
  CategoryRepository,
  CollectionRecord,
  CollectionRepository,
  ProductRecord,
  ProductRepository,
  ProductRevisionRecord,
  ProductRevisionRepository,
  VariantRecord,
  VariantRepository,
} from "../catalog-ports";
import type {
  AuditEvent,
  AuditRepository,
  BranchRecord,
  BranchRepository,
  DomainRecord,
  DomainRepository,
  MembershipRecord,
  MembershipRepository,
  OrganizationRecord,
  OrganizationRepository,
  Repositories,
  StoreRecord,
  StoreRepository,
  StorefrontRecord,
  StorefrontRepository,
} from "../ports";

/**
 * In-memory implementations of the application ports, used by unit tests in
 * this package and available to other packages via the
 * `@finalshop/application/testing` subpath. They mirror the
 * persistence-relevant behavior of the Prisma repositories (uniqueness
 * constraints, primary-domain handling, joined lookups) without a database.
 */
export class InMemoryRepositories implements Repositories {
  /**
   * Shared across instances: two fresh instances inside one test must never
   * produce colliding ids, or cross-tenant scenarios silently pass.
   */
  private static counter = 0;
  private readonly orgMap = new Map<string, OrganizationRecord>();
  private readonly storeMap = new Map<string, StoreRecord>();
  private readonly storefrontMap = new Map<string, StorefrontRecord>();
  private readonly branchMap = new Map<string, BranchRecord>();
  private readonly domainMap = new Map<string, DomainRecord>();
  private readonly membershipMap = new Map<string, MembershipRecord>();
  private readonly auditLog: AuditEvent[] = [];
  private readonly productMap = new Map<string, ProductRecord>();
  private readonly variantMap = new Map<string, VariantRecord>();
  private readonly categoryMap = new Map<string, CategoryRecord>();
  private readonly collectionMap = new Map<string, CollectionRecord>();
  private readonly collectionProducts = new Set<string>();
  private readonly assetMap = new Map<string, AssetRecord>();
  private readonly revisionMap = new Map<string, ProductRevisionRecord>();
  private readonly priceListMap = new Map<string, PriceListRecord>();
  private readonly priceMap = new Map<string, PriceRecord>();
  private readonly promotionMap = new Map<string, PromotionRecord>();
  private readonly inventoryItemMap = new Map<string, InventoryItemRecord>();
  private readonly reservationMap = new Map<string, ReservationRecord>();
  private readonly cartMap = new Map<string, CartRecord>();
  private readonly cartItemMap = new Map<string, CartItemRecord>();
  private readonly checkoutMap = new Map<string, CheckoutRecord>();
  private readonly orderMap = new Map<string, OrderRecord>();
  private readonly orderLineMap = new Map<string, OrderLineRecord>();
  private readonly orderSequences = new Map<string, number>();
  private readonly idempotencyMap = new Map<string, IdempotencyRecord>();
  private readonly intentMap = new Map<string, PaymentIntentRecord>();
  private readonly attemptMap = new Map<string, PaymentAttemptRecord>();
  private readonly refundMap = new Map<string, RefundRecord>();
  private readonly webhookMap = new Map<string, WebhookEventRecord>();
  private readonly journalMap = new Map<string, JournalRecord>();
  private readonly journalLineMap = new Map<string, JournalLineRecord>();
  private readonly settlementMap = new Map<string, SettlementRecord>();
  private readonly taxRateMap = new Map<string, TaxRateRecord>();
  private readonly fulfillmentMap = new Map<string, FulfillmentRecord>();
  private readonly fulfillmentLineMap = new Map<string, FulfillmentLineRecord>();
  private readonly trackingMap = new Map<string, TrackingEventRecord>();
  private readonly returnMap = new Map<string, ReturnRecord>();
  private readonly returnLineMap = new Map<string, ReturnLineRecord>();
  private readonly shippingRateMap = new Map<string, ShippingRateRecord>();
  private readonly pageMap = new Map<string, PageRecord>();
  private readonly pageRevisionMap = new Map<string, PageRevisionRecord>();
  private readonly blockDefinitionMap = new Map<string, BlockDefinitionRecord>();
  private readonly themeMap = new Map<string, ThemeRecord>();
  private readonly themeTemplateMap = new Map<string, ThemeTemplateRecord>();
  private readonly forkLinkMap = new Map<string, ForkLinkRecord>();
  private readonly cloneManifestMap = new Map<string, CloneManifestRecord>();
  private readonly outboxMap = new Map<string, OutboxEventRecord>();
  private readonly searchIndexMap = new Map<string, SearchDocument>();
  private readonly pluginMap = new Map<string, PluginRecord>();
  private readonly webhookSubscriptionMap = new Map<string, WebhookSubscriptionRecord>();
  private readonly webhookDeliveryMap = new Map<string, WebhookDeliveryRecord>();
  private readonly analyticsEventMap = new Map<string, AnalyticsEventRecord>();
  private readonly rateLimitPolicyMap = new Map<string, RateLimitPolicyRecord>();
  private readonly rateLimitCounterMap = new Map<string, RateLimitCounterRecord>();
  private readonly userMap = new Map<string, UserRecord>();

  private id(prefix: string): string {
    return `${prefix}-${++InMemoryRepositories.counter}`;
  }

  readonly organizations: OrganizationRepository = {
    createWithOwner: async (input) => {
      const organization: OrganizationRecord = {
        id: this.id("org"),
        slug: input.slug,
        name: input.name,
        status: "ACTIVE",
        createdAt: new Date(),
      };
      this.orgMap.set(organization.id, organization);
      const membership: MembershipRecord = {
        id: this.id("mem"),
        orgId: organization.id,
        userId: input.ownerUserId,
        role: "OWNER",
        createdAt: new Date(),
      };
      this.membershipMap.set(membership.id, membership);
      return { organization, membership };
    },
    findBySlug: async (slug) =>
      [...this.orgMap.values()].find((o) => o.slug === slug) ?? null,
    findById: async (id) => this.orgMap.get(id) ?? null,
  };

  readonly stores: StoreRepository = {
    createWithDefaultStorefront: async (input) => {
      const store: StoreRecord = {
        id: this.id("store"),
        orgId: input.orgId,
        slug: input.slug,
        name: input.name,
        status: "ACTIVE",
        createdAt: new Date(),
      };
      this.storeMap.set(store.id, store);
      const storefront: StorefrontRecord = {
        id: this.id("sf"),
        orgId: input.orgId,
        storeId: store.id,
        name: input.name,
        locale: input.locale,
        isDefault: true,
        createdAt: new Date(),
      };
      this.storefrontMap.set(storefront.id, storefront);
      return { store, storefront };
    },
    findBySlug: async (orgId, slug) =>
      [...this.storeMap.values()].find(
        (s) => s.orgId === orgId && s.slug === slug,
      ) ?? null,
    findById: async (id) => this.storeMap.get(id) ?? null,
  };

  readonly storefronts: StorefrontRepository = {
    findById: async (id) => this.storefrontMap.get(id) ?? null,
  };

  readonly branches: BranchRepository = {
    create: async (input) => {
      const branch: BranchRecord = {
        id: this.id("branch"),
        ...input,
        createdAt: new Date(),
      };
      this.branchMap.set(branch.id, branch);
      return branch;
    },
    findById: async (id) => this.branchMap.get(id) ?? null,
    listByStore: async (orgId, storeId) =>
      [...this.branchMap.values()].filter(
        (b) => b.orgId === orgId && b.storeId === storeId,
      ),
  };

  readonly domains: DomainRepository = {
    attach: async (input) => {
      if ([...this.domainMap.values()].some((d) => d.host === input.host)) {
        throw new DomainError(
          "DOMAIN_HOST_TAKEN",
          `host ${input.host} is already attached`,
        );
      }
      if (input.isPrimary) {
        for (const d of this.domainMap.values()) {
          if (d.orgId === input.orgId) d.isPrimary = false;
        }
      }
      const domain: DomainRecord = {
        id: this.id("dom"),
        orgId: input.orgId,
        storefrontId: input.storefrontId,
        host: input.host,
        isPrimary: input.isPrimary,
        verified: false,
        createdAt: new Date(),
      };
      this.domainMap.set(domain.id, domain);
      return domain;
    },
    findById: async (id) => this.domainMap.get(id) ?? null,
    setVerified: async (orgId, domainId, verified) => {
      const domain = this.domainMap.get(domainId);
      if (!domain || domain.orgId !== orgId) {
        throw new DomainError("DOMAIN_NOT_FOUND", `domain ${domainId} not found`);
      }
      domain.verified = verified;
      return domain;
    },
    findByHostJoined: async (host) => {
      const domain = [...this.domainMap.values()].find((d) => d.host === host);
      if (!domain) return null;
      const storefront = this.storefrontMap.get(domain.storefrontId);
      const store = storefront
        ? this.storeMap.get(storefront.storeId)
        : undefined;
      const organization = store ? this.orgMap.get(store.orgId) : undefined;
      if (!storefront || !store || !organization) return null;
      return {
        domain: {
          id: domain.id,
          orgId: domain.orgId,
          storefrontId: domain.storefrontId,
          host: domain.host,
          isPrimary: domain.isPrimary,
          verified: domain.verified,
        },
        storefront: {
          id: storefront.id,
          orgId: storefront.orgId,
          storeId: storefront.storeId,
          locale: storefront.locale,
        },
        store: { id: store.id, orgId: store.orgId, status: store.status },
        organization: { id: organization.id, status: organization.status },
      };
    },
  };

  readonly memberships: MembershipRepository = {
    add: async (input) => {
      if (
        [...this.membershipMap.values()].some(
          (m) => m.orgId === input.orgId && m.userId === input.userId,
        )
      ) {
        throw new DomainError(
          "MEMBERSHIP_EXISTS",
          `user ${input.userId} is already a member`,
        );
      }
      const membership: MembershipRecord = {
        id: this.id("mem"),
        ...input,
        createdAt: new Date(),
      };
      this.membershipMap.set(membership.id, membership);
      return membership;
    },
    listByOrg: async (orgId) =>
      [...this.membershipMap.values()].filter((m) => m.orgId === orgId),
  };

  readonly audit: AuditRepository = {
    record: async (event) => {
      this.auditLog.push({
        ...event,
        id: this.id("aud"),
        createdAt: event.createdAt ?? new Date(),
      });
    },
    listByOrg: async (orgId, limit) =>
      this.auditLog
        .filter((e) => e.orgId === orgId)
        .sort(
          (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
        )
        .slice(0, limit ?? 100),
  };

  readonly products: ProductRepository = {
    create: async (input) => {
      const now = new Date();
      const product: ProductRecord = {
        id: this.id("prd"),
        orgId: input.orgId,
        slug: input.slug,
        title: input.title,
        description: input.description ?? null,
        seoTitle: null,
        seoDescription: null,
        status: "DRAFT",
        options: input.options,
        createdAt: now,
        updatedAt: now,
      };
      this.productMap.set(product.id, product);
      return product;
    },
    findBySlug: async (orgId, slug) =>
      [...this.productMap.values()].find(
        (p) => p.orgId === orgId && p.slug === slug,
      ) ?? null,
    findById: async (id) => this.productMap.get(id) ?? null,
    listByIds: async (orgId, ids) =>
      ids
        .map((id) => this.productMap.get(id))
        .filter((p): p is ProductRecord => p !== undefined && p.orgId === orgId),
    listByOrg: async (orgId, limit = 50, offset = 0) =>
      [...this.productMap.values()]
        .filter((p) => p.orgId === orgId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(offset, offset + limit),
    updateContent: async (input) => {
      const product = this.productMap.get(input.id);
      if (!product || product.orgId !== input.orgId) {
        throw new DomainError("PRODUCT_NOT_FOUND", `product ${input.id} not found`);
      }
      if (input.title !== undefined) product.title = input.title;
      if (input.description !== undefined) product.description = input.description;
      if (input.seoTitle !== undefined) product.seoTitle = input.seoTitle;
      if (input.seoDescription !== undefined) {
        product.seoDescription = input.seoDescription;
      }
      product.updatedAt = new Date();
      return product;
    },
    updateStatus: async (input) => {
      const product = this.productMap.get(input.id);
      if (!product || product.orgId !== input.orgId) {
        throw new DomainError("PRODUCT_NOT_FOUND", `product ${input.id} not found`);
      }
      product.status = input.status;
      product.updatedAt = new Date();
      return product;
    },
  };

  readonly variants: VariantRepository = {
    create: async (input) => {
      const variant: VariantRecord = {
        id: this.id("var"),
        orgId: input.orgId,
        productId: input.productId,
        sku: input.sku,
        barcode: input.barcode ?? null,
        optionValues: input.optionValues,
        weightGrams: input.weightGrams ?? null,
        createdAt: new Date(),
      };
      this.variantMap.set(variant.id, variant);
      return variant;
    },
    findById: async (id) => this.variantMap.get(id) ?? null,
    findBySku: async (orgId, sku) =>
      [...this.variantMap.values()].find(
        (v) => v.orgId === orgId && v.sku === sku,
      ) ?? null,
    listByProduct: async (orgId, productId) =>
      [...this.variantMap.values()].filter(
        (v) => v.orgId === orgId && v.productId === productId,
      ),
  };

  readonly categories: CategoryRepository = {
    create: async (input) => {
      const category: CategoryRecord = {
        id: this.id("cat"),
        orgId: input.orgId,
        parentId: input.parentId ?? null,
        slug: input.slug,
        name: input.name,
        createdAt: new Date(),
      };
      this.categoryMap.set(category.id, category);
      return category;
    },
    findById: async (id) => this.categoryMap.get(id) ?? null,
    findBySlug: async (orgId, slug) =>
      [...this.categoryMap.values()].find(
        (c) => c.orgId === orgId && c.slug === slug,
      ) ?? null,
    // The node itself plus its ancestors, nearest first; guards against
    // corrupted parent cycles by tracking visited ids.
    parentChain: async (orgId, categoryId) => {
      const chain: CategoryRecord[] = [];
      const guard = new Set<string>();
      let current = this.categoryMap.get(categoryId);
      while (current && current.orgId === orgId && !guard.has(current.id)) {
        guard.add(current.id);
        chain.push(current);
        if (!current.parentId) break;
        current = this.categoryMap.get(current.parentId);
      }
      return chain;
    },
    listByOrg: async (orgId) =>
      [...this.categoryMap.values()].filter((c) => c.orgId === orgId),
  };

  readonly collections: CollectionRepository = {
    create: async (input) => {
      const collection: CollectionRecord = {
        id: this.id("col"),
        ...input,
        createdAt: new Date(),
      };
      this.collectionMap.set(collection.id, collection);
      return collection;
    },
    findById: async (id) => this.collectionMap.get(id) ?? null,
    findBySlug: async (orgId, slug) =>
      [...this.collectionMap.values()].find(
        (c) => c.orgId === orgId && c.slug === slug,
      ) ?? null,
    listByOrg: async (orgId) =>
      [...this.collectionMap.values()].filter((c) => c.orgId === orgId),
    addProducts: async (input) => {
      const collection = this.collectionMap.get(input.collectionId);
      if (!collection || collection.orgId !== input.orgId) {
        throw new DomainError(
          "COLLECTION_NOT_FOUND",
          `collection ${input.collectionId} not found`,
        );
      }
      for (const productId of input.productIds) {
        this.collectionProducts.add(`${input.collectionId}:${productId}`);
      }
    },
    listProductIds: async (orgId, collectionId) => {
      const collection = this.collectionMap.get(collectionId);
      if (!collection || collection.orgId !== orgId) return [];
      return [...this.collectionProducts]
        .filter((key) => key.startsWith(`${collectionId}:`))
        .map((key) => key.slice(collectionId.length + 1));
    },
  };

  readonly assets: AssetRepository = {
    create: async (input) => {
      const asset: AssetRecord = {
        id: this.id("ast"),
        orgId: input.orgId,
        kind: input.kind,
        storageKey: input.storageKey,
        mime: input.mime,
        sizeBytes: input.sizeBytes,
        checksum: input.checksum ?? null,
        createdAt: new Date(),
      };
      this.assetMap.set(asset.id, asset);
      return asset;
    },
    findById: async (id) => this.assetMap.get(id) ?? null,
    listByIds: async (orgId, ids) =>
      ids
        .map((id) => this.assetMap.get(id))
        .filter((a): a is AssetRecord => a !== undefined && a.orgId === orgId),
    listByOrg: async (orgId, limit = 200) =>
      [...this.assetMap.values()]
        .filter((a) => a.orgId === orgId)
        .slice(0, limit),
  };

  readonly revisions: ProductRevisionRepository = {
    create: async (input) => {
      const revision: ProductRevisionRecord = {
        id: this.id("rev"),
        ...input,
        createdAt: new Date(),
      };
      this.revisionMap.set(revision.id, revision);
      return revision;
    },
    latestNumber: async (orgId, productId) => {
      const numbers = [...this.revisionMap.values()]
        .filter((r) => r.orgId === orgId && r.productId === productId)
        .map((r) => r.revisionNumber);
      return numbers.length === 0 ? null : Math.max(...numbers);
    },
    listByProduct: async (orgId, productId) =>
      [...this.revisionMap.values()]
        .filter((r) => r.orgId === orgId && r.productId === productId)
        .sort((a, b) => a.revisionNumber - b.revisionNumber),
  };

  readonly priceLists: PriceListRepository = {
    create: async (input) => {
      const priceList: PriceListRecord = {
        id: this.id("pl"),
        orgId: input.orgId,
        currency: input.currency,
        priority: input.priority,
        isActive: true,
        validFrom: input.validFrom ?? null,
        validTo: input.validTo ?? null,
        createdAt: new Date(),
      };
      this.priceListMap.set(priceList.id, priceList);
      return priceList;
    },
    findById: async (id) => this.priceListMap.get(id) ?? null,
    setActive: async (input) => {
      const priceList = this.priceListMap.get(input.id);
      if (!priceList || priceList.orgId !== input.orgId) {
        throw new DomainError(
          "PRICE_LIST_NOT_FOUND",
          `price list ${input.id} not found`,
        );
      }
      priceList.isActive = input.isActive;
      return priceList;
    },
    setPriority: async (input) => {
      const priceList = this.priceListMap.get(input.id);
      if (!priceList || priceList.orgId !== input.orgId) {
        throw new DomainError("PRICE_LIST_NOT_FOUND", input.id);
      }
      priceList.priority = input.priority;
      return priceList;
    },
    listByOrg: async (orgId) =>
      [...this.priceListMap.values()].filter((l) => l.orgId === orgId),
    listActive: async (orgId, currency, at) =>
      [...this.priceListMap.values()].filter(
        (l) =>
          l.orgId === orgId &&
          l.currency === currency &&
          l.isActive &&
          (!l.validFrom || l.validFrom <= at) &&
          (!l.validTo || l.validTo >= at),
      ),
  };

  readonly prices: PriceRepository = {
    setPrice: async (input) => {
      const existing = [...this.priceMap.values()].find(
        (p) =>
          p.priceListId === input.priceListId &&
          p.variantId === input.variantId &&
          p.minQuantity === input.minQuantity,
      );
      if (existing) {
        existing.unitPriceMinor = input.unitPriceMinor;
        return existing;
      }
      const price: PriceRecord = {
        id: this.id("price"),
        ...input,
        createdAt: new Date(),
      };
      this.priceMap.set(price.id, price);
      return price;
    },
    listForVariant: async (orgId, variantId, priceListIds) => {
      const ids = new Set(priceListIds);
      return [...this.priceMap.values()].filter(
        (p) => p.orgId === orgId && p.variantId === variantId && ids.has(p.priceListId),
      );
    },
  };

  readonly promotions: PromotionRepository = {
    create: async (input) => {
      const promotion: PromotionRecord = {
        id: this.id("promo"),
        orgId: input.orgId,
        name: input.name,
        kind: input.kind,
        percentageBps: input.percentageBps ?? null,
        amountMinor: input.amountMinor ?? null,
        currency: input.currency ?? null,
        priority: input.priority,
        exclusive: input.exclusive,
        isActive: true,
        createdAt: new Date(),
      };
      this.promotionMap.set(promotion.id, promotion);
      return promotion;
    },
    findById: async (id) => this.promotionMap.get(id) ?? null,
    setActive: async (input) => {
      const promotion = this.promotionMap.get(input.id);
      if (!promotion || promotion.orgId !== input.orgId) {
        throw new DomainError(
          "PROMOTION_NOT_FOUND",
          `promotion ${input.id} not found`,
        );
      }
      promotion.isActive = input.isActive;
      return promotion;
    },
    listActive: async (orgId) =>
      [...this.promotionMap.values()].filter(
        (p) => p.orgId === orgId && p.isActive,
      ),
  };

  readonly inventoryItems: InventoryItemRepository = {
    create: async (input) => {
      const item: InventoryItemRecord = {
        id: this.id("inv"),
        orgId: input.orgId,
        variantId: input.variantId,
        locationId: input.locationId ?? null,
        onHand: input.onHand,
        reserved: 0,
        updatedAt: new Date(),
      };
      this.inventoryItemMap.set(item.id, item);
      return item;
    },
    findById: async (id) => this.inventoryItemMap.get(id) ?? null,
    findByVariant: async (orgId, variantId) =>
      [...this.inventoryItemMap.values()].filter(
        (i) => i.orgId === orgId && i.variantId === variantId,
      ),
    adjustOnHand: async (input) => {
      const item = this.inventoryItemMap.get(input.id);
      if (!item || item.orgId !== input.orgId) {
        throw new DomainError("INVENTORY_ITEM_NOT_FOUND", input.id);
      }
      const next = item.onHand + input.delta;
      if (next < 0) {
        throw new DomainError(
          "STOCK_LEVEL_INVALID",
          `onHand ${next} would go negative`,
        );
      }
      item.onHand = next;
      item.updatedAt = new Date();
      return item;
    },
    // Sequential simulation of the conditional UPDATE: the database version
    // re-evaluates the WHERE clause under row lock (see integration test).
    reserveAtomic: async (input) => {
      const item = this.inventoryItemMap.get(input.itemId);
      if (!item || item.orgId !== input.orgId) {
        throw new DomainError("INVENTORY_ITEM_NOT_FOUND", input.itemId);
      }
      if (item.reserved + input.quantity > item.onHand) {
        throw new DomainError(
          "INSUFFICIENT_STOCK",
          `requested ${input.quantity}, available ${item.onHand - item.reserved}`,
        );
      }
      item.reserved += input.quantity;
      item.updatedAt = new Date();
      const reservation: ReservationRecord = {
        id: this.id("res"),
        orgId: input.orgId,
        itemId: item.id,
        quantity: input.quantity,
        status: "ACTIVE",
        expiresAt: input.expiresAt,
        createdAt: new Date(),
        releasedAt: null,
        committedAt: null,
      };
      this.reservationMap.set(reservation.id, reservation);
      return { item, reservation };
    },
    takeReserved: async (itemId, orgId, quantity, mode) => {
      const item = this.inventoryItemMap.get(itemId);
      if (!item || item.orgId !== orgId) {
        throw new DomainError("INVENTORY_ITEM_NOT_FOUND", itemId);
      }
      if (item.reserved < quantity) {
        throw new DomainError(
          "RESERVATION_CONFLICT",
          `reserved ${item.reserved} < ${quantity}`,
        );
      }
      item.reserved -= quantity;
      if (mode === "COMMIT") item.onHand -= quantity;
      item.updatedAt = new Date();
      return item;
    },
  };

  readonly reservations: ReservationRepository = {
    findById: async (id) => this.reservationMap.get(id) ?? null,
    markStatus: async (input) => {
      const reservation = this.reservationMap.get(input.id);
      if (!reservation || reservation.orgId !== input.orgId) {
        throw new DomainError(
          "RESERVATION_NOT_FOUND",
          `reservation ${input.id} not found`,
        );
      }
      reservation.status = input.status;
      if (input.releasedAt) reservation.releasedAt = input.releasedAt;
      if (input.committedAt) reservation.committedAt = input.committedAt;
      return reservation;
    },
    listExpired: async (orgId, at, limit = 500) =>
      [...this.reservationMap.values()]
        .filter(
          (r) =>
            (orgId === null || r.orgId === orgId) &&
            r.status === "ACTIVE" &&
            r.expiresAt.getTime() <= at.getTime(),
        )
        .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())
        .slice(0, limit),
  };

  readonly carts: CartRepository = {
    create: async (input) => {
      const now = new Date();
      const cart: CartRecord = {
        id: this.id("cart"),
        orgId: input.orgId,
        customerId: input.customerId ?? null,
        currency: input.currency,
        status: "OPEN",
        items: [],
        expiresAt: input.expiresAt,
        createdAt: now,
        updatedAt: now,
      };
      this.cartMap.set(cart.id, cart);
      return cart;
    },
    findById: async (id) => this.cartMap.get(id) ?? null,
    addItem: async (input) => {
      const cart = this.requireCart(input.orgId, input.cartId);
      const existing = cart.items.find((i) => i.variantId === input.variantId);
      if (existing) {
        existing.quantity += input.quantity;
      } else {
        const item: CartItemRecord = {
          id: this.id("item"),
          orgId: input.orgId,
          cartId: cart.id,
          variantId: input.variantId,
          quantity: input.quantity,
        };
        this.cartItemMap.set(item.id, item);
        cart.items.push(item);
      }
      cart.updatedAt = new Date();
      return cart;
    },
    setItemQuantity: async (input) => {
      const cart = this.requireCart(input.orgId, input.cartId);
      const item = cart.items.find((i) => i.variantId === input.variantId);
      if (!item) throw new DomainError("CART_ITEM_NOT_FOUND", input.variantId);
      item.quantity = input.quantity;
      cart.updatedAt = new Date();
      return cart;
    },
    removeItem: async (input) => {
      const cart = this.requireCart(input.orgId, input.cartId);
      cart.items = cart.items.filter((i) => i.variantId !== input.variantId);
      cart.updatedAt = new Date();
      return cart;
    },
    markStatus: async (input) => {
      const cart = this.requireCart(input.orgId, input.id);
      cart.status = input.status;
      cart.updatedAt = new Date();
      return cart;
    },
  };

  readonly checkouts: CheckoutRepository = {
    create: async (input) => {
      const now = new Date();
      const checkout: CheckoutRecord = {
        id: this.id("chk"),
        orgId: input.orgId,
        cartId: input.cartId,
        status: "CART",
        currency: input.currency,
        customerId: null,
        quote: null,
        address: null,
        createdAt: now,
        updatedAt: now,
      };
      this.checkoutMap.set(checkout.id, checkout);
      return checkout;
    },
    findById: async (id) => this.checkoutMap.get(id) ?? null,
    findByCart: async (cartId) =>
      [...this.checkoutMap.values()].find((c) => c.cartId === cartId) ?? null,
    markStatus: async (input) => {
      const checkout = this.checkoutMap.get(input.id);
      if (!checkout || checkout.orgId !== input.orgId) {
        throw new DomainError("CHECKOUT_NOT_FOUND", input.id);
      }
      checkout.status = input.status;
      checkout.updatedAt = new Date();
      return checkout;
    },
    setQuote: async (input) => {
      const checkout = this.checkoutMap.get(input.id);
      if (!checkout || checkout.orgId !== input.orgId) {
        throw new DomainError("CHECKOUT_NOT_FOUND", input.id);
      }
      checkout.quote = input.quote;
      checkout.updatedAt = new Date();
      return checkout;
    },
    setCustomer: async (input) => {
      const checkout = this.checkoutMap.get(input.id);
      if (!checkout || checkout.orgId !== input.orgId) {
        throw new DomainError("CHECKOUT_NOT_FOUND", input.id);
      }
      checkout.customerId = input.customerId;
      checkout.updatedAt = new Date();
      return checkout;
    },
    setAddress: async (input) => {
      const checkout = this.checkoutMap.get(input.id);
      if (!checkout || checkout.orgId !== input.orgId) {
        throw new DomainError("CHECKOUT_NOT_FOUND", input.id);
      }
      checkout.address = input.address;
      checkout.updatedAt = new Date();
      return checkout;
    },
  };

  readonly orders: OrderRepository = {
    nextSequence: async (orgId) => {
      const next = (this.orderSequences.get(orgId) ?? 0) + 1;
      this.orderSequences.set(orgId, next);
      return next;
    },
    create: async (input) => {
      const now = new Date();
      const order: OrderRecord = {
        id: this.id("ord"),
        orgId: input.orgId,
        orderNumber: `SO-${String(input.sequence).padStart(8, "0")}`,
        sequence: input.sequence,
        checkoutId: input.checkoutId,
        customerId: input.customerId,
        currency: input.currency,
        status: input.status,
        subtotalMinor: input.subtotalMinor,
        discountMinor: input.discountMinor,
        totalMinor: input.totalMinor,
        placedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      this.orderMap.set(order.id, order);
      for (const line of input.lines) {
        const record: OrderLineRecord = {
          id: this.id("oline"),
          orgId: input.orgId,
          orderId: order.id,
          ...line,
        };
        this.orderLineMap.set(record.id, record);
      }
      return order;
    },
    findById: async (id) => this.orderMap.get(id) ?? null,
    findByNumber: async (orgId, orderNumber) =>
      [...this.orderMap.values()].find(
        (o) => o.orgId === orgId && o.orderNumber === orderNumber,
      ) ?? null,
    listLines: async (orgId, orderId) =>
      [...this.orderLineMap.values()].filter(
        (l) => l.orgId === orgId && l.orderId === orderId,
      ),
    listByStatus: async (orgId, status) =>
      [...this.orderMap.values()].filter(
        (o) => o.orgId === orgId && o.status === status,
      ),
    markStatus: async (input) => {
      const order = this.orderMap.get(input.id);
      if (!order || order.orgId !== input.orgId) {
        throw new DomainError("ORDER_NOT_FOUND", input.id);
      }
      order.status = input.status;
      order.updatedAt = new Date();
      return order;
    },
  };

  readonly idempotency: IdempotencyRepository = {
    find: async (orgId, key) =>
      [...this.idempotencyMap.values()].find(
        (r) => r.orgId === orgId && r.key === key,
      ) ?? null,
    start: async (input) => {
      const record: IdempotencyRecord = {
        id: this.id("idem"),
        orgId: input.orgId,
        key: input.key,
        status: "PENDING",
        requestHash: input.requestHash,
        resultSnapshot: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.idempotencyMap.set(record.id, record);
      return record;
    },
    complete: async (input) => {
      const record = [...this.idempotencyMap.values()].find(
        (r) => r.orgId === input.orgId && r.key === input.key,
      );
      if (!record) throw new DomainError("IDEMPOTENCY_KEY_INVALID", input.key);
      record.status = "COMPLETED";
      record.resultSnapshot = input.resultSnapshot;
      record.updatedAt = new Date();
      return record;
    },
    fail: async (input) => {
      const record = [...this.idempotencyMap.values()].find(
        (r) => r.orgId === input.orgId && r.key === input.key,
      );
      if (!record) throw new DomainError("IDEMPOTENCY_KEY_INVALID", input.key);
      record.status = "FAILED";
      record.updatedAt = new Date();
      return record;
    },
  };

  readonly paymentIntents: PaymentIntentRepository = {
    create: async (input) => {
      const now = new Date();
      const intent: PaymentIntentRecord = {
        id: this.id("pi"),
        orgId: input.orgId,
        orderId: input.orderId,
        currency: input.currency,
        amountMinor: input.amountMinor,
        status: "CREATED",
        providerId: null,
        providerRef: null,
        createdAt: now,
        updatedAt: now,
      };
      this.intentMap.set(intent.id, intent);
      return intent;
    },
    findById: async (id) => this.intentMap.get(id) ?? null,
    markStatus: async (input) => {
      const intent = this.intentMap.get(input.id);
      if (!intent || intent.orgId !== input.orgId) {
        throw new DomainError("PAYMENT_INTENT_NOT_FOUND", input.id);
      }
      intent.status = input.status;
      if (input.providerId !== undefined) intent.providerId = input.providerId;
      if (input.providerRef !== undefined) intent.providerRef = input.providerRef;
      intent.updatedAt = new Date();
      return intent;
    },
    listByOrder: async (orgId, orderId) =>
      [...this.intentMap.values()].filter(
        (i) => i.orgId === orgId && i.orderId === orderId,
      ),
  };

  readonly paymentAttempts: PaymentAttemptRepository = {
    create: async (input) => {
      const attempt: PaymentAttemptRecord = {
        id: this.id("pa"),
        orgId: input.orgId,
        intentId: input.intentId,
        status: input.status,
        providerId: input.providerId ?? null,
        providerRef: input.providerRef ?? null,
        failureReason: input.failureReason ?? null,
        createdAt: new Date(),
      };
      this.attemptMap.set(attempt.id, attempt);
      return attempt;
    },
  };

  readonly refunds: RefundRepository = {
    create: async (input) => {
      const refund: RefundRecord = {
        id: this.id("rf"),
        orgId: input.orgId,
        intentId: input.intentId,
        currency: input.currency,
        amountMinor: input.amountMinor,
        status: "REQUESTED",
        reason: input.reason,
        providerRef: null,
        createdAt: new Date(),
        settledAt: null,
      };
      this.refundMap.set(refund.id, refund);
      return refund;
    },
    findById: async (id) => this.refundMap.get(id) ?? null,
    markStatus: async (input) => {
      const refund = this.refundMap.get(input.id);
      if (!refund || refund.orgId !== input.orgId) {
        throw new DomainError("REFUND_NOT_FOUND", input.id);
      }
      refund.status = input.status;
      if (input.providerRef !== undefined) refund.providerRef = input.providerRef;
      if (input.status === "EXECUTED") refund.settledAt = new Date();
      return refund;
    },
    listByIntent: async (orgId, intentId) =>
      [...this.refundMap.values()].filter(
        (r) => r.orgId === orgId && r.intentId === intentId,
      ),
    listPending: async (orgId) =>
      [...this.refundMap.values()].filter(
        (r) => r.orgId === orgId && (r.status === "REQUESTED" || r.status === "APPROVED"),
      ),
    sumExecutedMinor: async (orgId, intentId) =>
      [...this.refundMap.values()]
        .filter(
          (r) => r.orgId === orgId && r.intentId === intentId && r.status === "EXECUTED",
        )
        .reduce((sum, r) => sum + r.amountMinor, 0n),
  };

  readonly webhookEvents: WebhookEventRepository = {
    find: async (orgId, provider, eventId) =>
      [...this.webhookMap.values()].find(
        (e) => e.orgId === orgId && e.provider === provider && e.eventId === eventId,
      ) ?? null,
    create: async (input) => {
      const event: WebhookEventRecord = {
        id: this.id("evt"),
        orgId: input.orgId,
        provider: input.provider,
        eventId: input.eventId,
        type: input.type,
        payload: input.payload,
        status: "RECEIVED",
        receivedAt: new Date(),
        processedAt: null,
      };
      this.webhookMap.set(event.id, event);
      return event;
    },
    markStatus: async (input) => {
      const event = this.webhookMap.get(input.id);
      if (!event || event.orgId !== input.orgId) {
        throw new DomainError("WEBHOOK_EVENT_NOT_FOUND", input.id);
      }
      event.status = input.status;
      if (input.status === "PROCESSED") event.processedAt = new Date();
      return event;
    },
  };

  readonly journals: JournalRepository = {
    create: async (input) => {
      const journal: JournalRecord = {
        id: this.id("jr"),
        orgId: input.orgId,
        currency: input.currency,
        effectiveAt: input.effectiveAt,
        memo: input.memo,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        lines: [],
      };
      this.journalMap.set(journal.id, journal);
      for (const line of input.lines) {
        const record: JournalLineRecord = {
          id: this.id("jl"),
          orgId: input.orgId,
          journalId: journal.id,
          ...line,
        };
        this.journalLineMap.set(record.id, record);
        journal.lines.push(record);
      }
      return journal;
    },
    listByPeriod: async (orgId, from, to) =>
      [...this.journalMap.values()]
        .filter(
          (j) =>
            j.orgId === orgId &&
            j.effectiveAt >= from &&
            j.effectiveAt <= to,
        )
        .map((j) => ({
          ...j,
          lines: [...this.journalLineMap.values()].filter(
            (l) => l.journalId === j.id,
          ),
        })),
    existsForSource: async (orgId, sourceType, sourceId) =>
      [...this.journalMap.values()].some(
        (j) =>
          j.orgId === orgId && j.sourceType === sourceType && j.sourceId === sourceId,
      ),
  };

  readonly settlements: SettlementRepository = {
    create: async (input) => {
      const settlement: SettlementRecord = {
        id: this.id("stl"),
        ...input,
        createdAt: new Date(),
      };
      this.settlementMap.set(settlement.id, settlement);
      return settlement;
    },
    findById: async (id) => this.settlementMap.get(id) ?? null,
  };

  readonly taxRates: TaxRateRepository = {
    create: async (input) => {
      const rate: TaxRateRecord = {
        id: this.id("tax"),
        orgId: input.orgId,
        name: input.name,
        percentageBps: input.percentageBps,
        jurisdiction: input.jurisdiction,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        createdAt: new Date(),
      };
      this.taxRateMap.set(rate.id, rate);
      return rate;
    },
    listByOrg: async (orgId) => [...this.taxRateMap.values()].filter((t) => t.orgId === orgId),
  };

  readonly fulfillments: FulfillmentRepository = {
    create: async (input) => {
      const now = new Date();
      const fulfillment: FulfillmentRecord = {
        id: this.id("ful"),
        orgId: input.orgId,
        orderId: input.orderId,
        kind: input.kind,
        status: "PENDING",
        trackingNumber: null,
        createdAt: now,
        updatedAt: now,
        lines: [],
      };
      this.fulfillmentMap.set(fulfillment.id, fulfillment);
      for (const line of input.lines) {
        const record: FulfillmentLineRecord = {
          id: this.id("fl"),
          orgId: input.orgId,
          fulfillmentId: fulfillment.id,
          ...line,
        };
        this.fulfillmentLineMap.set(record.id, record);
        fulfillment.lines.push(record);
      }
      return fulfillment;
    },
    findById: async (id) => this.fulfillmentMap.get(id) ?? null,
    listByOrder: async (orgId, orderId) =>
      [...this.fulfillmentMap.values()]
        .filter((f) => f.orgId === orgId && f.orderId === orderId)
        .map((f) => ({
          ...f,
          lines: [...this.fulfillmentLineMap.values()].filter(
            (l) => l.fulfillmentId === f.id,
          ),
        })),
    markStatus: async (input) => {
      const fulfillment = this.fulfillmentMap.get(input.id);
      if (!fulfillment || fulfillment.orgId !== input.orgId) {
        throw new DomainError("FULFILLMENT_NOT_FOUND", input.id);
      }
      fulfillment.status = input.status;
      if (input.trackingNumber !== undefined) {
        fulfillment.trackingNumber = input.trackingNumber;
      }
      fulfillment.updatedAt = new Date();
      return fulfillment;
    },
    addTrackingEvent: async (input) => {
      const event: TrackingEventRecord = {
        id: this.id("trk"),
        orgId: input.orgId,
        fulfillmentId: input.fulfillmentId,
        occurredAt: input.occurredAt,
        description: input.description,
        location: input.location ?? null,
      };
      this.trackingMap.set(event.id, event);
      return event;
    },
    listTracking: async (orgId, fulfillmentId) =>
      [...this.trackingMap.values()]
        .filter(
          (t) => t.orgId === orgId && t.fulfillmentId === fulfillmentId,
        )
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()),
  };

  readonly returns: ReturnRepository = {
    create: async (input) => {
      const now = new Date();
      const record: ReturnRecord = {
        id: this.id("ret"),
        orgId: input.orgId,
        orderId: input.orderId,
        status: "REQUESTED",
        reason: input.reason,
        refundId: null,
        createdAt: now,
        updatedAt: now,
        lines: [],
      };
      this.returnMap.set(record.id, record);
      for (const line of input.lines) {
        const lineRecord: ReturnLineRecord = {
          id: this.id("rl"),
          orgId: input.orgId,
          returnId: record.id,
          ...line,
        };
        this.returnLineMap.set(lineRecord.id, lineRecord);
        record.lines.push(lineRecord);
      }
      return record;
    },
    findById: async (id) => this.returnMap.get(id) ?? null,
    listByOrder: async (orgId, orderId) =>
      [...this.returnMap.values()]
        .filter((r) => r.orgId === orgId && r.orderId === orderId)
        .map((r) => ({
          ...r,
          lines: [...this.returnLineMap.values()].filter(
            (l) => l.returnId === r.id,
          ),
        })),
    markStatus: async (input) => {
      const record = this.returnMap.get(input.id);
      if (!record || record.orgId !== input.orgId) {
        throw new DomainError("RETURN_NOT_FOUND", input.id);
      }
      record.status = input.status;
      if (input.refundId !== undefined) record.refundId = input.refundId;
      record.updatedAt = new Date();
      return record;
    },
    listByStatus: async (orgId, status) =>
      [...this.returnMap.values()].filter(
        (r) => r.orgId === orgId && r.status === status,
      ),
  };

  readonly shippingRates: ShippingRateRepository = {
    create: async (input) => {
      const rate: ShippingRateRecord = {
        id: this.id("rate"),
        orgId: input.orgId,
        name: input.name,
        kind: input.kind,
        currency: input.currency,
        amountMinor: input.amountMinor,
        maxWeightGrams: input.maxWeightGrams ?? null,
        country: input.country ?? null,
        isActive: true,
        createdAt: new Date(),
      };
      this.shippingRateMap.set(rate.id, rate);
      return rate;
    },
    setActive: async (input) => {
      const rate = this.shippingRateMap.get(input.id);
      if (!rate || rate.orgId !== input.orgId) {
        throw new DomainError("SHIPPING_RATE_NOT_FOUND", input.id);
      }
      rate.isActive = input.isActive;
      return rate;
    },
    listActive: async (orgId, currency) =>
      [...this.shippingRateMap.values()].filter(
        (r) => r.orgId === orgId && r.currency === currency && r.isActive,
      ),
    listByOrg: async (orgId) =>
      [...this.shippingRateMap.values()].filter((r) => r.orgId === orgId),
  };

  readonly pages: PageRepository = {
    create: async (input) => {
      const now = new Date();
      const page: PageRecord = {
        id: this.id("page"),
        orgId: input.orgId,
        slug: input.slug,
        title: input.title,
        locale: input.locale,
        status: "DRAFT",
        publishedRevisionNumber: null,
        scheduledFor: null,
        scheduledRevisionNumber: null,
        createdAt: now,
        updatedAt: now,
      };
      this.pageMap.set(page.id, page);
      return page;
    },
    findById: async (id) => this.pageMap.get(id) ?? null,
    findBySlug: async (orgId, slug, locale) =>
      [...this.pageMap.values()].find(
        (p) => p.orgId === orgId && p.slug === slug && p.locale === locale,
      ) ?? null,
    listByOrg: async (orgId, limit = 50) =>
      [...this.pageMap.values()]
        .filter((p) => p.orgId === orgId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, limit),
    markStatus: async (input) => {
      const page = this.requirePage(input.orgId, input.id);
      page.status = input.status;
      page.updatedAt = new Date();
      return page;
    },
    setPublishedRevision: async (input) => {
      const page = this.requirePage(input.orgId, input.id);
      page.publishedRevisionNumber = input.revisionNumber;
      page.updatedAt = new Date();
      return page;
    },
    setSchedule: async (input) => {
      const page = this.requirePage(input.orgId, input.id);
      page.scheduledFor = input.scheduledFor;
      page.scheduledRevisionNumber = input.revisionNumber;
      page.updatedAt = new Date();
      return page;
    },
    listScheduled: async (orgId, at, limit = 100) =>
      [...this.pageMap.values()]
        .filter(
          (p) =>
            (orgId === null || p.orgId === orgId) &&
            p.status === "SCHEDULED" &&
            p.scheduledFor !== null &&
            p.scheduledFor.getTime() <= at.getTime(),
        )
        .slice(0, limit),
  };

  readonly pageRevisions: PageRevisionRepository = {
    create: async (input) => {
      const revision: PageRevisionRecord = {
        id: this.id("prev"),
        orgId: input.orgId,
        pageId: input.pageId,
        revisionNumber: input.revisionNumber,
        schemaVersion: 1,
        schema: input.schema,
        seo: input.seo,
        authorId: input.authorId,
        createdAt: new Date(),
      };
      this.pageRevisionMap.set(revision.id, revision);
      return revision;
    },
    findById: async (id) => this.pageRevisionMap.get(id) ?? null,
    findByNumber: async (orgId, pageId, revisionNumber) =>
      [...this.pageRevisionMap.values()].find(
        (r) =>
          r.orgId === orgId && r.pageId === pageId && r.revisionNumber === revisionNumber,
      ) ?? null,
    latestNumber: async (orgId, pageId) => {
      const numbers = [...this.pageRevisionMap.values()]
        .filter((r) => r.orgId === orgId && r.pageId === pageId)
        .map((r) => r.revisionNumber);
      return numbers.length === 0 ? null : Math.max(...numbers);
    },
    listByPage: async (orgId, pageId) =>
      [...this.pageRevisionMap.values()]
        .filter((r) => r.orgId === orgId && r.pageId === pageId)
        .sort((a, b) => a.revisionNumber - b.revisionNumber),
  };

  private requirePage(orgId: string, pageId: string): PageRecord {
    const page = this.pageMap.get(pageId);
    if (!page || page.orgId !== orgId) {
      throw new DomainError("PAGE_NOT_FOUND", `page ${pageId} not found`);
    }
    return page;
  }

  readonly blockDefinitions: BlockDefinitionRepository = {
    create: async (input) => {
      const record: BlockDefinitionRecord = {
        id: this.id("bdef"),
        orgId: input.orgId,
        definition: input.definition,
        createdAt: new Date(),
      };
      this.blockDefinitionMap.set(record.id, record);
      return record;
    },
    listByOrg: async (orgId) =>
      [...this.blockDefinitionMap.values()].filter((b) => b.orgId === orgId),
  };

  readonly themes: ThemeRepository = {
    create: async (input) => {
      const theme: ThemeRecord = {
        id: this.id("theme"),
        orgId: input.orgId,
        name: input.name,
        tokens: input.tokens,
        isActive: true,
        createdAt: new Date(),
      };
      this.themeMap.set(theme.id, theme);
      return theme;
    },
    findById: async (id) => this.themeMap.get(id) ?? null,
    listByOrg: async (orgId) =>
      [...this.themeMap.values()].filter((t) => t.orgId === orgId),
    setActive: async (input) => {
      const theme = this.themeMap.get(input.id);
      if (!theme || theme.orgId !== input.orgId) {
        throw new DomainError("THEME_NOT_FOUND", input.id);
      }
      theme.isActive = input.isActive;
      return theme;
    },
    setTokens: async (input) => {
      const theme = this.themeMap.get(input.id);
      if (!theme || theme.orgId !== input.orgId) {
        throw new DomainError("THEME_NOT_FOUND", input.id);
      }
      theme.tokens = input.tokens;
      return theme;
    },
  };

  readonly themeTemplates: ThemeTemplateRepository = {
    create: async (input) => {
      const template: ThemeTemplateRecord = {
        id: this.id("tpl"),
        orgId: input.orgId,
        themeId: input.themeId,
        name: input.name,
        kind: input.kind,
        root: input.root,
        createdAt: new Date(),
      };
      this.themeTemplateMap.set(template.id, template);
      return template;
    },
    listByTheme: async (orgId, themeId) =>
      [...this.themeTemplateMap.values()].filter(
        (t) => t.orgId === orgId && t.themeId === themeId,
      ),
  };

  readonly forkLinks: ForkLinkRepository = {
    create: async (input) => {
      const now = new Date();
      const link: ForkLinkRecord = {
        id: this.id("fork"),
        orgId: input.orgId,
        entityType: input.entityType,
        entityId: input.entityId,
        parentOrgId: input.parentOrgId,
        parentEntityId: input.parentEntityId,
        overrides: {},
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      };
      this.forkLinkMap.set(link.id, link);
      return link;
    },
    findById: async (id) => this.forkLinkMap.get(id) ?? null,
    listByOrg: async (orgId) =>
      [...this.forkLinkMap.values()].filter((l) => l.orgId === orgId),
    setOverrides: async (input) => {
      const link = this.forkLinkMap.get(input.id);
      if (!link || link.orgId !== input.orgId) {
        throw new DomainError("FORK_LINK_NOT_FOUND", input.id);
      }
      link.overrides = input.overrides;
      link.updatedAt = new Date();
      return link;
    },
    markDetached: async (input) => {
      const link = this.forkLinkMap.get(input.id);
      if (!link || link.orgId !== input.orgId) {
        throw new DomainError("FORK_LINK_NOT_FOUND", input.id);
      }
      link.status = "DETACHED";
      link.updatedAt = new Date();
      return link;
    },
  };

  readonly cloneManifests: CloneManifestRepository = {
    create: async (input) => {
      const record: CloneManifestRecord = {
        id: this.id("cm"),
        orgId: input.orgId,
        sourceOrgId: input.sourceOrgId,
        profile: input.profile,
        manifest: input.manifest,
        createdAt: new Date(),
      };
      this.cloneManifestMap.set(record.id, record);
      return record;
    },
    findById: async (id) => this.cloneManifestMap.get(id) ?? null,
    listByOrg: async (orgId, limit = 50) =>
      [...this.cloneManifestMap.values()]
        .filter((m) => m.orgId === orgId)
        .slice(0, limit),
  };

  readonly outbox: OutboxRepository = {
    enqueue: async (input) => {
      const event = {
        ...input,
        createdAt: new Date(),
        processedAt: null,
        attempts: 0,
      };
      this.outboxMap.set(event.id, event);
      return event;
    },
    listPending: async (orgId, limit = 100) =>
      [...this.outboxMap.values()]
        .filter(
          (e) =>
            (orgId === null || e.orgId === orgId) &&
            e.processedAt === null,
        )
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, limit),
    markProcessed: async (input) => {
      const event = this.outboxMap.get(input.id);
      if (!event || event.orgId !== input.orgId) {
        throw new DomainError("OUTBOX_EVENT_NOT_FOUND", input.id);
      }
      this.outboxMap.set(event.id, { ...event, processedAt: new Date() });
    },
    incrementAttempts: async (input) => {
      const event = this.outboxMap.get(input.id);
      if (!event || event.orgId !== input.orgId) {
        throw new DomainError("OUTBOX_EVENT_NOT_FOUND", input.id);
      }
      this.outboxMap.set(event.id, { ...event, attempts: event.attempts + 1 });
    },
  };

  readonly searchIndex: SearchIndexRepository = {
    upsert: async (document) => {
      this.searchIndexMap.set(
        `${document.orgId}:${document.kind}:${document.entityId}`,
        document,
      );
    },
    remove: async (input) => {
      this.searchIndexMap.delete(
        `${input.orgId}:${input.kind}:${input.entityId}`,
      );
    },
    search: async (orgId, query) => {
      const documents = [...this.searchIndexMap.values()].filter(
        (d) => d.orgId === orgId,
      );
      const { searchDocuments } = await import("@finalshop/domain");
      return searchDocuments(documents, query).map((r) => r.document);
    },
  };

  readonly plugins: PluginRepository = {
    install: async (input) => {
      const now = new Date();
      const plugin: PluginRecord = {
        id: this.id("plg"),
        orgId: input.orgId,
        manifest: input.manifest,
        status: "ENABLED",
        installedAt: now,
        updatedAt: now,
      };
      this.pluginMap.set(plugin.id, plugin);
      return plugin;
    },
    findById: async (id) => this.pluginMap.get(id) ?? null,
    listByOrg: async (orgId) =>
      [...this.pluginMap.values()].filter((p) => p.orgId === orgId),
    setStatus: async (input) => {
      const plugin = this.pluginMap.get(input.id);
      if (!plugin || plugin.orgId !== input.orgId) {
        throw new DomainError("PLUGIN_NOT_FOUND", input.id);
      }
      plugin.status = input.status;
      plugin.updatedAt = new Date();
      return plugin;
    },
    remove: async (input) => {
      const plugin = this.pluginMap.get(input.id);
      if (!plugin || plugin.orgId !== input.orgId) {
        throw new DomainError("PLUGIN_NOT_FOUND", input.id);
      }
      this.pluginMap.delete(input.id);
    },
  };

  readonly webhookSubscriptions: WebhookSubscriptionRepository = {
    create: async (input) => {
      const subscription: WebhookSubscriptionRecord = {
        id: this.id("whs"),
        orgId: input.orgId,
        url: input.url,
        events: input.events,
        secret: input.secret,
        isActive: true,
        createdAt: new Date(),
      };
      this.webhookSubscriptionMap.set(subscription.id, subscription);
      return subscription;
    },
    setActive: async (input) => {
      const subscription = this.webhookSubscriptionMap.get(input.id);
      if (!subscription || subscription.orgId !== input.orgId) {
        throw new DomainError("WEBHOOK_SUBSCRIPTION_NOT_FOUND", input.id);
      }
      subscription.isActive = input.isActive;
      return subscription;
    },
    listActiveForEvent: async (orgId, eventType) =>
      [...this.webhookSubscriptionMap.values()].filter(
        (s) => s.orgId === orgId && s.isActive && s.events.includes(eventType),
      ),
  };

  readonly webhookDeliveries: WebhookDeliveryRepository = {
    create: async (input) => {
      const delivery: WebhookDeliveryRecord = {
        id: this.id("whd"),
        ...input,
        status: "PENDING",
        attempts: 0,
        createdAt: new Date(),
        deliveredAt: null,
      };
      this.webhookDeliveryMap.set(delivery.id, delivery);
      return delivery;
    },
    markStatus: async (input) => {
      const delivery = this.webhookDeliveryMap.get(input.id);
      if (!delivery || delivery.orgId !== input.orgId) {
        throw new DomainError("WEBHOOK_DELIVERY_NOT_FOUND", input.id);
      }
      delivery.status = input.status;
      if (input.status === "DELIVERED") delivery.deliveredAt = new Date();
      return delivery;
    },
    listPending: async (limit = 100) =>
      [...this.webhookDeliveryMap.values()]
        .filter((d) => d.status === "PENDING")
        .slice(0, limit),
  };

  readonly analyticsEvents: AnalyticsEventRepository = {
    append: async (input) => {
      const event: AnalyticsEventRecord = {
        id: this.id("ae"),
        orgId: input.orgId,
        name: input.name,
        version: input.version,
        sessionId: input.sessionId,
        userId: input.userId ?? null,
        properties: input.properties,
        occurredAt: input.occurredAt,
      };
      this.analyticsEventMap.set(event.id, event);
      return event;
    },
    listByNames: async (input) => {
      const names = new Set(input.names);
      return [...this.analyticsEventMap.values()]
        .filter(
          (e) =>
            e.orgId === input.orgId &&
            names.has(`${e.name}@${e.version}`) &&
            e.occurredAt >= input.from &&
            e.occurredAt <= input.to,
        )
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
        .slice(0, input.limit ?? 10_000);
    },
  };

  readonly rateLimitPolicies: RateLimitPolicyRepository = {
    upsert: async (input) => {
      const key = `${input.orgId}:${input.route}`;
      const existing = this.rateLimitPolicyMap.get(key);
      if (existing) {
        existing.limit = input.limit;
        existing.windowSeconds = input.windowSeconds;
        return existing;
      }
      const policy: RateLimitPolicyRecord = {
        id: this.id("rlp"),
        ...input,
        createdAt: new Date(),
      };
      this.rateLimitPolicyMap.set(key, policy);
      return policy;
    },
    find: async (orgId, route) => this.rateLimitPolicyMap.get(`${orgId}:${route}`) ?? null,
    listByOrg: async (orgId) =>
      [...this.rateLimitPolicyMap.values()].filter((p) => p.orgId === orgId),
  };

  readonly rateLimitCounters: RateLimitCounterRepository = {
    incrementHits: async (input) => {
      const key = `${input.orgId}:${input.route}:${input.windowKey}`;
      const existing = this.rateLimitCounterMap.get(key);
      const hits = (existing?.hits ?? 0) + 1;
      this.rateLimitCounterMap.set(key, {
        id: key,
        orgId: input.orgId,
        route: input.route,
        windowKey: input.windowKey,
        hits,
      });
      return hits;
    },
  };

  readonly users: UserRepository = {
    create: async (input) => {
      if ([...this.userMap.values()].some((u) => u.email === input.email)) {
        throw new DomainError("USER_EXISTS", `user ${input.email} already exists`);
      }
      const user: UserRecord = {
        id: this.id("user"),
        email: input.email,
        name: input.name ?? null,
        createdAt: new Date(),
      };
      this.userMap.set(user.id, user);
      return user;
    },
    findByEmail: async (email) =>
      [...this.userMap.values()].find((u) => u.email === email) ?? null,
    findById: async (id) => this.userMap.get(id) ?? null,
  };

  private requireCart(orgId: string, cartId: string): CartRecord {
    const cart = this.cartMap.get(cartId);
    if (!cart || cart.orgId !== orgId) {
      throw new DomainError("CART_NOT_FOUND", `cart ${cartId} not found`);
    }
    return cart;
  }
}

/** Convenience tenant contexts and record seeds for command tests. */
export function ownerContext(
  orgId: string,
  userId = "user-owner",
): TenantContext {
  return { orgId, userId, role: "OWNER" };
}

export function adminContext(
  orgId: string,
  userId = "user-admin",
): TenantContext {
  return { orgId, userId, role: "ADMIN" };
}

export function memberContext(
  orgId: string,
  userId = "user-member",
): TenantContext {
  return { orgId, userId, role: "MEMBER" };
}

export async function seedOrgWithStore(
  repos: Repositories,
  slug = "acme",
  locale = "en",
): Promise<{
  orgId: string;
  storeId: string;
  storefrontId: string;
  ownerUserId: string;
}> {
  const ownerUserId = "user-owner";
  const { organization } = await repos.organizations.createWithOwner({
    name: "Acme",
    slug,
    ownerUserId,
  });
  const { store, storefront } = await repos.stores.createWithDefaultStorefront({
    orgId: organization.id,
    name: "Main Store",
    slug: "main",
    locale,
  });
  return {
    orgId: organization.id,
    storeId: store.id,
    storefrontId: storefront.id,
    ownerUserId,
  };
}
