import type {
  AuditEvent,
  BranchKind,
  ResolvedDomainRecord,
  Role,
} from "@finalshop/domain";

/**
 * Ports (interfaces) the application layer needs from infrastructure.
 * Implementations live in packages/infrastructure; tests use the in-memory
 * doubles from packages/testing. Infrastructure imports these types — never
 * the other way around (dependency rules, docs/architecture/dependency-rules.md).
 */

export type { AuditEvent, BranchKind, ResolvedDomainRecord, Role };

export interface OrganizationRecord {
  id: string;
  slug: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  createdAt: Date;
}

export interface StoreRecord {
  id: string;
  orgId: string;
  slug: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
}

export interface StorefrontRecord {
  id: string;
  orgId: string;
  storeId: string;
  name: string;
  locale: string;
  isDefault: boolean;
  createdAt: Date;
}

export interface BranchRecord {
  id: string;
  orgId: string;
  storeId: string;
  name: string;
  kind: BranchKind;
  createdAt: Date;
}

export interface DomainRecord {
  id: string;
  orgId: string;
  storefrontId: string;
  host: string;
  isPrimary: boolean;
  verified: boolean;
  createdAt: Date;
}

export interface MembershipRecord {
  id: string;
  orgId: string;
  userId: string;
  role: Role;
  createdAt: Date;
}

export interface OrganizationRepository {
  /** Creates the organization together with its first OWNER membership. */
  createWithOwner(input: {
    name: string;
    slug: string;
    ownerUserId: string;
  }): Promise<{ organization: OrganizationRecord; membership: MembershipRecord }>;
  findBySlug(slug: string): Promise<OrganizationRecord | null>;
  findById(id: string): Promise<OrganizationRecord | null>;
}

export interface StoreRepository {
  /** Store + default storefront are created atomically. */
  createWithDefaultStorefront(input: {
    orgId: string;
    name: string;
    slug: string;
    locale: string;
  }): Promise<{ store: StoreRecord; storefront: StorefrontRecord }>;
  findBySlug(orgId: string, slug: string): Promise<StoreRecord | null>;
  findById(id: string): Promise<StoreRecord | null>;
}

export interface StorefrontRepository {
  findById(id: string): Promise<StorefrontRecord | null>;
}

export interface BranchRepository {
  create(input: {
    orgId: string;
    storeId: string;
    name: string;
    kind: BranchKind;
  }): Promise<BranchRecord>;
  findById(id: string): Promise<BranchRecord | null>;
  listByStore(orgId: string, storeId: string): Promise<BranchRecord[]>;
}

export interface DomainRepository {
  /** Attaches a host; when primary, unsets the previous primary atomically. */
  attach(input: {
    orgId: string;
    storefrontId: string;
    host: string;
    isPrimary: boolean;
  }): Promise<DomainRecord>;
  findById(id: string): Promise<DomainRecord | null>;
  setVerified(
    orgId: string,
    domainId: string,
    verified: boolean,
  ): Promise<DomainRecord>;
  /** The full Host → Domain → Storefront → Store → Organization join. */
  findByHostJoined(host: string): Promise<ResolvedDomainRecord | null>;
}

export interface MembershipRepository {
  add(input: {
    orgId: string;
    userId: string;
    role: Role;
  }): Promise<MembershipRecord>;
  listByOrg(orgId: string): Promise<MembershipRecord[]>;
}

export interface AuditRepository {
  record(event: AuditEvent): Promise<void>;
  listByOrg(orgId: string, limit?: number): Promise<AuditEvent[]>;
}

import type {
  AssetRepository,
  CategoryRepository,
  CollectionRepository,
  ProductRepository,
  ProductRevisionRepository,
  VariantRepository,
} from "./catalog-ports";
import type {
  PriceListRepository,
  PriceRepository,
  PromotionRepository,
} from "./pricing-ports";
import type {
  InventoryItemRepository,
  ReservationRepository,
} from "./inventory-ports";
import type {
  CartRepository,
  CheckoutRepository,
  IdempotencyRepository,
  OrderRepository,
} from "./order-ports";
import type {
  JournalRepository,
  PaymentAttemptRepository,
  PaymentIntentRepository,
  RefundRepository,
  SettlementRepository,
  TaxRateRepository,
  WebhookEventRepository,
} from "./payment-finance-ports";
import type {
  FulfillmentRepository,
  ReturnRepository,
  ShippingRateRepository,
} from "./fulfillment-ports";
import type { PageRepository, PageRevisionRepository } from "./cms-ports";
import type {
  BlockDefinitionRepository,
  ThemeRepository,
  ThemeTemplateRepository,
} from "./builder-theme-ports";
import type {
  CloneManifestRepository,
  ForkLinkRepository,
} from "./clone-ports";
import type {
  OutboxRepository,
  SearchIndexRepository,
} from "./search-ports";
import type {
  PluginRepository,
  WebhookDeliveryRepository,
  WebhookSubscriptionRepository,
} from "./extension-ports";
import type {
  AnalyticsEventRepository,
  RateLimitCounterRepository,
  RateLimitPolicyRepository,
} from "./analytics-ports";
import type { UserRepository } from "./user-ports";

export interface Repositories {
  organizations: OrganizationRepository;
  stores: StoreRepository;
  storefronts: StorefrontRepository;
  branches: BranchRepository;
  domains: DomainRepository;
  memberships: MembershipRepository;
  audit: AuditRepository;
  products: ProductRepository;
  variants: VariantRepository;
  categories: CategoryRepository;
  collections: CollectionRepository;
  assets: AssetRepository;
  revisions: ProductRevisionRepository;
  priceLists: PriceListRepository;
  prices: PriceRepository;
  promotions: PromotionRepository;
  inventoryItems: InventoryItemRepository;
  reservations: ReservationRepository;
  carts: CartRepository;
  checkouts: CheckoutRepository;
  orders: OrderRepository;
  idempotency: IdempotencyRepository;
  paymentIntents: PaymentIntentRepository;
  paymentAttempts: PaymentAttemptRepository;
  refunds: RefundRepository;
  webhookEvents: WebhookEventRepository;
  journals: JournalRepository;
  settlements: SettlementRepository;
  taxRates: TaxRateRepository;
  fulfillments: FulfillmentRepository;
  returns: ReturnRepository;
  shippingRates: ShippingRateRepository;
  pages: PageRepository;
  pageRevisions: PageRevisionRepository;
  blockDefinitions: BlockDefinitionRepository;
  themes: ThemeRepository;
  themeTemplates: ThemeTemplateRepository;
  forkLinks: ForkLinkRepository;
  cloneManifests: CloneManifestRepository;
  outbox: OutboxRepository;
  searchIndex: SearchIndexRepository;
  plugins: PluginRepository;
  webhookSubscriptions: WebhookSubscriptionRepository;
  webhookDeliveries: WebhookDeliveryRepository;
  analyticsEvents: AnalyticsEventRepository;
  rateLimitPolicies: RateLimitPolicyRepository;
  rateLimitCounters: RateLimitCounterRepository;
  users: UserRepository;
}
