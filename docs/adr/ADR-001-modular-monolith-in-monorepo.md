# ADR-001: Modular Monolith in a Monorepo

## Status

Accepted — 2026-09-26 (Wave 0 baseline)

## Context

The product spans many domains: identity/tenancy, catalog, pricing, promotions,
inventory, cart/checkout, orders, fulfillment/returns, payments, tax/finance,
CMS, page builder, theming, clone/fork, ERP, search, analytics, and an extension
platform. The master roadmap (§4, §26) identifies two failure modes:

- Microservices from day one → latency and operational complexity before the
  transaction kernel is even correct.
- A single unstructured app → boundary rot, where business logic leaks into UI
  components and route handlers, which the non-negotiable principles forbid.

## Decision

1. Build a **modular monolith**: one application core organized into domain
   modules with enforced internal boundaries
   (Identity/Tenancy, Catalog/Pricing/Promotions, Cart/Checkout/Orders,
   Inventory/Fulfillment/Returns, Payments/Tax/Finance, CMS/Builder/Themes,
   CRM/Support/Notifications, Analytics/Search/Integrations).
2. Host it in a **monorepo** (npm workspaces + Turborepo) with package
   boundaries from day one: `packages/domain`, `packages/application`,
   `packages/infrastructure`, `packages/commerce`, `packages/finance`,
   `packages/auth`, `packages/builder`, `packages/theme`, `packages/ui`,
   `packages/i18n`, `packages/testing`, `packages/config`.
3. Split runtime processes **only where justified**: the Next.js app
   (storefront + admin, initially one app with route groups), and a worker for
   async jobs (queues, indexing, notifications). A separate `api` app is added
   only if/when BFF contracts need to leave the Next.js runtime.
4. One canonical PostgreSQL database. Cross-module async integration goes
   through a transactional outbox → workers.

## Consequences

- Transactions, tracing, and refactors stay simple; module seams are preserved
  by the dependency rules (`docs/architecture/dependency-rules.md`) and enforced
  by lint + code review, not by network borders.
- Extracting a module into a service later must remain mechanical: modules may
  not reach into each other's tables or repositories — they communicate through
  application commands/queries and domain events.
- Discipline cost is real: boundary violations must block merge, not be
  waved through.

## Alternatives considered

- **Microservices from day 0** — rejected: consistency and traceability of the
  transaction kernel matter more now than independent scaling.
- **One unstructured Next.js app** — rejected: the roadmap's core differentiators
  (multi-tenancy, clone/fork, ERP) are impossible to keep correct without
  explicit domain boundaries.

## Revisit triggers

Sustained team growth on one module, or an isolation requirement (e.g., payment
workloads) that a separate worker process cannot satisfy.
