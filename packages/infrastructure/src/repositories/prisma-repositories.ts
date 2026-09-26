import {
  Prisma,
  type AuditEvent as AuditEventRow,
  type Branch,
  type Domain,
  type Membership,
  type Organization,
  type PrismaClient,
  type Store,
  type Storefront,
} from "@prisma/client";
import {
  DomainError,
  type ResolvedDomainRecord,
} from "@finalshop/domain";
import type {
  AuditEvent,
  AuditRepository,
  BranchKind,
  BranchRecord,
  BranchRepository,
  DomainRecord,
  DomainRepository,
  MembershipRecord,
  MembershipRepository,
  OrganizationRecord,
  OrganizationRepository,
  Repositories,
  Role,
  StoreRecord,
  StoreRepository,
  StorefrontRecord,
  StorefrontRepository,
} from "@finalshop/application";
import type {
  AssetRepository,
  CategoryRepository,
  CollectionRepository,
  ProductRepository,
  ProductRevisionRepository,
  VariantRepository,
} from "@finalshop/application";
import type {
  InventoryItemRepository,
  PriceListRepository,
  PriceRepository,
  PromotionRepository,
  ReservationRepository,
} from "@finalshop/application";
import type {
  CartRepository,
  CheckoutRepository,
  IdempotencyRepository,
  OrderRepository,
} from "@finalshop/application";
import type {
  JournalRepository,
  PaymentAttemptRepository,
  PaymentIntentRepository,
  RefundRepository,
  SettlementRepository,
  TaxRateRepository,
  WebhookEventRepository,
} from "@finalshop/application";
import type {
  FulfillmentRepository,
  ReturnRepository,
  ShippingRateRepository,
} from "@finalshop/application";
import type {
  PageRepository,
  PageRevisionRepository,
} from "@finalshop/application";
import type {
  BlockDefinitionRepository,
  ThemeRepository,
  ThemeTemplateRepository,
} from "@finalshop/application";
import type {
  CloneManifestRepository,
  ForkLinkRepository,
} from "@finalshop/application";
import type {
  OutboxRepository,
  SearchIndexRepository,
} from "@finalshop/application";
import type {
  PluginRepository,
  WebhookDeliveryRepository,
  WebhookSubscriptionRepository,
} from "@finalshop/application";
import type {
  AnalyticsEventRepository,
  RateLimitCounterRepository,
  RateLimitPolicyRepository,
} from "@finalshop/application";
import type { UserRepository } from "@finalshop/application";
import { createCatalogRepositories } from "./catalog-repositories";
import { createPricingInventoryRepositories } from "./pricing-inventory-repositories";
import { createOrderRepositories } from "./order-repositories";
import { createPaymentFinanceRepositories } from "./payment-finance-repositories";
import { createFulfillmentRepositories } from "./fulfillment-repositories";
import { createCmsRepositories } from "./cms-repositories";
import { createBuilderThemeRepositories } from "./builder-theme-repositories";
import { createCloneRepositories } from "./clone-repositories";
import { createSearchRepositories } from "./search-repositories";
import { createExtensionRepositories } from "./extension-repositories";
import { createAnalyticsRepositories } from "./analytics-repositories";
import { createUserRepository } from "./user-repository";

type OrganizationRow = Organization;
type StoreRow = Store;
type StorefrontRow = Storefront;
type BranchRow = Branch;
type DomainRow = Domain;
type MembershipRow = Membership;
type AuditRow = AuditEventRow;

const toOrganization = (row: OrganizationRow): OrganizationRecord => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  status: row.status,
  createdAt: row.createdAt,
});

const toStore = (row: StoreRow): StoreRecord => ({
  id: row.id,
  orgId: row.orgId,
  slug: row.slug,
  name: row.name,
  status: row.status,
  createdAt: row.createdAt,
});

const toStorefront = (row: StorefrontRow): StorefrontRecord => ({
  id: row.id,
  orgId: row.orgId,
  storeId: row.storeId,
  name: row.name,
  locale: row.locale,
  isDefault: row.isDefault,
  createdAt: row.createdAt,
});

const toBranch = (row: BranchRow): BranchRecord => ({
  id: row.id,
  orgId: row.orgId,
  storeId: row.storeId,
  name: row.name,
  kind: row.kind as BranchKind,
  createdAt: row.createdAt,
});

const toDomain = (row: DomainRow): DomainRecord => ({
  id: row.id,
  orgId: row.orgId,
  storefrontId: row.storefrontId,
  host: row.host,
  isPrimary: row.isPrimary,
  verified: row.verified,
  createdAt: row.createdAt,
});

const toMembership = (row: MembershipRow): MembershipRecord => ({
  id: row.id,
  orgId: row.orgId,
  userId: row.userId,
  role: row.role as Role,
  createdAt: row.createdAt,
});

const toAuditEvent = (row: AuditRow): AuditEvent => ({
  id: row.id,
  orgId: row.orgId,
  actorId: row.actorId,
  action: row.action,
  subjectType: row.subjectType,
  subjectId: row.subjectId,
  before: row.before ?? undefined,
  after: row.after ?? undefined,
  requestId: row.requestId ?? undefined,
  ip: row.ip ?? undefined,
  metadata: (row.metadata as Record<string, unknown>) ?? undefined,
  createdAt: row.createdAt,
});

const toPrismaJson = (
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput => {
  if (value === undefined || value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
};

/**
 * Maps Prisma unique-constraint violations onto domain errors. `constraint`
 * is the database constraint name suffix Prisma reports in err.meta.target.
 */
export function rethrowMapped(err: unknown, constraint: string, code: string, value: string): unknown {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    const target = JSON.stringify(err.meta?.target ?? "");
    if (target.includes(constraint)) {
      return new DomainError(code, `${value} is already in use`);
    }
  }
  return err;
}

/**
 * Prisma implementation of the application ports. Composite writes run in a
 * single transaction so the audit trail and the mutation they describe stay
 * consistent. RLS scoping is applied by callers via runInTenantTransaction.
 */
export class PrismaRepositories implements Repositories {
  readonly organizations: OrganizationRepository;
  readonly stores: StoreRepository;
  readonly storefronts: StorefrontRepository;
  readonly branches: BranchRepository;
  readonly domains: DomainRepository;
  readonly memberships: MembershipRepository;
  readonly audit: AuditRepository;
  readonly products: ProductRepository;
  readonly variants: VariantRepository;
  readonly categories: CategoryRepository;
  readonly collections: CollectionRepository;
  readonly assets: AssetRepository;
  readonly revisions: ProductRevisionRepository;
  readonly priceLists: PriceListRepository;
  readonly prices: PriceRepository;
  readonly promotions: PromotionRepository;
  readonly inventoryItems: InventoryItemRepository;
  readonly reservations: ReservationRepository;
  readonly carts: CartRepository;
  readonly checkouts: CheckoutRepository;
  readonly orders: OrderRepository;
  readonly idempotency: IdempotencyRepository;
  readonly paymentIntents: PaymentIntentRepository;
  readonly paymentAttempts: PaymentAttemptRepository;
  readonly refunds: RefundRepository;
  readonly webhookEvents: WebhookEventRepository;
  readonly journals: JournalRepository;
  readonly settlements: SettlementRepository;
  readonly taxRates: TaxRateRepository;
  readonly fulfillments: FulfillmentRepository;
  readonly returns: ReturnRepository;
  readonly shippingRates: ShippingRateRepository;
  readonly pages: PageRepository;
  readonly pageRevisions: PageRevisionRepository;
  readonly blockDefinitions: BlockDefinitionRepository;
  readonly themes: ThemeRepository;
  readonly themeTemplates: ThemeTemplateRepository;
  readonly forkLinks: ForkLinkRepository;
  readonly cloneManifests: CloneManifestRepository;
  readonly outbox: OutboxRepository;
  readonly searchIndex: SearchIndexRepository;
  readonly plugins: PluginRepository;
  readonly webhookSubscriptions: WebhookSubscriptionRepository;
  readonly webhookDeliveries: WebhookDeliveryRepository;
  readonly analyticsEvents: AnalyticsEventRepository;
  readonly rateLimitPolicies: RateLimitPolicyRepository;
  readonly rateLimitCounters: RateLimitCounterRepository;
  readonly users: UserRepository;

  constructor(private readonly db: PrismaClient) {
    this.organizations = {
      createWithOwner: async (input) => {
        try {
          const { organization, membership } = await this.db.$transaction(
            async (tx) => {
              const organization = await tx.organization.create({
                data: { name: input.name, slug: input.slug },
              });
              const membership = await tx.membership.create({
                data: {
                  orgId: organization.id,
                  userId: input.ownerUserId,
                  role: "OWNER",
                },
              });
              return { organization, membership };
            },
          );
          return {
            organization: toOrganization(organization),
            membership: toMembership(membership),
          };
        } catch (err) {
          throw rethrowMapped(
            err,
            "Organization_slug_key",
            "ORGANIZATION_SLUG_TAKEN",
            input.slug,
          );
        }
      },
      findBySlug: async (slug) => {
        const row = await this.db.organization.findUnique({ where: { slug } });
        return row ? toOrganization(row) : null;
      },
      findById: async (id) => {
        const row = await this.db.organization.findUnique({ where: { id } });
        return row ? toOrganization(row) : null;
      },
    };

    this.stores = {
      createWithDefaultStorefront: async (input) => {
        try {
          const { store, storefront } = await this.db.$transaction(async (tx) => {
            const store = await tx.store.create({
              data: {
                orgId: input.orgId,
                name: input.name,
                slug: input.slug,
              },
            });
            const storefront = await tx.storefront.create({
              data: {
                orgId: input.orgId,
                storeId: store.id,
                name: input.name,
                locale: input.locale,
                isDefault: true,
              },
            });
            return { store, storefront };
          });
          return { store: toStore(store), storefront: toStorefront(storefront) };
        } catch (err) {
          throw rethrowMapped(
            err,
            "Store_orgId_slug_key",
            "STORE_SLUG_TAKEN",
            input.slug,
          );
        }
      },
      findBySlug: async (orgId, slug) => {
        const row = await this.db.store.findUnique({
          where: { orgId_slug: { orgId, slug } },
        });
        return row ? toStore(row) : null;
      },
      findById: async (id) => {
        const row = await this.db.store.findUnique({ where: { id } });
        return row ? toStore(row) : null;
      },
    };

    this.storefronts = {
      findById: async (id) => {
        const row = await this.db.storefront.findUnique({ where: { id } });
        return row ? toStorefront(row) : null;
      },
    };

    this.branches = {
      create: async (input) => {
        const row = await this.db.branch.create({ data: input });
        return toBranch(row);
      },
      findById: async (id) => {
        const row = await this.db.branch.findUnique({ where: { id } });
        return row ? toBranch(row) : null;
      },
      listByStore: async (orgId, storeId) => {
        const rows = await this.db.branch.findMany({
          where: { orgId, storeId },
          orderBy: { createdAt: "asc" },
        });
        return rows.map(toBranch);
      },
    };

    this.domains = {
      attach: async (input) => {
        try {
          const row = await this.db.$transaction(async (tx) => {
            if (input.isPrimary) {
              await tx.domain.updateMany({
                where: { orgId: input.orgId, isPrimary: true },
                data: { isPrimary: false },
              });
            }
            return tx.domain.create({ data: input });
          });
          return toDomain(row);
        } catch (err) {
          throw rethrowMapped(
            err,
            "Domain_host_key",
            "DOMAIN_HOST_TAKEN",
            input.host,
          );
        }
      },
      findById: async (id) => {
        const row = await this.db.domain.findUnique({ where: { id } });
        return row ? toDomain(row) : null;
      },
      setVerified: async (orgId, domainId, verified) => {
        const existing = await this.db.domain.findFirst({
          where: { id: domainId, orgId },
        });
        if (!existing) {
          throw new DomainError("DOMAIN_NOT_FOUND", `domain ${domainId} not found`);
        }
        const row = await this.db.domain.update({
          where: { id: domainId },
          data: { verified },
        });
        return toDomain(row);
      },
      findByHostJoined: async (host): Promise<ResolvedDomainRecord | null> => {
        const row = await this.db.domain.findUnique({
          where: { host },
          include: {
            storefront: { include: { store: { include: { org: true } } } },
          },
        });
        if (!row) return null;
        const storefront = row.storefront;
        const store = storefront.store;
        const organization = store.org;
        return {
          domain: {
            id: row.id,
            orgId: row.orgId,
            storefrontId: row.storefrontId,
            host: row.host,
            isPrimary: row.isPrimary,
            verified: row.verified,
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

    this.memberships = {
      add: async (input) => {
        try {
          const row = await this.db.membership.create({ data: input });
          return toMembership(row);
        } catch (err) {
          throw rethrowMapped(
            err,
            "Membership_userId_orgId_key",
            "MEMBERSHIP_EXISTS",
            input.userId,
          );
        }
      },
      listByOrg: async (orgId) => {
        const rows = await this.db.membership.findMany({
          where: { orgId },
          orderBy: { createdAt: "asc" },
        });
        return rows.map(toMembership);
      },
    };

    this.audit = {
      record: async (event: AuditEvent) => {
        await this.db.auditEvent.create({
          data: {
            orgId: event.orgId,
            actorId: event.actorId,
            action: event.action,
            subjectType: event.subjectType,
            subjectId: event.subjectId,
            before: toPrismaJson(event.before),
            after: toPrismaJson(event.after),
            requestId: event.requestId ?? null,
            ip: event.ip ?? null,
            metadata: toPrismaJson(event.metadata),
          },
        });
      },
      listByOrg: async (orgId, limit) => {
        const rows = await this.db.auditEvent.findMany({
          where: { orgId },
          orderBy: { createdAt: "desc" },
          take: limit ?? 100,
        });
        return rows.map(toAuditEvent);
      },
    };

    const catalog = createCatalogRepositories(db);
    this.products = catalog.products;
    this.variants = catalog.variants;
    this.categories = catalog.categories;
    this.collections = catalog.collections;
    this.assets = catalog.assets;
    this.revisions = catalog.revisions;

    const pricingInventory = createPricingInventoryRepositories(db);
    this.priceLists = pricingInventory.priceLists;
    this.prices = pricingInventory.prices;
    this.promotions = pricingInventory.promotions;
    this.inventoryItems = pricingInventory.inventoryItems;
    this.reservations = pricingInventory.reservations;

    const orderRepos = createOrderRepositories(db);
    this.carts = orderRepos.carts;
    this.checkouts = orderRepos.checkouts;
    this.orders = orderRepos.orders;
    this.idempotency = orderRepos.idempotency;

    const paymentFinance = createPaymentFinanceRepositories(db);
    this.paymentIntents = paymentFinance.paymentIntents;
    this.paymentAttempts = paymentFinance.paymentAttempts;
    this.refunds = paymentFinance.refunds;
    this.webhookEvents = paymentFinance.webhookEvents;
    this.journals = paymentFinance.journals;
    this.settlements = paymentFinance.settlements;
    this.taxRates = paymentFinance.taxRates;

    const fulfillmentRepos = createFulfillmentRepositories(db);
    this.fulfillments = fulfillmentRepos.fulfillments;
    this.returns = fulfillmentRepos.returns;
    this.shippingRates = fulfillmentRepos.shippingRates;

    const cms = createCmsRepositories(db);
    this.pages = cms.pages;
    this.pageRevisions = cms.pageRevisions;

    const builderTheme = createBuilderThemeRepositories(db);
    this.blockDefinitions = builderTheme.blockDefinitions;
    this.themes = builderTheme.themes;
    this.themeTemplates = builderTheme.themeTemplates;

    const cloneRepos = createCloneRepositories(db);
    this.forkLinks = cloneRepos.forkLinks;
    this.cloneManifests = cloneRepos.cloneManifests;

    const searchRepos = createSearchRepositories(db);
    this.outbox = searchRepos.outbox;
    this.searchIndex = searchRepos.searchIndex;

    const extensionRepos = createExtensionRepositories(db);
    this.plugins = extensionRepos.plugins;
    this.webhookSubscriptions = extensionRepos.webhookSubscriptions;
    this.webhookDeliveries = extensionRepos.webhookDeliveries;

    const analyticsRepos = createAnalyticsRepositories(db);
    this.analyticsEvents = analyticsRepos.analyticsEvents;
    this.rateLimitPolicies = analyticsRepos.rateLimitPolicies;
    this.rateLimitCounters = analyticsRepos.rateLimitCounters;

    this.users = createUserRepository(db);
  }
}
