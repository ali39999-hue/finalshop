<!--
Source: Global_Commerce_OS_Store_Builder_Roadmap_FA.docx (copy in docs/product/sources/)
Language: Persian (FA) - verbatim extraction of the original master document.
English working derivations live in docs/adr, docs/architecture, docs/security.
-->

# سند جامع معماری و نقشه راه

پلتفرم Commerce OS + Store Builder + CMS + ERP

برای ساخت یک فروشگاه‌ساز کلاس جهانی، چندمستاجری، قابل کلون و قابل توسعه

این سند مسیر پیشنهادی برای ساخت محصولی در سطح Firuzo/iTRIP است؛ اما با مأموریت متفاوت: ساخت یک هسته عمومی فروشگاهی که فروشگاه، CMS، Page Builder، ERP، کنترل ظاهر، چندمستاجری، کلون‌سازی و زیرشاخه را در یک معماری واحد جمع می‌کند.

اصل مرکزی: ما «وردپرس برای فروشگاه» نمی‌سازیم؛ یک Commerce Operating System می‌سازیم که تجربه انعطاف‌پذیر وردپرس، مدل بخش/بلوک Shopify، ماژولار بودن موتورهای Commerce و انضباط معماری Firuzo را در یک محصول بومی‌تر ترکیب کند.

مشخصات | مقدار
| --- | --- |
هدف محصول | Global Commerce OS / Store Builder
مدل محصول | B2C + B2B + Multi-tenant + White-label + Multi-store
معماری پیشنهادی | Modular Monolith در Monorepo + Web + Admin + Worker
هسته داده | PostgreSQL + Redis + Object Storage + Search
صفحه‌ساز | Schema-driven Block/Section Builder + Theme System
کلون | Template/Fork/Override/Sync/Detach
قابلیت توسعه | Plugin/App/Event/Webhook Architecture
استاندارد کیفیت | Production-grade؛ تست، امنیت، Observability و Accessibility از ابتدا

# فهرست سند

- 1. تعریف محصول و North Star

- 2. چرا این معماری و الگوهای مرجع
- 3. اصول غیرقابل مذاکره
- 4. معماری کلان سیستم
- 5. مدل Multi-tenant، Store و Branch
- 6. هسته Commerce
- 7. Catalog، Inventory، Pricing و Promotion
- 8. Cart، Checkout، Order و Fulfillment
- 9. Payment، Refund، Tax و Finance
- 10. CMS و Page Builder در سطح WordPress+
- 11. Theme Engine و Design System
- 12. الگوریتم Clone / Fork / Inheritance / Sync
- 13. ERP و Operations
- 14. IAM، RBAC و Security
- 15. Search، SEO، Analytics و Personalization
- 16. Plugin / App / Integration Platform
- 17. Data Model و Schema پیشنهادی
- 18. State Machines و Workflow Engine
- 19. Caching، Performance و Scalability
- 20. QA، Accessibility و Release Gates
- 21. DevOps و Observability
- 22. ساختار Monorepo پیشنهادی
- 23. Roadmap مرحله‌ای
- 24. Breakdown اجرایی Waveها
- 25. شاخص‌های موفقیت و Definition of Done
- 26. ریسک‌ها و تصمیم‌های معماری
- 27. فهرست Repository/Skill و منابع پژوهشی
- 28. جمع‌بندی و مسیر پیشنهادی اجرای واقعی
# 1. تعریف محصول و North Star

محصول باید هم‌زمان پنج نقش را ایفا کند: (۱) فروشگاه آنلاین، (۲) سیستم مدیریت محتوا، (۳) سایت‌ساز و Theme Builder، (۴) ERP و مرکز عملیات، و (۵) پلتفرم SaaS برای ایجاد چندین فروشگاه مستقل یا فرزند از یک هسته مشترک.

North Star پیشنهادی: «هر کسب‌وکار بتواند بدون کدنویسی یک فروشگاه حرفه‌ای بسازد، ظاهر و ساختار آن را آزادانه تغییر دهد، داده‌های فروش و عملیات را مدیریت کند، فروشگاه‌های فرزند یا شعبه ایجاد کند و در عین استقلال، از Templateها و قابلیت‌های مرکزی استفاده کند.»

قابلیت | سطح هدف | اصل طراحی
| --- | --- | --- |
فروشگاه | Enterprise | B2C/B2B، چند کاناله، سفارش و fulfillment کامل
CMS | Enterprise | Draft/Publish/Version/Preview/Schedule/Localization
Page Builder | World-class | Block/Section/Template + drag/drop + responsive controls
Theme | World-class | Design tokens + global styles + component variants
ERP | Advanced | Order/Inventory/Finance/CRM/Operations/Reports
Multi-tenant | Enterprise | Tenant isolation + domains + RBAC + quotas
Clone/Fork | Differentiator | Snapshot + dependency graph + overrides + sync/detach
Extensibility | Platform | Plugins, apps, webhooks, event bus, API contracts

# 2. چرا این معماری و الگوهای مرجع

بررسی الگوهای فعلی نشان می‌دهد چند ایده ارزش انتقال دارند: Medusa از لایه API → Workflow → Module → Data Store و ماژول‌های دامنه‌ای استفاده می‌کند؛ Shopify از Section/Block/JSON Template برای سفارشی‌سازی Theme استفاده می‌کند؛ WordPress در Full Site Editing بر Pattern، Template، Template Part و Global Styles متکی است؛ Payload مدل Block و Version/Preview/Access را در CMS فراهم می‌کند؛ و Vercel الگوی چندمستاجری مبتنی بر یک کدبیس و دامنه/ساب‌دامین را مستند کرده است. [1][2][3][4][5]

نتیجه مهم: نباید یکی از این محصولات را کپی کنیم. باید الگوهای موفق را جدا کرده و برای یک مدل Commerce-first و Multi-tenant با هسته اختصاصی ترکیب کنیم.

# 3. اصول غیرقابل مذاکره

- هر Tenant/Store باید مرز امنیتی و داده‌ای روشن داشته باشد؛ هیچ query حساس بدون tenant context معتبر اجرا نشود.

- Business logic در Domain/Application باشد، نه در React components و نه در route handlers.
- هر mutation مهم باید command-oriented، idempotent و قابل audit باشد.
- کلون داده‌های مالی، سفارش‌ها، پرداخت‌ها و مشتریان به صورت پیش‌فرض ممنوع است؛ clone profile مشخص می‌کند چه چیزی کپی شود.
- Page Builder هرگز نباید به اجرای arbitrary server-side code توسط tenant وابسته باشد.
- هر feature باید loading/empty/error/success/permission/no-access state داشته باشد.
- هر تغییر Theme/CMS باید versionable، previewable و rollbackable باشد.
- AI فقط پیشنهاد بدهد؛ فرمان‌های حساس مالی/سفارش/داده با approval boundary اجرا شوند.
- Feature بدون test و runtime evidence «کامل» محسوب نمی‌شود.
# 4. معماری کلان سیستم

```text
Internet
Custom Domain
Subdomain
        ↓
Edge
CDN
WAF
        ↓
Next.js Web + Storefront + Admin
        ↓
BFF
API Contract Layer
        ↓
Application Commands & Queries
        ↓
Domain Modules
        ├── Identity
Organizations
Tenancy
        ├── Catalog
Pricing
Promotions
        ├── Cart
Checkout
Orders
        ├── Inventory
Fulfillment
Returns
        ├── Payments
Tax
Finance
        ├── CMS
Builder
Themes
        ├── CRM
Support
Notifications
        └── Analytics
Search
Integrations
        ↓
Repositories → PostgreSQL
Redis
Object Storage
Search
        ↓
Outbox → Workers → Integrations
Emails
Webhooks
Indexing
```


مدل پیشنهادی Modular Monolith است، نه microservices از روز اول. دلیل: دامنه‌ها زیادند ولی هنوز باید consistency، سرعت توسعه و traceability بالا بماند. جداسازی runtime فقط جایی انجام می‌شود که واقعاً لازم است: web، worker، search indexer و در آینده jobهای سنگین.

لایه | مسئولیت | نباید داشته باشد
| --- | --- | --- |
Presentation | UI، accessibility، view-model، interaction | Prisma، business rules، direct payment logic
Application | Command/Query، orchestration، transaction boundaries | UI concerns
Domain | Rules، entities، value objects، state machines | Framework coupling
Infrastructure | DB، Redis، storage، external APIs | Business policy تصمیم‌گیری
Workers | async jobs، retries، indexing، notifications | Request lifecycle dependency

# 5. مدل Multi-tenant، Store و Branch

```text
Platform
└── Organization
Tenant
    ├── Store A
    │   ├── Storefronts
Locales
    │   ├── Branches
Locations
    │   ├── Domains
    │   └── Team
Roles
    ├── Store B
    └── Child Store C (Forked from A)
```


برای نسخه اول، هر business tenant یک Organization است و یک یا چند Store دارد. Branch برای location/fulfillment/stock/business unit است، نه یک tenant امنیتی. این تفکیک باعث می‌شود franchising، multi-brand و multi-store بدون شکستن مدل داده ممکن شود.

Domain resolution الگوریتمش باید Host → Domain record → Storefront → Store → Tenant را طی کند و نتیجه را در request context قرار دهد. Vercel نیز multi-tenant با یک deployment، subdomain و custom domain را به‌عنوان یک الگوی معتبر مستند کرده است. [5]

برای defense-in-depth، علاوه بر tenant-aware repositories، می‌توان در PostgreSQL از Row-Level Security برای جدول‌های حساس استفاده کرد؛ RLS می‌تواند خواندن/درج/ویرایش/حذف ردیف‌ها را بر اساس policy محدود کند. [6]

# 6. هسته Commerce

ماژول | وظیفه کلیدی | نیازهای حساس
| --- | --- | --- |
Catalog | Product, Variant, Collection, Attributes | versioning، localized content، SEO
Pricing | Price lists، customer group، channel، currency | determinism، money-safe arithmetic
Inventory | Stock locations، availability، reservations | concurrency، expiry، no oversell
Cart/Checkout | Cart→Quote→Checkout→Order | idempotency، price lock/refresh
Order | Lifecycle، line items، fulfillment | state machine، audit trail
Fulfillment | Shipping/Delivery/Pickup | partial fulfillment، tracking
Returns | RMA، refund، restock | policy engine، financial linkage
Promotion | Coupon، rule، campaign | priority، stacking rules، audit

# 7. Catalog، Inventory، Pricing و Promotion

## 7.1 Catalog model

Product باید از Variant جدا باشد. SKU، barcode، stock، weight و بعضی attributes در سطح variant قرار گیرند. Product content، SEO، media و collection relations در سطح product قرار می‌گیرند. Custom fields باید schema-driven باشند و با validation/access control مدیریت شوند؛ این رویکرد با مدل Field/Block در Payload هم‌جهت است. [4]

## 7.2 Pricing Engine

```text
resolvePrice(context)
1. validate currency + channel + customer group
2. collect eligible price lists
3. select base candidate by priority
4. apply quantity
tier pricing
5. evaluate promotions
6. apply tax mode if applicable
7. round using currency policy
8. emit PriceBreakdown + PriceVersion
9. persist quote snapshot at checkout boundary
```


Price engine باید deterministic باشد. هر نتیجه باید breakdown داشته باشد تا ERP بتواند بفهمد قیمت از کجا آمده است. برای پول از Decimal و currency-aware rounding استفاده شود؛ floating-point برای مقدار مالی ممنوع.

## 7.3 Inventory reservation

```text
reserve(item, qty, ttl)
→ atomic transaction
→ verify available = on_hand - reserved
→ create reservation
→ schedule expiry
→ commit
→ async outbox event
→ on expiry: release reservation
```


برای عملیات رزرو باید concurrency test اجباری باشد. Race condition در checkout یکی از P0های معماری است.

# 8. Cart، Checkout، Order و Fulfillment

Checkout باید یک state machine واقعی باشد و از UI stepها مستقل بماند. پیشنهاد: CART → PRICED → CUSTOMER_CAPTURED → ADDRESS_CAPTURED → REVIEWED → PAYMENT_PENDING → PAYMENT_CONFIRMED → ORDER_CONFIRMED → FULFILLING → COMPLETED، همراه با مسیرهای EXPIRED، CANCELLED، PAYMENT_FAILED و PARTIALLY_FULFILLED.

هر POST حساس مانند create order، capture payment، create fulfillment و refund باید idempotency key داشته باشد. Stripe نیز idempotency key را دقیقاً برای retry ایمن و جلوگیری از اجرای دوباره mutationهای create/update مستند می‌کند. [7]

## 8.1 Checkout UX

- یک خلاصه قیمت همیشه قابل دسترس

- روی موبایل sticky total + CTA
- نمایش تغییر قیمت قبل از پرداخت
- نمایش موجودی/زمان ارسال/شرایط مرجوعی قبل از تعهد
- ذخیره امن draft checkout
- recovery پس از خطای شبکه یا refresh
# 9. Payment، Refund، Tax و Finance

Payment باید provider-agnostic باشد: PaymentProvider interface + PaymentIntent + Attempt + Capture + Refund + WebhookEvent. هیچ Provider-specific field نباید domain model را آلوده کند مگر در metadata extension.

Finance باید ledger-based باشد. Transaction مالی raw object نیست؛ باید Journal/JournalLine، Account، TaxLine، Settlement و Reconciliation داشته باشد. تمام mutationهای مالی audit event تولید کنند.

دامنه | مدل پایه | گیت اجباری
| --- | --- | --- |
Payment | Intent/Attempt/Capture/Refund | idempotency + signed webhook + replay safety
Tax | Rate/Rule/Jurisdiction | effective date + jurisdiction
Ledger | Journal/Line/Account | balanced journal invariant
Settlement | Batch/Statement/Provider | reconciliation
Refund | Request/Approval/Execution | policy + money trace

# 10. CMS و Page Builder در سطح WordPress+

Page Builder باید بر مبنای JSON/Schema AST باشد، نه HTML ذخیره‌شده. مدل پیشنهادی: Page → Sections → Blocks → Props + Bindings + Responsive overrides + Visibility rules. Shopify از JSON Templates برای نگهداری ترتیب sections و تنظیمات آن‌ها استفاده می‌کند؛ WordPress نیز block patterns و template parts را به‌عنوان building blocks برای ساخت سایت دارد. [2][3]

```text
PageRevision
{
  schemaVersion,
  templateId,
  nodes: [
    { type, id, props, children, bindings, responsive, visibility }
  ],
  globalStyleRef,
  dataSourceRefs,
  seo,
  publishState
}
```


## 10.1 Block types

دسته | نمونه | سطح کنترل
| --- | --- | --- |
Commerce | ProductGrid, ProductDetail, Cart | binding به domain data
Content | Text, Image, Video, FAQ | content-only edit mode
Layout | Container, Grid, Stack, Section | spacing/breakpoint/layout
Growth | Banner, Countdown, Testimonials | schedule/targeting
Extension | AppSlot, CustomData | permission + schema

کاربر باید بتواند محتوای یک Pattern را بدون شکستن layout تغییر دهد، شبیه content-only editing وردپرس؛ ولی برای مدیر پیشرفته، full edit و inspector نیز وجود داشته باشد. [3]

## 10.2 Versioning

برای Page، Global Settings، Theme و Content، Draft/Published/Scheduled/Archived + Revision + Compare + Restore لازم است. Payload نیز نسخه‌ها، diff، rollback، draft preview، autosave و access control را به‌عنوان الگوی mature CMS ارائه می‌کند. [8]

# 11. Theme Engine و Design System

Theme نباید collection از component files باشد؛ باید یک قرارداد داده‌ای versioned داشته باشد. هر Theme شامل Design Tokens، Component Variants، Templates، Sections، Patterns، Fonts، Assets و Rules است.

```text
Theme
├── tokens
│   ├── color
│   ├── typography
│   ├── spacing
│   ├── radius
│   ├── shadow
│   └── motion
├── components
├── templates
├── sections
├── patterns
└── policies
```


امکان | رفتار پیشنهادی
| --- | --- |
Global Styles | تغییر رنگ/فونت/فاصله/shape در یک نقطه
Theme presets | Presetهای Industry + Store-type
Responsive | desktop/tablet/mobile controls per token/block
Dark mode | اختیاری و token-driven
A11y | contrast guard + heading order + focus rules
Preview | live iframe / isolated preview environment
Rollback | هر publish یک immutable revision
Custom CSS | محدود به scoped tenant stylesheet با sanitizer

# 12. الگوریتم Clone / Fork / Inheritance / Sync

این مهم‌ترین مزیت معماری پیشنهادی است. سه عملیات متفاوت باید از هم جدا شوند: Clone یعنی ایجاد مستقل بر اساس snapshot؛ Fork یعنی ایجاد child با رابطه parent و امکان inheritance؛ Sync یعنی انتقال تغییرات مشخص از parent به child؛ Detach یعنی قطع inheritance.

## 12.1 Clone Profiles

پروفایل | کپی می‌شود | کپی نمی‌شود
| --- | --- | --- |
Theme Clone | Theme, tokens, templates, patterns | orders, payments, customers
Store Blueprint | theme + pages + catalog structure + settings | customer identity + finance
Full Launch Seed | blueprint + demo content + products | production transactions
Child Branch | inherited config + selected catalog | parent financial history
Sandbox | schema + masked sample data | real secrets/tokens

## 12.2 الگوریتم اجرایی

```text
clone(sourceId, targetTenantId, profile)
1. authorize source read + target create
2. freeze source snapshot id
3. build dependency graph
4. topological sort entities
5. create ID map old→new
6. copy allowed entities by profile
7. rewrite references through ID map
8. copy/reuse assets according to policy
9. normalize slugs/domains/unique keys
10. emit clone manifest + warnings
11. run invariant validator
12. publish only after validation passes
```


کلون باید یک CloneManifest قابل مشاهده تولید کند: تعداد رکوردها، skipped fields، rewritten references، conflicts، warnings و final mappings. این موضوع برای پشتیبانی، audit و rollback ضروری است.

## 12.3 Inheritance model

EffectiveValue = ParentBase + ChildOverrides + LocalRuntimeContext / status per field = inherited | overridden | detached
| --- | --- | --- |

برای کاهش پیچیدگی، inheritance باید در سطح resourceهایی که واقعاً قابل اشتراک‌اند فعال شود: Theme, Template, Pattern, selected Settings, Catalog Templates. سفارش، Payment، Ledger و Customer data نباید inherited باشند.

# 13. ERP و Operations

ERP همان مسیر تکامل‌یافته Firuzo است، ولی برای Commerce عمومی. باید از ابتدا workspaceهای تخصصی داشته باشد: Sales، Orders، Customers، Products، Inventory، Procurement، Fulfillment، Returns، Payments، Finance، Marketing، CMS، Store Builder، Automations، Support، Analytics، Users، Roles، Audit.

Workspace | صفحه‌های اصلی | قابلیت‌های کلیدی
| --- | --- | --- |
Commerce | Orders, Carts, Quotes | search, bulk actions, export, saved views
Catalog | Products, Collections, Attributes | import/export, bulk edit, validation
Inventory | Locations, Stock, Reservations | alerts, transfers, cycle count
Operations | Queues, Exceptions, Tasks | SLA, owner, retry, escalation
Finance | Payments, Refunds, Ledger, Reconciliation | traceability, approvals
Builder | Pages, Themes, Templates | preview, revisions, publish
CRM | Customers, Segments, Notes | 360 profile
Analytics | Sales, Funnel, Cohorts | dashboards + exports

Reusable ERP DataGrid باید از روز اول feature-complete باشد: column controls، search، filter، sort، pagination، saved views، bulk actions، keyboard navigation، export، dense/comfortable density و URL-persisted state.

# 14. IAM، RBAC و Security

امنیت باید multi-layer باشد: Authentication → Tenant Context → Role → Permission → Resource Scope → Field Scope → Audit. سیستم‌های B2B مانند Clerk Organizations و Vendure هم نشان می‌دهند که سازمان‌ها، عضویت، role و permission باید به‌عنوان abstractionهای مستقل مدل شوند. [9][10]

کنترل | مدل
| --- | --- |
Role | catalog_admin, order_manager, finance, designer, support, owner...
Permission | resource.action مثل product.update
Scope | tenant/store/branch/resource-owner
Field scope | مخفی‌سازی یا محدودسازی فیلدهای حساس
Audit | actor, subject, action, before, after, requestId, IP metadata
Break-glass | دسترسی اضطراری کوتاه‌مدت + audit

- Secretها فقط در secret manager/environment امن؛ در clone منتقل نشوند.

- Webhookها با signature verification و replay protection.
- CSRF، SSRF، XSS، open redirect، mass assignment و IDOR در threat model تست شوند.
- Rate limit و abuse prevention به صورت tenant-aware و route-aware.
# 15. Search، SEO، Analytics و Personalization

Search engine باید برای catalog scale از query database جدا باشد. PostgreSQL source of truth است؛ Search index derived state است. هر catalog mutation یک outbox event تولید می‌کند و indexer آن را update می‌کند.

دامنه | پیشنهاد
| --- | --- |
Search | OpenSearch/Meilisearch/Typesense؛ انتخاب نهایی بر اساس scale و filtering
SEO | Metadata, canonical, sitemap, robots, schema.org, internal linking
Analytics | event schema versioned؛ no PII leakage
Personalization | segment + rule + recommendation، opt-out aware
Experimentation | feature flag + variant assignment + measurement

برای accessibility و regression، Playwright هم visual snapshots و هم ARIA snapshots ارائه می‌کند و توصیه می‌کند accessibility automation با تست‌های دستی/کاربر تکمیل شود. [11][12]

# 16. Plugin / App / Integration Platform

Plugin model باید capability-based باشد. Plugin نباید مستقیماً به Prisma schema اصلی دسترسی داشته باشد. باید extension point دریافت کند: permissions، events، UI slots، API routes، background jobs، custom fields و webhooks.

```text
PluginManifest
- id
version
- requiredCoreVersion
- permissions[]
- events.subscribe[]
- ui.slots[]
- routes[]
- jobs[]
- config.schema
- migrations[]
```


برای enterprise، Marketplace آینده‌دار باشد؛ اما install/uninstall باید migration-safe و version-aware باشد.

# 17. Data Model و Schema پیشنهادی

Domain | Entities اصلی
| --- | --- |
Tenant | Organization, Membership, Role, Permission, Domain, Storefront, Branch
Catalog | Product, Variant, Collection, Category, Attribute, Asset, ProductRevision
Commerce | Cart, CartLine, Quote, Order, OrderLine, Address, Customer
Pricing | PriceList, PriceRule, Promotion, Coupon, DiscountAllocation
Inventory | StockLocation, InventoryItem, Reservation, Transfer, Adjustment
Fulfillment | Shipment, Fulfillment, TrackingEvent, Return, RMA
Payment | PaymentIntent, PaymentAttempt, Capture, Refund, ProviderEvent
Finance | Account, Journal, JournalLine, TaxLine, Settlement, Reconciliation
CMS | Page, PageRevision, Theme, ThemeRevision, Template, Pattern, AssetFolder
Builder | BlockDefinition, BlockInstanceSchema, Binding, DataSource
Platform | Plugin, App, Webhook, ApiKey, FeatureFlag, Job, AuditEvent

Canonical entities باید immutable identifiers داشته باشند و slug/domain فقط presentation identifiers باشند. 모든 externally referenced identifiers باید globally safe یا tenant-scoped uniqueness داشته باشند.

# 18. State Machines و Workflow Engine

هر lifecycle مهم باید explicit state machine داشته باشد و transitionها executable policy باشند. مثال: Order, Payment, Refund, Inventory Reservation, Return, Publish Job, Clone Job.

```text
Transition {
  from: State[],
  to: State,
  command: string,
  guard: Policy,
  sideEffects: Step[],
  auditEvent: EventType
}
```


برای jobهای کوتاه و معمول می‌توان BullMQ را به‌عنوان queue/worker استفاده کرد؛ BullMQ deduplication و retry را پوشش می‌دهد. برای workflowهای بسیار طولانی و multi-step که نیاز به durable execution دارند، Temporal گزینه‌ای برای فاز scale است. [13]

# 19. Caching، Performance و Scalability

لایه | Policy
| --- | --- |
CDN | static/media + cacheable public pages
Application cache | tenant config, navigation, theme tokens, hot products
Query cache | read-model / search facets
DB | proper indexes, partitioning only when justified
Async | emails, search indexing, imports, exports, reports
Media | object storage + transform pipeline + CDN

اصل scaling: اول correctness، بعد caching. هیچ cacheای نباید منبع حقیقت برای قیمت، موجودی، payment یا ledger باشد.

# 20. QA، Accessibility و Release Gates

Gate | اجباری
| --- | --- |
Unit | Domain rules, pricing, permission, clone manifest
Integration | DB transactions, outbox, payment/webhook
E2E | Browse → Cart → Checkout → Payment → Order
Tenant isolation | cross-tenant access test suite
Concurrency | inventory reservation + checkout race tests
Visual regression | storefront + admin critical pages
Accessibility | axe + ARIA snapshot + manual sample
Security | SAST, dependency, secrets, API abuse, permission tests
Migration | up/down/forward compatibility where feasible

Playwright می‌تواند screenshot comparison و ARIA snapshot را برای regression استفاده کند؛ برای accessibility، خود Playwright نیز ترکیب automation + manual assessment را توصیه می‌کند. [11][12]

# 21. DevOps و Observability

Observability باید در سطح requestId، tenantId، actorId، commandId و workflowId استاندارد شود. OpenTelemetry برای JavaScript API/SDKهای tracing، metrics و logs را فراهم می‌کند و برای همین correlation مناسب است. [14]

Signal | نمونه
| --- | --- |
Metrics | checkout latency, order success, queue lag, cache hit rate
Logs | structured JSON + correlation IDs
Traces | request → command → DB → external provider → webhook
SLO | storefront availability, checkout success, job completion
Alerts | payment failure spikes, oversell, tenant errors, queue backlog

# 22. ساختار Monorepo پیشنهادی

```text
apps/
  web/            # public storefront + customer account
  admin/          # ERP + builder + platform admin
  api/             # BFF/API contracts if separated from web
  worker/          # background jobs

packages/
  domain/          # entities, value objects, policies
  application/     # commands, queries, workflows
  infrastructure/  # prisma, redis, storage, search
  ui/              # shared accessible primitives
  builder/         # block schema + renderer + inspector
  theme/           # tokens + theme runtime
  commerce/        # cart/order/catalog modules
  finance/         # money/ledger/tax
  auth/            # IAM + authorization
  i18n/             # locale contracts
  testing/         # fixtures + test utilities
  config/          # eslint/tsconfig/build shared

infra/
  docker/
  migrations/
  observability/

docs/
  adr/
  architecture/
  runbooks/
  product/
  security/
```


اگر Next.js برای web و admin کافی است، دو app را در ابتدای کار می‌توان به یک app با route groups منطقی تبدیل کرد؛ اما package boundaries را از روز اول حفظ کنید تا بعداً split کردن ساده باشد.

# 23. Roadmap مرحله‌ای

Wave | تمرکز | خروجی
| --- | --- | --- |
W0 | Vision + baseline | PRD، architecture ADR، threat model، domain map
W1 | Platform Core | Tenant/Org/Store/Domain/IAM/RBAC
W2 | Commerce Kernel | Catalog/Product/Variant/Customer/Channel
W3 | Price + Inventory | Pricing engine، stock، reservation
W4 | Cart + Order | cart، checkout state machine، order lifecycle
W5 | Payment + Tax | provider abstraction، webhook، refund، tax
W6 | Fulfillment | shipping، delivery، returns، RMA
W7 | CMS Core | pages، content types، revisions، media
W8 | Theme + Builder | sections، blocks، templates، inspector
W9 | Clone/Fork | snapshot، manifest، inheritance، sync/detach
W10 | ERP | operations، data grid، finance، CRM، support
W11 | Search/SEO | indexing، faceting، SEO، sitemap
W12 | Analytics | event model، dashboards، funnels، cohorts
W13 | Extensions | plugins، apps، webhooks، marketplace foundations
W14 | Hardening | security، performance، accessibility، recovery
W15 | Launch | migration، production runbook، SLO، support
W16+ | Scale | AI، personalization، multi-region، advanced B2B

این Waves باید بر اساس dependency اجرا شوند، نه صرفاً بر اساس صفحه‌های UI. Builder قبل از مدل Theme/CMS پایدار، و ERP مالی قبل از ledger/payment واقعی، نباید جلو بیفتد.

# 24. Breakdown اجرایی Waveها

Wave | تمرکز | تسک‌های اجرایی کلیدی
| --- | --- | --- |
W0 | Baseline | domain/entity map؛ ADR؛ feature matrix؛ threat model؛ performance budget؛ golden journeys
W1 | Multi-tenant | Tenant context؛ domain resolver؛ RBAC؛ RLS؛ audit؛ quotas
W2 | Commerce | Product/Variant؛ Category/Collection؛ Customer؛ Channel؛ import/export؛ media
W3 | Pricing/Inventory | money kernel؛ price resolution؛ promotion؛ availability؛ atomic reservation؛ expiry
W4 | Checkout/Order | cart؛ quote؛ state machine؛ order aggregate؛ idempotency؛ recovery
W5 | Payment/Tax | provider contract؛ payment intent؛ webhook inbox؛ refund؛ tax؛ ledger posting
W6 | Fulfillment | shipping rates؛ shipment؛ tracking؛ pickup؛ returns/RMA؛ refund linkage
W7 | CMS | page model؛ revision؛ draft/preview؛ scheduler؛ content types؛ assets
W8 | Builder | block registry؛ schema validation؛ canvas؛ inspector؛ responsive؛ theme tokens؛ publish
W9 | Clone/Fork | clone profiles؛ dependency graph؛ ID map؛ asset policy؛ inheritance؛ conflicts؛ detach
W10 | ERP | role dashboards؛ data grid؛ exceptions؛ global search؛ finance؛ CRM؛ support
W11–W16 | Scale/Hardening | search؛ SEO؛ analytics؛ plugin SDK؛ security؛ visual/a11y؛ observability؛ AI foundations

هر Wave باید با dependencyهای قبلی بسته شود؛ Builder قبل از پایدار شدن Theme/CMS و ERP مالی قبل از ledger/payment واقعی نباید وارد فاز production شود.

# 25. شاخص‌های موفقیت و Definition of Done

حوزه | KPI / شرط
| --- | --- |
Commerce | checkout success, order success, payment success, cancellation
Builder | time-to-publish، % users able to publish without developer
Clone | clone success rate، validation failure rate، mean clone duration
Tenant | cross-tenant incident count = 0؛ domain routing correctness
Performance | Core Web Vitals budget + server latency budget per route
UX | task success، checkout abandonment، mobile error rate
Security | critical/high findings resolved before release
Quality | E2E golden journey green + visual/a11y gates green
Operations | queue lag, recovery time, reconciliation mismatch

Definition of Done برای هر feature: Code + Migration + Domain rules + API/UI + tests + telemetry + docs + runtime verification. «کامپایل شد» یا «روی صفحه دیده شد» کافی نیست.

# 26. ریسک‌ها و تصمیم‌های معماری

ریسک | اثر | راهکار
| --- | --- | --- |
Theme Builder بیش از حد آزاد | امنیت/Performance/UX افت می‌کند | Schema-driven blocks + safe bindings + limits
Clone data explosion | هزینه DB و storage | clone profiles + reference sharing + dedup assets
Inheritance complexity | Sync conflicts | immutable snapshots + explicit override status + diff
Too many tenants | query/caching hot spots | tenant-aware caching + indexing + quotas
Plugin ecosystem | امنیت و compatibility | manifest + permission + version contract + sandbox where needed
ERP too early | scope creep | ERP waves after transaction kernel
Microservices too early | latency/ops complexity | modular monolith first
AI as source of truth | risk to orders/finance | AI recommendation only + approval boundaries

## تصمیم کلیدی: WordPress را dependency اصلی نکن

WordPress الگوی UX و conceptهای Block/Pattern/Template را به ما یاد می‌دهد، اما هسته این محصول باید Commerce-native باشد. Shopify/Medusa/Vendure/Payload نیز باید reference architecture باشند، نه زیرساخت اجباری.

# 27. فهرست Repository / Skill و منابع پژوهشی

موارد زیر برای reference، مطالعه pattern و در صورت نیاز reuse انتخاب شده‌اند. اصل پروژه این است که dependencyها از روی نیاز انتخاب شوند و هر repository قبل از adoption از نظر license، maintenance، security و API stability بررسی شود.

مرجع | کاربرد در پروژه | وضعیت پیشنهادی
| --- | --- | --- |
Vercel Platforms Starter Kit | multi-tenant routing / custom domains | reference برای routing و deployment
Medusa | commerce modules/workflows | reference برای modular commerce
Vendure | plugin model / fine-grained permissions | reference برای extensibility و IAM
Saleor | headless commerce / channel concepts | reference برای API-first commerce
Payload CMS | blocks, localization, versions, access | reference برای CMS engine
WordPress Gutenberg | block patterns / full-site editing | reference برای editor UX و patterns
Shopify Theme Architecture | sections/blocks/JSON templates | reference برای theme model
shadcn/ui + Radix/Base UI style | accessible UI primitives | reference برای design system
Playwright | E2E + visual + ARIA snapshots | quality gate
axe-core | automated accessibility checks | quality gate
OpenTelemetry JS | traces/metrics/logs | observability standard
BullMQ | queues/retry/deduplication | worker baseline
PostgreSQL RLS | defense-in-depth tenant isolation | security layer
Prisma | typed DB access + migrations | persistence layer candidate
OpenSearch / Meilisearch / Typesense | derived search index | scale-dependent selection
Zod | runtime schemas/contracts | validation standard
TanStack Query | server state/cache in UI | data fetching candidate
Storybook | component contract/visual development | design system QA

## 27.1 منابع کلیدی بررسی‌شده

- [1] Medusa Documentation — Architecture / Commerce Modules / Workflows.

- [2] Shopify Developer Docs — Sections, Blocks and JSON Templates.
- [3] WordPress Developer Docs — Full Site Editing, Block Patterns, Site Editor Patterns.
- [4] Payload CMS Documentation — Fields, Blocks, Localization.
- [5] Vercel Documentation — Vercel for Platforms / multi-tenant Next.js.
- [6] PostgreSQL Documentation — Row Security Policies.
- [7] Stripe API Reference — Idempotent Requests.
- [8] Payload CMS Documentation — Versions, Draft Preview and Autosave.
- [9] Clerk Documentation — Organizations / Multi-tenant architecture.
- [10] Vendure Documentation — Permissions and Custom Permissions.
- [11] Playwright Documentation — Visual Comparisons.
- [12] Playwright Documentation — Accessibility Testing / ARIA Snapshots.
- [13] BullMQ Documentation — Queues, Retrying and Deduplication.
- [14] OpenTelemetry Documentation — JavaScript SDK/API for traces, metrics and logs.
# 28. جمع‌بندی و مسیر پیشنهادی اجرای واقعی

اگر هدف واقعاً محصولی در سطح Firuzo ولی عمومی‌تر و قابل فروش به کسب‌وکارهای مختلف است، بزرگ‌ترین اشتباه این است که پروژه را از «صفحه فروشگاه» شروع کنیم. باید از Platform Kernel شروع شود: Tenant/IAM → Commerce Kernel → Money/Inventory → Checkout/Order → CMS → Theme/Builder → Clone/Fork → ERP → Extensions.

نقطه تمایز اصلی محصول نیز بهتر است خود Page Builder به‌تنهایی نباشد؛ بلکه «Commerce-aware Builder» باشد: کاربر بتواند یک بخش را بسازد و آن را به Product، Collection، Cart، Customer Segment، Promotion، Inventory availability یا یک data source واقعی وصل کند. به این ترتیب Builder صرفاً صفحه‌ساز نیست؛ UIی قابل پیکربندی روی هسته Commerce است.

تمایز دوم، مدل Git-like برای Storeهاست: Template → Fork → Override → Sync → Conflict Review → Detach. این مدل امکان ساخت شبکه فروشگاه‌ها، franchise، برندهای خواهر و storefrontهای منطقه‌ای را با کمترین duplication فراهم می‌کند.

تمایز سوم، یک ERP واقعی در کنار builder است؛ نه dashboard تزئینی. کاربر باید همان جایی که سایت را می‌سازد، عملیات سفارش، موجودی، قیمت، مشتری، پرداخت، بازگشت وجه، گزارش و workflow را مدیریت کند.

ترتیب اجرای توصیه‌شده: ابتدا foundation و امنیت، سپس transaction kernel، بعد CMS و Builder، بعد Clone/Fork، و سپس ERP/Analytics/Extensions. هر Wave باید با evidence کامل بسته شود و تا زمانی که migration، tests، E2E، accessibility، security و runtime verification سبز نشده‌اند، «Done» اعلام نشود.

# ضمیمه A — 50 تسک اول پیشنهادی

Task 01–25 | Task 26–50
| --- | --- |
ARC-001: ثبت ADR معماری Modular Monolith | CHK-002: idempotency
ARC-002: domain map | ORD-001: Order aggregate
ARC-003: dependency rules | ORD-002: order transitions
ARC-004: threat model | PAY-001: PaymentProvider contract
TEN-001: Organization/Tenant model | PAY-002: webhook inbox
TEN-002: Store/Storefront/Branch | PAY-003: refund flow
TEN-003: Domain mapping | FIN-001: Ledger model
IAM-001: Membership/Roles | FIN-002: reconciliation
IAM-002: Permission matrix | CMS-001: Page/Revision
IAM-003: tenant context guard | CMS-002: Asset/Media
IAM-004: audit event | CMS-003: Draft/Preview
IAM-005: RLS strategy | CMS-004: Schedule publish
CAT-001: Product/Variant schema | BLD-001: Block registry
CAT-002: Collection/Category | BLD-002: Section registry
CAT-003: Asset pipeline | BLD-003: schema validator
CAT-004: Catalog revisions | BLD-004: canvas
PRICE-001: Money kernel | BLD-005: inspector
PRICE-002: Price lists | THEME-001: design tokens
PRICE-003: Promotion engine | THEME-002: template registry
INV-001: InventoryItem | CLONE-001: clone profiles
INV-002: Reservation model | CLONE-002: dependency graph
INV-003: atomic reservation | CLONE-003: ID remap
CART-001: Cart aggregate | FORK-001: override model
CART-002: Quote snapshot | FORK-002: sync/diff
CHK-001: Checkout state machine | QA-001: golden customer journey

این سند باید به‌عنوان Architectural/Product Master Document استفاده شود و هر تغییری که این اصول را نقض می‌کند باید با ADR ثبت شود. هدف، ساختن یک فروشگاه زیباتر نیست؛ هدف، ساختن یک platform است که ساخت و اداره فروشگاه را به یک قابلیت productized تبدیل کند.

