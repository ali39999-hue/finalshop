# Domain Map

Wave 0 baseline (task ARC-002), derived from the master roadmap §4, §5, §6, §12, §17.
This map is the shared vocabulary for module boundaries, naming, and tests.
Changes here require an ADR if they move a boundary.

## System pipeline

```text
Internet / Custom Domain / Subdomain
  → Edge: CDN / WAF
  → Next.js Web + Storefront + Admin
  → BFF / API Contract Layer
  → Application Commands & Queries
  → Domain Modules
      ├── Identity / Organizations / Tenancy
      ├── Catalog / Pricing / Promotions
      ├── Cart / Checkout / Orders
      ├── Inventory / Fulfillment / Returns
      ├── Payments / Tax / Finance
      ├── CMS / Builder / Themes
      ├── CRM / Support / Notifications
      └── Analytics / Search / Integrations
  → Repositories → PostgreSQL / Redis / Object Storage / Search
  → Outbox → Workers → Integrations / Emails / Webhooks / Indexing
```

## Tenant / store hierarchy

```text
Platform
└── Organization (Tenant)
    ├── Store A
    │   ├── Storefronts / Locales
    │   ├── Branches / Locations
    │   ├── Domains
    │   └── Team / Roles
    ├── Store B
    └── Child Store C (Forked from A)
```

- For v1, a business tenant is an Organization with one or more Stores.
- A **Branch** models location/fulfillment/stock/business unit — it is not a
  security boundary.
- Domain resolution: `Host → Domain record → Storefront → Store → Tenant`, and
  the result lands in the request context before any query runs.

## Domains and primary entities

| Domain | Purpose | Primary entities | P0 invariants |
| --- | --- | --- | --- |
| Tenancy | Tenant isolation, org structure | Organization, Membership, Role, Permission, Domain, Storefront, Branch | No query without a valid tenant context; cross-tenant incident count = 0 |
| Identity & Access | AuthN/AuthZ, audit | Membership, Role, Permission, AuditEvent, ApiKey | Permission checks server-side; every sensitive mutation audited |
| Catalog | Products and structure | Product, Variant, Collection, Category, Attribute, Asset, ProductRevision | Variant carries SKU/barcode/stock/weight; product carries content/SEO/media; schema-driven custom fields |
| Pricing | Deterministic price resolution | PriceList, PriceRule, Promotion, Coupon, DiscountAllocation | Deterministic `resolvePrice(context)` with full PriceBreakdown; decimal money only; quote snapshot persisted at checkout boundary |
| Inventory | Stock and reservations | StockLocation, InventoryItem, Reservation, Transfer, Adjustment | No oversell; atomic reservation with TTL + expiry release; concurrency tests mandatory |
| Cart & Checkout | Cart → Quote → Checkout → Order | Cart, CartLine, Quote, Checkout, Address | Checkout is a real state machine independent of UI steps; price lock/refresh; idempotent mutations |
| Order | Lifecycle | Order, OrderLine, Customer | Explicit state machine with audited transitions; idempotency keys on create/capture/refund |
| Fulfillment | Shipping and returns | Shipment, Fulfillment, TrackingEvent, Return, RMA | Partial fulfillment supported; refund↔financial linkage |
| Payment | Provider-agnostic payments | PaymentIntent, PaymentAttempt, Capture, Refund, ProviderEvent | Idempotency + signed webhooks + replay safety; no provider fields leak into the domain model |
| Finance | Ledger-based money | Account, Journal, JournalLine, TaxLine, Settlement, Reconciliation | Balanced journal invariant; every financial mutation emits an audit event |
| CMS | Pages and content | Page, PageRevision, Template, Pattern, AssetFolder | Draft/Publish/Schedule/Archive + revisions + compare + restore; JSON schema AST, never stored HTML |
| Builder | Commerce-aware page builder | BlockDefinition, BlockInstanceSchema, Binding, DataSource | Blocks bind to domain data; tenants can never execute arbitrary server-side code |
| Theme | Design system runtime | Theme, ThemeRevision, Tokens, ComponentVariants | Every publish is an immutable revision; contrast/a11y guards; scoped sanitized custom CSS only |
| Clone / Fork | Store duplication & lineage | CloneProfile, Snapshot, CloneManifest, Override, SyncJob | Clone profiles whitelist what is copied; orders/payments/customers/secrets never cloned; manifest + invariant validation before publish |
| CRM / Support | Customer operations | Customer, Segment, Note, Ticket | Field-scope permissions on sensitive customer data |
| Analytics / Search | Derived intelligence | Event, Index, Dashboard | Search index is derived state (outbox-driven); event schema versioned; no PII leakage |
| Platform | Extensibility | Plugin, App, Webhook, FeatureFlag, Job | Capability-based plugins (manifest + permissions); no direct Prisma/schema access for plugins |

## Cross-cutting capabilities

- **Clone / Fork / Inheritance** (roadmap §12): Clone = independent copy from a
  snapshot; Fork = child with parent link and inheritance; Sync = targeted
  change transfer parent→child; Detach = cut inheritance. Effective value =
  `ParentBase + ChildOverrides + LocalRuntimeContext`, with per-field status
  `inherited | overridden | detached`. Inheritance is enabled only for
  Theme, Template, Pattern, selected Settings, Catalog Templates — never for
  orders, payments, ledger, or customer data.
- **State machines** (roadmap §18): Order, Payment, Refund, Inventory
  Reservation, Return, Publish Job, Clone Job all get explicit transition
  tables (`from[]`, `to`, `command`, `guard`, `sideEffects`, `auditEvent`).
- **Outbox**: every catalog/pricing/finance mutation that feeds derived state
  (search index, webhooks, emails) emits a transactional outbox event.
