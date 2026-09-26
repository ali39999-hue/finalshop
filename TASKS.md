# Execution Tasks — First 50 (Appendix A of the master roadmap)

Checked items are complete as Wave 0 baseline drafts; everything else is open.
Task IDs are canonical — use them in branch names, commits, and PRs.
Wave mapping follows roadmap §23–24.

## W0 — Baseline

- [x] ARC-001: record modular-monolith ADR → [ADR-001](docs/adr/ADR-001-modular-monolith-in-monorepo.md)
- [x] ARC-002: domain map → [domain-map.md](docs/architecture/domain-map.md)
- [x] ARC-003: dependency rules → [dependency-rules.md](docs/architecture/dependency-rules.md)
- [x] ARC-004: threat model (initial) → [threat-model.md](docs/security/threat-model.md)

## W1 — Multi-tenant platform core

- [x] TEN-001: Organization/Tenant model → tenancy types + `createOrganization` + Prisma `Organization`
- [x] TEN-002: Store/Storefront/Branch → schema + `createStore`/`createBranch` commands
- [x] TEN-003: Domain mapping (Host → Domain → Storefront → Store → Tenant) → pure resolver in `packages/domain`, `resolveByHost` query, joined Prisma lookup
- [x] IAM-001: Membership/Roles → `Membership` model + assignment rules (`canGrantRole`)
- [x] IAM-002: Permission matrix → `packages/auth` (`ROLE_PERMISSIONS`, `can`)
- [x] IAM-003: tenant context guard → `assertTenantContext`/`requireSameTenant` + cross-tenant rejection tests
- [x] IAM-004: audit events → `buildAuditEvent` + `AuditRepository`; every command writes one
- [x] IAM-005: RLS strategy → [rls-strategy.md](docs/architecture/rls-strategy.md) + `prisma/rls/001-tenant-rls.sql` + `runInTenantTransaction`

Open within W1 (kernel done, productization pending): auth provider integration
(sessions for the tenant context), DNS-token domain verification flow, ESLint
boundary enforcement of the dependency rules, first admin screens.

## W2 — Commerce kernel

- [x] CAT-001: Product/Variant schema → `packages/domain/catalog` invariants + Prisma `Product`/`ProductVariant` + `createProduct`/`addVariant`
- [x] CAT-002: Collection/Category → hierarchical categories with depth limit + manual collections with membership
- [x] CAT-003: Asset pipeline → MIME/size policy (SVG excluded, T-05), org-scoped storage keys, `registerAsset`
- [x] CAT-004: Catalog revisions → append-only `ProductRevision` snapshots on every content update

Open within W2 (kernel done): Customer and Channel models (roadmap W2 row),
file/CSV transport for import/export, bulk edit and import/export UI.

## W3 — Pricing & Inventory

- [x] PRICE-001: money kernel (decimal, currency-aware; no floats) → `packages/domain/money` — BigInt minor units, HALF_UP rounding, largest-remainder allocation, ISO-4217 registry
- [x] PRICE-002: price lists → `createPriceList`/`setPrice` (quantity tiers) + deterministic `resolveUnitPrice` + `quotePrice` query with full breakdown
- [x] PRICE-003: promotion engine → percentage (bps) / fixed, priority-ordered stacking, exclusive chains, zero-clamp
- [x] INV-001: InventoryItem → per-variant stock rows with onHand/reserved invariants
- [x] INV-002: reservation model (TTL, expiry release) → ACTIVE/COMMITTED/RELEASED/EXPIRED lifecycle + `releaseExpiredReservations` worker command
- [x] INV-003: atomic reservation (concurrency-tested) → single conditional UPDATE in `reserveAtomic` + integration test with two parallel reservations on one unit

Open within W3 (kernel done): customer-group/channel price scoping, promotion
scheduling windows and coupon codes, worker scheduler wiring for expiry sweeps.

## W4 — Checkout & Orders

- [x] CART-001: cart aggregate → `packages/domain/cart` (line merge, caps, TTL) + `Cart`/`CartItem` models + customer-facing commands
- [x] CART-002: quote snapshot (price lock at checkout boundary) → `priceCheckout` freezes the full breakdown on the checkout
- [x] CHK-001: checkout state machine → explicit 13-state transition table independent of UI steps
- [x] CHK-002: idempotency keys on sensitive POSTs → `placeOrder` replays completed requests, rejects key reuse with a different payload, flags in-flight duplicates
- [x] ORD-001: order aggregate → immutable line snapshots, server-recomputed totals, `SO-00000001` org-scoped sequences
- [x] ORD-002: order transitions (explicit, audited) → PENDING_PAYMENT → CONFIRMED/CANCELLED; W6 adds fulfilment states
- [x] QA-001: golden customer journey → kernel-level E2E: browse-ready catalog → cart → priced checkout → address → order → payment → stock commit

Open within W4 (kernel done): browser-level E2E (needs the storefront UI),
cart/checkout expiry sweeps in the worker, guest checkout with email capture.

## W5 — Payment & Finance

- [x] PAY-001: PaymentProvider contract (provider-agnostic) → intent/attempt aggregates with explicit state machines; providers appear only as providerId/providerRef
- [x] PAY-002: signed webhook inbox (replay-safe, idempotent) → HMAC-SHA256 + timestamp tolerance (domain, timing-safe) + per-event dedupe inbox + dispatch (capture/fail)
- [x] PAY-003: refund flow → REQUESTED → APPROVED → EXECUTED with the money-trace invariant (refunds ≤ captured) enforced per intent
- [x] FIN-001: ledger model (balanced journal invariant) → double-entry Journal/JournalLine, Σ debits = Σ credits, canonical capture/refund postings, exactly-once per intent
- [x] FIN-002: reconciliation → provider settlements (net = gross − fee) matched against ledger cash movement per period

Open within W5 (kernel done): Stripe adapter implementing the provider
contract, tax-inclusive checkout pricing, partial captures, settlement
period automation.

## W6 — Fulfillment & Returns (addendum: not in Appendix A, roadmap §24)

- [x] FUL-001: shipping rates → FLAT/PICKUP rules with weight/country filters, deterministic cheapest-first resolver
- [x] FUL-002: shipments & tracking → partial fulfillments against outstanding order lines, tracking event log, pickup path (READY_FOR_PICKUP)
- [x] FUL-003: order fulfilment stages → FULFILLING / PARTIALLY_FULFILLED / COMPLETED driven by delivered quantities
- [x] FUL-004: returns/RMA → REQUESTED → APPROVED → RECEIVED → COMPLETED with restock and mandatory EXECUTED-refund linkage (PAY-003)

## W7 — CMS

- [x] CMS-001: page/revision model (JSON schema AST) → `packages/domain/cms` AST validation (unique ids, depth cap) + immutable `PageRevision` snapshots
- [x] CMS-002: asset/media handling → AST `props.assetId` references validated against the org's asset registry at save time
- [x] CMS-003: draft/preview → every save writes a new revision; `getPage` serves published / latest / explicit revision pointers
- [x] CMS-004: scheduled publishing → SCHEDULED status + `publishScheduledPages` worker sweep (system actor, audited)

## W8 — Builder & Theme

- [x] BLD-001: block registry → built-in set (layout/content/commerce/growth/extension) + org-registered custom definitions
- [x] BLD-002: section registry → section-capable definitions (`isSection`) within the same registry
- [x] BLD-003: schema validator → typed prop fields (string/number/enum/asset/collection/product/color) + AST diagnostics (`UNKNOWN_BLOCK`, `PROP_REQUIRED_MISSING`, `PROP_TYPE_INVALID`, `CHILD_NOT_ALLOWED`)
- [ ] BLD-004: canvas → editor UI; ships with the admin app slice (the AST data contract it renders exists since W7)
- [x] BLD-005: inspector → field descriptors (name/type/required/label) served per block type via `getInspectorFields`
- [x] THEME-001: design tokens → required semantic colors, hex validation, WCAG AA contrast guard between text/background
- [x] THEME-002: template registry → page/section/pattern templates as ASTs, validated against the block registry

## W9 — Clone / Fork

- [x] CLONE-001: clone profiles (what may be copied — never orders/payments/customers/secrets) → `CLONE_PROFILES` + `FORBIDDEN_KINDS` structural guard
- [x] CLONE-002: dependency graph + topological copy → pure Kahn sort with cycle detection; edges outside the cloned set become manifest warnings
- [x] CLONE-003: ID remap through manifest → frozen `CloneManifest` (entries + warnings), persisted per clone run for audit/rollback
- [x] FORK-001: override model (inherited/overridden/detached per field) → ForkLink records + `applyOverride` with per-entity-type permissions
- [x] FORK-002: sync/diff with conflict review → `planSync` (updates/conflicts/skipped); overridden fields surface as conflicts, detached links sync as no-ops

## W11 — Search & SEO (addendum: roadmap §15, kernel slice)

- [x] SRCH-001: transactional outbox → `OutboxEvent` + worker sweep (`processOutbox`) with retry/attempts; the only bridge into derived state
- [x] SRCH-002: derived search index → `SearchDocument` upsert/remove driven by outbox events; DB-backed kernel index with a documented Meilisearch adapter swap (Atlas §13)
- [x] SRCH-003: storefront search → deterministic scoring (title 3× body 1×), kind/facet filters, public customer query
- [x] SEO-001: sitemap + canonical → `buildStoreSitemap` (published pages + active products, XML-escaped) and locale-aware `canonicalUrl`
- [x] SEO-002: schema.org JSON-LD → `getProductJsonLd` with decimal major-unit offers derived from the money kernel

## W13 — Extensions (kernel slice)

- [x] EXT-001: capability-based plugin manifests → `validatePluginManifest` (capabilities/events/slots/routes whitelists, semver, T-09 no-DB-access by construction) + install/enable/disable/uninstall lifecycle with audits
- [x] EXT-002: outbound webhooks → HTTPS-only, private-host-blocked endpoints (T-04); signed deliveries (HMAC, timing-safe) created from outbox events via `dispatchOutboundWebhooks`; HTTP POST itself is the delivery worker's job
- [ ] EXT-003: marketplace foundations (listing, reviews, revenue share) — post-kernel

## W12 — Analytics (kernel slice)

- [x] ANL-001: versioned event model → `name@version` scheme, property size caps, PII deny-list blocking at ingest
- [x] ANL-002: funnels → session-ordered step progression computed purely in the domain; report query gated by `analytics.read`
- [x] ANL-003: storefront event collection → product.viewed / cart.updated / checkout.started / order.placed fired from real flows; admin funnel dashboard renders conversion

## W14 — Hardening (kernel slice)

- [x] HRD-001: rate limiting → tenant+route fixed-window counters with atomic upsert-increment; verdict via pure domain math; edge-middleware helper

## W15 — Storefront slice (addendum: first real app)

- [x] WEB-001: demo storefront (`apps/web`, Next.js App Router) — home catalog, product page, cart, priced checkout, order confirmation with demo payment simulation
- [x] WEB-002: customer-safe catalog queries (`listPublicProducts`, `getPublicProductBySlug`) — ACTIVE products only, no staff permissions
- [x] WEB-003: visitor cookie + cart ownership; kernel Prisma singleton
- [x] WEB-004: infra adapters — `StripePaymentProvider` (PAY-001 contract, injected HTTP client, offline-tested) and `MeilisearchSearchIndex` (same `SearchIndexRepository` port)
- [x] W10 slice: `listOperationsExceptions` — stale payments, unfulfilled orders, out-of-stock, pending refunds/returns in one feed
- [x] W12 slice: `computeWeeklyRetention` cohort retention (domain) + funnel report query

## W12+ — Remaining roadmap waves (kernel slices pending)

- [ ] W10: ERP operations (workspaces, data grid, exceptions) — UI-heavy; kernel contracts land with the admin app
- [ ] W12 remaining: dashboards, cohorts UI, exports
- [ ] W13 remaining: marketplace foundations (EXT-003)
- [ ] W14 remaining: CSP, load profiles, SLO dashboards
- [ ] W15: Launch (runbooks, SLOs) — the baseline migrations now ship
      (`20260926110903_init` + follow-ups, see
      `packages/infrastructure/prisma/migrations/README.md`)

## Definition of Done (every task)

Code + migration + domain rules + API/UI + tests + telemetry + docs + runtime
verification. "It compiles" or "it renders" is not done.
