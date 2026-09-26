<!--
Source: Commerce_OS_Reference_Atlas_FA_v1.docx (copy in docs/product/sources/)
Language: Persian (FA) - verbatim extraction of the original master document.
English working derivations live in docs/adr, docs/architecture, docs/security.
-->

# Commerce OS / Store Builder

Reference Skills & Repository Atlas

سند مرجع اجرایی برای انتخاب Skill، Repository، الگو و منبع تحقیق

نسخه 1.0 — 26 سپتامبر 2026

```text
هدف: برای هر بخش از پلتفرم فروشگاهی در سطح Firuzo/iTRIP مشخص می‌کند از کدام Skillها و Repositoryها می‌توان برای معماری، پیاده‌سازی، تست و الهام استفاده کرد. این سند «لیست کپی‌کردن» نیست؛ هر مرجع باید با لایسنس، بلوغ، امنیت و انطباق با معماری داخلی بررسی شود.
```


# 1. قانون استفاده از منابع مرجع

- Source of Truth اول: نیازمندی محصول، ADRهای خود پروژه، قراردادهای دامنه و تست‌های پذیرش.

- Source of Truth دوم: مستندات رسمی و RFC/Specification همان فناوری.
- Source of Truth سوم: Repositoryهای مرجع برای دیدن معماری، الگو، تست و edge case؛ نه برای کپی کورکورانه.
- هر dependency قبل از adoption باید از نظر License، امنیت، فعالیت نگهداری، bus factor، bundle/runtime cost و سازگاری با Next.js/React/TypeScript ارزیابی شود.
- برای هسته مالی، سفارش، موجودی، tenant isolation و clone/fork، هیچ Repository خارجی نباید منبع حقیقت داده باشد؛ فقط reference architecture است.
- کد خارجی باید تا حد ممکن در package/module ایزوله باشد تا امکان تعویض آن بدون شکستن Core وجود داشته باشد.
# 2. راهنمای برچسب‌ها

برچسب | معنا | روش استفاده
| --- | --- | --- |
CORE | مناسب برای طراحی هسته | از مدل دامنه و معماری ایده بگیر؛ منطق حساس را داخلی نگه دار.
ADOPT | قابل استفاده مستقیم به‌عنوان dependency | پس از license/security/performance review.
EMBED | قابل embed/extension | مناسب برای editor, UI, search, workflow و ابزارهای اطراف هسته.
REFERENCE | مرجع معماری/UX/الگو | برای مقایسه و استخراج pattern.
TEST | منبع سناریو و تست | برای edge cases، test fixtures و threat model.
SKILL | مهارت قابل نصب/ارجاع به agent | برای بهبود رفتار ایجنت و فرایند توسعه؛ جایگزین کد پروژه نیست.
CAUTION | نیازمند احتیاط | به دلیل license، پیچیدگی، وابستگی شدید یا تفاوت معماری.

# 3. ماتریس سریع مرجع‌ها

بخش | مرجع‌های اصلی | نوع | کاربرد
| --- | --- | --- | --- |
Commerce Core | Medusa; Saleor; Vendure | CORE / REFERENCE | Product model, cart, order, promotion, fulfillment
PIM / Catalog | Akeneo; Saleor; Directus | REFERENCE / ADOPT | Product attributes, catalogs, content models
CMS | Payload; Directus; Strapi; WordPress Gutenberg | ADOPT / REFERENCE | CMS, content modeling, editorial workflow
Visual Builder | Puck; GrapesJS; Gutenberg | EMBED / REFERENCE | Drag-drop builder, blocks, templates
Design System | shadcn/ui; Radix; React Aria; MUI | ADOPT / REFERENCE | Accessible primitives + system tokens
Multi-tenant | Vercel Platforms; Cal.com | REFERENCE | Tenant routing, organization boundaries
Data | PostgreSQL; Prisma; Drizzle; Redis | ADOPT / CORE | Persistence, cache, transactions
Search | Meilisearch; Typesense; OpenSearch | ADOPT / REFERENCE | Catalog/search/filtering
Workflow | Temporal; BullMQ; Trigger.dev | ADOPT / REFERENCE | Durable async workflows
Payments | Stripe Node; Stripe Samples | ADOPT / TEST | Payment intent, webhook, idempotency patterns
Testing | Playwright; Vitest; Testing Library; MSW | ADOPT | E2E, unit, component, mock integration
Security | OWASP ASVS; Cheat Sheets; Semgrep; Gitleaks; Trivy | TEST / ADOPT | Security gates and threat modeling
Observability | OpenTelemetry; Sentry; Prometheus; Grafana | ADOPT | Tracing, errors, metrics
AI / Agents | Anthropic Skills; Superpowers; Puck Skills; Continue | SKILL / REFERENCE | Agent workflow, skills, page-builder integration

# 4. معماری و هسته Commerce

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Medusa | https://github.com/medusajs/medusa | CORE / REFERENCE | ماژولار کردن Commerce primitives، pricing, carts, orders, fulfillment, extension points. | منطق خودمان برای tenant/ERP/finance؛ Medusa را الگوی boundary و module طراحی ببین.
Saleor | https://github.com/saleor/saleor | REFERENCE | API-first commerce، GraphQL، apps و کانال‌های فروش. | برای مقایسه domain boundaries و integration architecture.
Vendure | https://github.com/vendure-ecommerce/vendure | REFERENCE | Commerce framework با plugin architecture و admin patterns. | برای plugin/module boundaries و back-office flows.
Sylius | https://github.com/Sylius/Sylius | REFERENCE | Domain-driven commerce و مدل‌های order/product/promotion. | برای مدل دامنه و state machines؛ نه الزاماً stack.
Spree | https://github.com/spree/spree | REFERENCE | Commerce primitives و storefront/admin patterns. | برای edge-caseهای catalog/order/promotion.
Bagisto | https://github.com/bagisto/bagisto | REFERENCE | Commerce + admin + multi-channel concepts. | برای مقایسه ERP/admin و catalog workflows.

# 5. PIM، Catalog و Product Model

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Akeneo PIM | https://github.com/akeneo/pim-community-dev | REFERENCE | مدیریت product information، attribute families، completeness و enrichment. | برای طراحی Product/Variant/Attribute/Channel مدل قوی.
Directus | https://github.com/directus/directus | ADOPT / REFERENCE | Dynamic data models، permissions و content/data studio. | برای CMS-like admin و configurable data models؛ business core را در domain نگه دار.
Payload CMS | https://github.com/payloadcms/payload | ADOPT / REFERENCE | TypeScript-native CMS، access control، localization و admin. | برای content/collections/admin؛ بهترین candidate برای CMS داخلی ماژولار.
Saleor | https://github.com/saleor/saleor | REFERENCE | Product/channel/variant structure. | برای catalog/channel modeling و API contracts.

# 6. CMS، Content و Editorial Workflow

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Payload | https://github.com/payloadcms/payload | ADOPT | Collections, fields, localization, access, versioning patterns. | برای CMS core با integration به Store Builder.
Directus | https://github.com/directus/directus | REFERENCE / ADOPT | Content/data admin با dynamic schema. | برای مقایسه schema-driven admin و permissions.
Strapi | https://github.com/strapi/strapi | REFERENCE | Headless CMS + content types + editorial workflows. | برای مقایسه معماری content layer.
WordPress Gutenberg | https://github.com/WordPress/gutenberg | REFERENCE | Block editor، block schema، editor experience و content composition. | منبع اصلی الگو برای UX editor؛ کد را مستقیماً وارد core نکن مگر با بررسی معماری.
TinaCMS | https://github.com/tinacms/tinacms | REFERENCE | Git/content editor و visual editing concepts. | برای editable content و preview pattern.

# 7. Visual Page Builder / Theme Builder

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Puck | https://github.com/puckeditor/puck | EMBED / ADOPT | React visual editor، custom components، fields و data ownership. | Candidate اصلی برای Editor داخلی؛ config را با components خودمان بساز.
Puck Skills | https://github.com/puckeditor/skills | SKILL | Skill برای agents جهت ادغام و debug کردن Puck. | به agent مربوط به builder اضافه شود؛ نمونه مستقیم از Agent Skills.
GrapesJS | https://github.com/GrapesJS/grapesjs | REFERENCE / EMBED | Block-based drag/drop editor و canvas model. | برای مقایسه editor architecture؛ نسبت به React-native page schema نیازمند adaptation است.
WordPress Gutenberg | https://github.com/WordPress/gutenberg | REFERENCE | Block editor، template parts، patterns، reusable blocks. | برای مدل Template/Pattern/Block و UX editing.
Builder.io Mitosis | https://github.com/BuilderIO/mitosis | REFERENCE | Portable component representation و compile به frameworkها. | برای فکرکردن درباره component portability و design system export؛ نه نیاز MVP.
Craft.js | https://github.com/prevwong/craft.js | REFERENCE | React drag/drop editor primitives. | برای بررسی editor state/serialization و component tree.

# 8. Design System و UI Foundations

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
shadcn/ui | https://github.com/shadcn-ui/ui | ADOPT | Composable accessible components و code ownership. | برای base component layer و UX consistency.
Radix Primitives | https://github.com/radix-ui/primitives | ADOPT | Accessible low-level primitives. | برای dialogs, popovers, menus, tabs و primitives بحرانی.
React Aria / React Spectrum | https://github.com/adobe/react-spectrum | REFERENCE / ADOPT | Accessibility-first behavior/hooks/components. | برای interactionهای پیچیده و a11y.
Material UI | https://github.com/mui/material-ui | REFERENCE | Enterprise UI patterns و component APIs. | برای reference؛ از دو design system متناقض همزمان پرهیز شود.
TanStack Table | https://github.com/TanStack/table | ADOPT | Headless data grid/table engine. | برای ERP grids با sorting, filtering, pagination, virtualization.
Storybook | https://github.com/storybookjs/storybook | ADOPT | Component development, docs, interaction/visual testing. | برای design system QA و isolated development.

# 9. Frontend، State و Data Fetching

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Next.js | https://github.com/vercel/next.js | CORE / ADOPT | App Router, SSR, RSC, caching, routing. | stack foundation.
Turborepo | https://github.com/vercel/turborepo | ADOPT | Monorepo build orchestration و caching. | برای packages/ui, commerce-core, cms, editor, apps.
TanStack Query | https://github.com/TanStack/query | ADOPT | Server-state fetching, caching, mutation/invalidation. | برای operational screens و client-side server state.
React Hook Form | https://github.com/react-hook-form/react-hook-form | ADOPT | Form state و performance. | برای merchant/editor/checkout forms.
Zod | https://github.com/colinhacks/zod | ADOPT | Schema validation + type inference. | برای command/query boundary و form validation.
T3 App | https://github.com/t3-oss/create-t3-app | REFERENCE | Full-stack type-safe architecture patterns. | برای مقایسه setup و type-safe boundaries؛ معماری نهایی ما مستقل باشد.

# 10. Multi-tenant، Organization، Domain و Branch

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Vercel Platforms | https://github.com/vercel/platforms | REFERENCE | Tenant routing، subdomain/custom domain، shared storefront/admin. | مرجع مهم برای tenant resolution و domain routing.
Cal.com | https://github.com/calcom/cal.com | REFERENCE | Organization/team/workspace concepts و multi-user operations. | برای organization membership, roles, teams.
Directus permissions | https://github.com/directus/directus | REFERENCE | Role/permission patterns. | برای RBAC/ABAC admin UX و policy boundaries.
PostgreSQL RLS | https://github.com/postgres/postgres | CORE / REFERENCE | Row-level security primitives. | برای defense-in-depth tenant isolation؛ application checks همچنان ضروری.

# 11. Auth، RBAC، ABAC و Identity

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Better Auth | https://github.com/better-auth/better-auth | ADOPT / REFERENCE | Modern TypeScript auth primitives. | برای auth layer؛ با IAM سازمانی و policy engine جدا ترکیب شود.
Auth.js | https://github.com/nextauthjs/next-auth | REFERENCE | Next.js authentication patterns. | برای provider/session reference.
WorkOS AuthKit | https://github.com/workos/authkit-nextjs | REFERENCE | Enterprise auth / organizations patterns. | برای B2B enterprise requirements reference.
Permit.io | https://github.com/permitio/permit | REFERENCE | Authorization model concepts. | برای مقایسه RBAC/ABAC/ReBAC؛ core policy را خودمان کنترل کنیم.

# 12. Database، ORM، Cache و Persistence

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
PostgreSQL | https://github.com/postgres/postgres | CORE | Transactional relational foundation. | canonical source of truth for commerce/finance.
Prisma | https://github.com/prisma/prisma | ADOPT | ORM, schema, migrations, typed client. | برای domain repositories و migrations.
Drizzle ORM | https://github.com/drizzle-team/drizzle-orm | REFERENCE / ADOPT | SQL-first typed ORM و migration patterns. | مناسب برای مقایسه با Prisma و انتخاب آگاهانه.
Redis | https://github.com/redis/redis | ADOPT | Cache, rate limiting, ephemeral state. | برای session/cache/locks where appropriate؛ نه canonical business data.
Neon | https://github.com/neondatabase/neon | REFERENCE | Serverless PostgreSQL platform. | برای infra/scaling ideas؛ core remains portable.

# 13. Search، Filtering و Discovery

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Meilisearch | https://github.com/meilisearch/meilisearch | ADOPT | Typo-tolerant search, facets, ranking. | برای catalog discovery و instant search.
Typesense | https://github.com/typesense/typesense | ADOPT / REFERENCE | Fast search + filters + typo tolerance. | گزینه جایگزین Meilisearch.
OpenSearch | https://github.com/opensearch-project/OpenSearch | REFERENCE / ADOPT | Scalable distributed search/analytics. | برای enterprise scale و complex analytics/search.
TanStack Virtual | https://github.com/TanStack/virtual | ADOPT | Virtualized lists/grids. | برای large catalog / ERP tables.

# 14. Pricing، Promotions، Tax و Money

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Medusa pricing | https://github.com/medusajs/medusa | REFERENCE | Price lists, variants, promotion primitives. | الهام برای rule evaluation؛ money kernel خود پروژه مستقل.
Saleor promotions | https://github.com/saleor/saleor | REFERENCE | Promotion/discount engine concepts. | برای rule composition و channel/currency interactions.
Dinero.js | https://github.com/dinerojs/dinero.js | REFERENCE / ADOPT | Money abstraction patterns. | برای الهام؛ در ledger/payment invariants باید با Decimal/currency model داخلی align شود.
currency.js | https://github.com/scurker/currency.js | REFERENCE | Currency arithmetic API. | برای UI/calculation edge patterns؛ برای ledger core کافی نیست.

# 15. Cart، Checkout، Order و Fulfillment

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Medusa | https://github.com/medusajs/medusa | CORE / REFERENCE | Cart/order/fulfillment workflow. | برای domain flow comparison.
Saleor | https://github.com/saleor/saleor | REFERENCE | Checkout, payments, shipping concepts. | برای API contracts و edge cases.
Vendure | https://github.com/vendure-ecommerce/vendure | REFERENCE | Order state machine/plugin patterns. | برای state/event-driven workflows.

# 16. Payments و Financial Integrations

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Stripe Node | https://github.com/stripe/stripe-node | ADOPT | Typed Stripe API client. | برای adapter layer؛ key/secret isolation و idempotency ضروری.
Stripe Samples | https://github.com/stripe-samples | TEST / REFERENCE | End-to-end payment patterns. | برای webhook, PaymentIntent, SCA, refund scenarios.
Adyen Node API Library | https://github.com/Adyen/adyen-node-api-library | ADOPT / REFERENCE | Enterprise payment integration patterns. | برای multi-provider payment abstraction.
PayPal Checkout SDK | https://github.com/paypal/Checkout-NodeJS-SDK | REFERENCE | Alternative provider integration patterns. | برای provider-agnostic architecture.

# 17. Inventory، Reservation و Concurrency

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Medusa inventory | https://github.com/medusajs/medusa | REFERENCE | Inventory modules and reservation concepts. | برای model comparison.
Vendure | https://github.com/vendure-ecommerce/vendure | REFERENCE | Stock/order transactional behavior. | برای edge cases.
PostgreSQL | https://github.com/postgres/postgres | CORE | Transactions, locks, constraints. | source of truth for atomic inventory operations.
Redis | https://github.com/redis/redis | ADOPT | Short-lived reservation/cache primitives. | برای ephemeral coordination only; DB remains canonical.

# 18. Workflow، Queue، Jobs و Saga

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Temporal | https://github.com/temporalio/temporal | ADOPT / REFERENCE | Durable workflows, retries, compensation. | برای payment/order/fulfillment long-running workflows.
Temporal TypeScript SDK | https://github.com/temporalio/sdk-typescript | ADOPT | TypeScript workflow/activity SDK. | برای worker layer.
BullMQ | https://github.com/taskforcesh/bullmq | ADOPT | Redis-backed queues, delayed jobs. | برای straightforward background jobs.
Trigger.dev | https://github.com/triggerdotdev/trigger.dev | REFERENCE / ADOPT | Developer-friendly background tasks. | برای notifications, reports, async integrations.
Outbox pattern | https://github.com/oskardudycz/EventStormingWorkshop | REFERENCE | Event modeling and outbox/domain event concepts. | برای طراحی events؛ implementation داخلی.

# 19. File Storage، Media و Assets

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
MinIO | https://github.com/minio/minio | ADOPT / REFERENCE | S3-compatible object storage. | برای local/private object storage architecture.
UploadThing | https://github.com/pingdotgg/uploadthing | ADOPT / REFERENCE | Type-safe file uploads for Next.js. | برای merchant media flows if مناسب operationally.
Cloudinary JS/SDK patterns | https://github.com/cloudinary | REFERENCE | Image transformations/media delivery. | برای media pipeline design؛ vendor-specific code isolate شود.
Next.js image | https://github.com/vercel/next.js | CORE | Image optimization and remote media handling. | برای storefront delivery.

# 20. Notifications، Email و Messaging

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
React Email | https://github.com/resend/react-email | ADOPT | React-based email templates. | برای transactional email system.
Resend Node | https://github.com/resend/resend-node | ADOPT | Email API client. | adapter-based notification service.
Novu | https://github.com/novuhq/novu | REFERENCE / ADOPT | Multi-channel notification infrastructure. | برای comparing notification orchestration and templates.

# 21. Analytics، Product Insights و Experimentation

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
PostHog | https://github.com/PostHog/posthog | ADOPT / REFERENCE | Product analytics, feature flags, experimentation. | برای product telemetry و growth loops.
GrowthBook | https://github.com/growthbook/growthbook | REFERENCE / ADOPT | Experimentation and feature flags. | برای controlled rollout/A-B tests.
Unleash | https://github.com/Unleash/unleash | ADOPT / REFERENCE | Feature flag platform. | برای gradual rollout؛ business metrics همچنان جدا.

# 22. SEO، Performance و Web Delivery

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Next.js | https://github.com/vercel/next.js | CORE / ADOPT | SSR/SSG, metadata, caching, streaming. | پایه storefront performance.
Vercel Platforms | https://github.com/vercel/platforms | REFERENCE | Tenant-aware routing and deployment patterns. | برای custom domains / subdomains.
Lighthouse CI | https://github.com/GoogleChrome/lighthouse-ci | TEST | Automated web performance auditing. | برای CI performance budget.
Partytown | https://github.com/QwikDev/partytown | REFERENCE | Third-party script offloading. | برای analytics/ad scripts when necessary.

# 23. i18n، RTL و Localization

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
next-intl | https://github.com/amannn/next-intl | ADOPT | Next.js internationalization. | برای fa/en/ar/... routing and messages.
FormatJS | https://github.com/formatjs/formatjs | REFERENCE / ADOPT | Intl/message formatting ecosystem. | برای locale-aware number/date/currency.
React Spectrum | https://github.com/adobe/react-spectrum | REFERENCE | Internationalized accessible interactions. | برای a11y + RTL behavior.

# 24. Accessibility و Inclusive UX

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Radix Primitives | https://github.com/radix-ui/primitives | ADOPT | Accessible primitives. | baseline for dialogs/menus/forms.
React Aria | https://github.com/adobe/react-spectrum | ADOPT / REFERENCE | ARIA interactions and accessibility behavior. | complex widgets.
axe-core | https://github.com/dequelabs/axe-core | TEST / ADOPT | Automated accessibility testing. | CI smoke for critical screens.
Pa11y | https://github.com/pa11y/pa11y | TEST | Accessibility scanning. | secondary audit tool.

# 25. Security، AppSec و Supply Chain

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
OWASP ASVS | https://github.com/OWASP/ASVS | TEST / REFERENCE | Application Security Verification Standard. | security acceptance checklist.
OWASP Cheat Sheet Series | https://github.com/OWASP/CheatSheetSeries | REFERENCE | Implementation guidance for auth, sessions, CSRF, etc. | security playbook.
OWASP Juice Shop | https://github.com/OWASP/juice-shop | TEST | Intentionally vulnerable ecommerce app. | training / attack-scenario modeling.
Semgrep | https://github.com/semgrep/semgrep | ADOPT | Static analysis and custom rules. | CI security/code quality.
Gitleaks | https://github.com/gitleaks/gitleaks | ADOPT | Secret scanning. | CI/pre-commit.
Trivy | https://github.com/aquasecurity/trivy | ADOPT | Container/dependency/IaC scanning. | CI supply-chain gate.
Socket CLI | https://github.com/SocketDev/socket-cli | REFERENCE / ADOPT | Dependency supply-chain checks. | additional dependency governance.

# 26. Testing، E2E و Visual Regression

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Playwright | https://github.com/microsoft/playwright | ADOPT | Cross-browser E2E and UI automation. | golden customer journeys.
Vitest | https://github.com/vitest-dev/vitest | ADOPT | Fast unit/integration testing. | domain and application tests.
Testing Library | https://github.com/testing-library/react-testing-library | ADOPT | User-focused component tests. | avoid implementation-detail tests.
MSW | https://github.com/mswjs/msw | ADOPT | API mocking at network layer. | integration and UI test isolation.
Storybook | https://github.com/storybookjs/storybook | ADOPT | Component isolation and visual/interaction checks. | design-system regression.
axe-core | https://github.com/dequelabs/axe-core | TEST | Automated a11y assertions. | CI accessibility gate.
k6 | https://github.com/grafana/k6 | TEST | Load and performance testing. | critical API/search/checkout load scenarios.

# 27. Observability، SLO و Incident Management

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
OpenTelemetry JS | https://github.com/open-telemetry/opentelemetry-js | ADOPT | Traces, metrics, context propagation. | instrument core workflows and external calls.
Sentry JavaScript | https://github.com/getsentry/sentry-javascript | ADOPT | Error monitoring, performance telemetry. | frontend/server error visibility.
Prometheus | https://github.com/prometheus/prometheus | ADOPT / REFERENCE | Metrics scraping/storage. | service/system metrics.
Grafana | https://github.com/grafana/grafana | ADOPT / REFERENCE | Dashboards and operational visibility. | ERP operational and engineering dashboards.
Loki | https://github.com/grafana/loki | REFERENCE | Log aggregation. | operational search.

# 28. CI/CD، Infrastructure و Release Engineering

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
GitHub Actions | https://github.com/actions/runner | ADOPT / REFERENCE | CI execution model. | lint/test/build/security/release gates.
Docker Compose | https://github.com/docker/compose | ADOPT | Local multi-service environment. | Postgres/Redis/Search/worker stack.
Terraform | https://github.com/hashicorp/terraform | ADOPT / REFERENCE | Infrastructure as code. | when infra becomes multi-environment.
OpenTofu | https://github.com/opentofu/opentofu | REFERENCE / ADOPT | Open IaC alternative. | evaluate against Terraform.
Renovate | https://github.com/renovatebot/renovate | ADOPT | Dependency update automation. | supply-chain hygiene.

# 29. Documentation، Developer Portal و Knowledge

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Fumadocs | https://github.com/fuma-nama/fumadocs | ADOPT / REFERENCE | Next.js-first documentation platform. | developer docs and internal platform docs.
Docusaurus | https://github.com/facebook/docusaurus | REFERENCE | Documentation site patterns. | public developer docs if needed.
Mintlify | https://github.com/mintlify/starter | REFERENCE | Docs UX and information architecture. | docs inspiration.

# 30. AI، Agent Skills و Coding Workflow

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Anthropic Skills | https://github.com/anthropics/skills | SKILL / REFERENCE | Official example Agent Skills specification/implementation. | برای ساخت skillهای اختصاصی Commerce OS و document/test workflows.
Superpowers | https://github.com/obra/superpowers | SKILL / REFERENCE | Planning, TDD, debugging, code-review and agent workflow skills. | برای enforce کردن process روی coding agents.
Puck Skills | https://github.com/puckeditor/skills | SKILL | Skill مخصوص Puck integration. | به agent مسئول page builder اضافه شود.
Continue | https://github.com/continuedev/continue | SKILL / REFERENCE | Rules for Agent/Chat/Edit modes. | برای project-specific coding rules and context.
Awesome Copilot | https://github.com/github/awesome-copilot | SKILL / REFERENCE | Agent instruction/prompt examples and customizations. | برای cross-agent instruction patterns.
Model Context Protocol | https://github.com/modelcontextprotocol/servers | REFERENCE | MCP server ecosystem. | برای اتصال agent به DB/docs/issue trackers/services.
Vercel AI SDK | https://github.com/vercel/ai | ADOPT / REFERENCE | AI UI/server abstractions. | برای AI-assisted search, merchant copilot, content generation; not for transactional authority.
OpenAI Node | https://github.com/openai/openai-node | ADOPT / REFERENCE | Official JS SDK. | برای AI adapters; approval boundaries mandatory.
LangChain JS | https://github.com/langchain-ai/langchainjs | REFERENCE | Agent/RAG/tool orchestration patterns. | فقط وقتی orchestration complexity توجیه داشته باشد.

# 31. Graph / Event / Integration Patterns

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
KafkaJS | https://github.com/tulios/kafkajs | REFERENCE / ADOPT | Event streaming patterns. | برای scale events when outbox + queue become insufficient.
NATS | https://github.com/nats-io/nats-server | REFERENCE | Messaging/event transport. | برای future service decomposition؛ early adoption unnecessary.
GraphQL | https://github.com/graphql/graphql-js | REFERENCE | GraphQL execution/types. | اگر storefront/admin API strategy به GraphQL نیاز داشت.
tRPC | https://github.com/trpc/trpc | REFERENCE | End-to-end typed RPC. | برای internal application APIs; public contracts should remain explicit.

# 32. Commerce Admin / ERP UX References

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Saleor Dashboard | https://github.com/saleor/saleor-dashboard | REFERENCE | Commerce admin IA and operational screens. | for product/order/customer admin UX.
Medusa Admin | https://github.com/medusajs/medusa | REFERENCE | Commerce admin extension model. | for dashboard module patterns.
Vendure Admin UI | https://github.com/vendure-ecommerce/vendure | REFERENCE | Admin UI plugin architecture. | for ERP extension points.
Directus App | https://github.com/directus/directus | REFERENCE | Data-heavy admin UX, permissions, filters. | for ERP grid/forms patterns.

# 33. Clone / Fork / Template / Inheritance

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Vercel Platforms | https://github.com/vercel/platforms | REFERENCE | Tenant provisioning and branded tenant storefront patterns. | use for tenant lifecycle and domain routing ideas.
WordPress Gutenberg | https://github.com/WordPress/gutenberg | REFERENCE | Reusable patterns/templates and content inheritance concepts. | inform block/template reuse UX.
Git itself | https://github.com/git/git | REFERENCE | Object database, branches, snapshots, merges. | conceptual reference for immutable revisions and diffs; not to store business entities.
JSON Patch | https://github.com/Starcounter-Jack/JSON-Patch | ADOPT / REFERENCE | Patch operations for structured overrides. | candidate for theme/template overrides if schema is designed carefully.
Immer | https://github.com/immerjs/immer | ADOPT | Immutable state update patterns. | for editor state transforms; not persistence model.

# 34. Monetization، Subscription و SaaS Billing

مرجع | لینک | نوع | برای چه کاری؟ | قاعده استفاده در پروژه
| --- | --- | --- | --- | --- |
Stripe Billing samples | https://github.com/stripe-samples | REFERENCE | Subscription, invoice, payment patterns. | for merchant SaaS plans and platform fees.
Lago | https://github.com/getlago/lago | REFERENCE / ADOPT | Open-source metering/billing engine. | if platform needs complex usage billing.
Kill Bill | https://github.com/killbill/killbill | REFERENCE | Subscription/billing domain. | enterprise billing reference; likely overkill for MVP.

# 35. Skill Pack پیشنهادی برای ایجنت‌های این پروژه

Skill / Pack | مرجع | برای چه ایجنتی؟ | اولویت | نقش
| --- | --- | --- | --- | --- |
commerce-architecture | custom internal skill | Principal Architect | P0 | Domain boundaries, ADR, source-of-truth discipline
commerce-domain-modeling | custom internal skill | Backend/DB | P0 | Product, price, inventory, cart, order, payment, refund states
multi-tenant-isolation | custom internal skill | Platform/Security | P0 | Tenant resolution, RLS, policy, cross-tenant tests
store-builder | custom + Puck skill | Frontend/Editor | P0 | Block schema, editor UX, preview/publish, serialization
clone-fork-inheritance | custom internal skill | Platform/Editor | P0 | Template → Fork → Override → Sync → Detach
erp-ux | custom internal skill | ERP Frontend | P1 | Operational grids, queues, exceptions, approvals
commerce-qa | custom internal skill + Playwright | QA | P0 | Golden journeys, edge cases, visual, a11y
security-appsec | custom internal skill + OWASP/Semgrep | Security | P0 | Threat model, abuse cases, security gates
agent-workflow | Superpowers | All coding agents | P1 | Planning/TDD/debugging/review workflow
document-skills | Anthropic Skills | Docs/PMO agents | P1 | Structured document workflows
puck | Puck Skills | Page Builder agent | P0 | Puck integration and debugging
continue-rules | Continue rules | Coding agents | P1 | Project-specific rules by glob/domain
mcp-integration | MCP Servers | Integration/Research agent | P2 | Tool-connected agent workflows

# 36. پروتکل استفاده توسط AI Agentها

- مرحله 1 — Identify: عامل ابتدا domain و acceptance criteria را مشخص کند.

- مرحله 2 — Compare: حداقل دو reference را برای بخش‌های P0 مقایسه کند.
- مرحله 3 — Extract: فقط pattern/contract/edge case موردنیاز را استخراج کند.
- مرحله 4 — Adapt: pattern را با architecture و naming پروژه تطبیق دهد.
- مرحله 5 — Implement: کد داخلی را در boundary مناسب بنویسد؛ dependency خارجی را فقط در صورت نیاز اضافه کند.
- مرحله 6 — Verify: unit + integration + E2E + a11y + security + runtime verification.
- مرحله 7 — Document: منبع، license و دلیل انتخاب را در ADR یا Reference Ledger ثبت کند.
- مرحله 8 — Remove dead references: dependency یا reference بلااستفاده نباید باقی بماند.
# 37. Reference Ledger داخلی پروژه

Field | نمونه مقدار
| --- | --- |
reference_id | REF-EDITOR-001
domain | Page Builder
source | puckeditor/puck
url | https://github.com/puckeditor/puck
purpose | Visual editor state + component config
mode | EMBED
version_reviewed | record exact commit/tag used
license | record from source
adopted_parts | config model / drag-drop primitives
not_adopted | persistence model / business logic
owner | Frontend Platform
last_reviewed | YYYY-MM-DD
exit_strategy | replace editor adapter without changing page schema

# 38. Reference Stack پیشنهادی برای نسخه اول

- Commerce core: معماری داخلی با الهام از Medusa + Saleor + Vendure؛ هسته business logic مستقل.

- CMS: Payload یا CMS داخلی TypeScript-first؛ content schema جدا از commerce entities.
- Page Builder: Puck as editor surface + schema/rendering داخلی + block registry داخلی.
- Design System: shadcn/ui + Radix/React Aria؛ یک design token source of truth.
- Frontend: Next.js + TypeScript + Turborepo + TanStack Query در لایه‌های لازم.
- Data: PostgreSQL + Prisma؛ Redis فقط برای cache/locks/ephemeral state.
- Search: Meilisearch/Typesense در شروع؛ OpenSearch only when scale/analytics justifies it.
- Async: BullMQ برای jobs ساده؛ Temporal برای workflowهای durable و compensating.
- Testing: Vitest + Testing Library + Playwright + MSW + axe-core + k6.
- Security: OWASP ASVS + Semgrep + Gitleaks + Trivy.
- Observability: OpenTelemetry + Sentry + Prometheus/Grafana حسب نیاز deployment.
- Agent layer: custom project skills + Superpowers + Anthropic Skills + Puck Skills + Continue rules.
# 39. چیزهایی که نباید از Repositoryها کپی کنیم

- منطق money/ledger/accounting بدون بازطراحی و invariant test.

- Tenant isolation فقط بر اساس route/subdomain؛ باید policy + DB constraints/RLS + tests داشته باشد.
- Auth/session model بدون threat modeling و بررسی session fixation/CSRF/token lifecycle.
- Order/payment state machine فقط از UI یا enumهای repository مرجع.
- Editor JSON schema بدون versioning/migration strategy.
- Clone به‌صورت deep copy ساده؛ به‌جایش source/template + fork + overrides + lineage.
- وابستگی به admin UI یک CMS به‌عنوان ERP کامل.
- کد نمونه قدیمی، archived، یا دارای license ناسازگار با مدل کسب‌وکار.
- هر چیزی که فقط برای demo/test است را به production مسیر ندهید.
# 40. نتیجه نهایی

اصل کلیدی: پروژه باید یک Reference-driven Platform باشد، نه یک Patchwork از Repositoryها. بهترین خروجی زمانی ایجاد می‌شود که Commerce Core، Tenant Model، ERP، CMS، Builder و Clone/Fork Engine توسط تیم خود پروژه مالکیت و contract مشخص داشته باشند و Repositoryهای خارجی فقط در لایه‌هایی که واقعاً مزیت می‌دهند به‌کار گرفته شوند.

منابع تحقیق‌شده در این سند شامل صفحات GitHub و مستندات رسمی پروژه‌های ذکرشده است. وضعیت repositoryها و licenseها متغیر است؛ پیش از adoption در هر release، بررسی مجدد الزامی است.

