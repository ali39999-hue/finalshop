# Tenant Isolation & RLS Strategy

Wave 1 deliverable (IAM-005). Implements roadmap §5 and mitigates threat T-01
(cross-tenant access) from [docs/security/threat-model.md](../security/threat-model.md).

## Two layers, both mandatory

| Layer | Mechanism | Where |
| --- | --- | --- |
| 1 — Primary | Tenant context guard + tenant-scoped repositories: every query carries `orgId` derived from the authenticated context, never from client input | `packages/domain` (`assertTenantContext`, `requireSameTenant`), `packages/application` (commands), `packages/infrastructure` (scoped repos) |
| 2 — Defense-in-depth | PostgreSQL Row-Level Security, default-deny, keyed on a transaction-local GUC | `packages/infrastructure/prisma/rls/001-tenant-rls.sql`, `runInTenantTransaction` |

Layer 2 exists because layer 1 is one forgotten `WHERE` away from a breach.
With RLS, that mistake returns zero rows instead of another tenant's data.

## How the RLS layer works

1. Every tenant-scoped table carries a denormalized `orgId` (schema convention).
2. `runInTenantTransaction(db, orgId, fn)` opens a transaction and calls
   `set_config('app.tenant_id', $orgId, is_local => true)` — the setting lives
   and dies with the transaction, so pooled connections cannot leak it.
3. Policies apply to `Store`, `Storefront`, `Branch`, `Domain`, `Membership`,
   and `AuditEvent`:
   `USING ("orgId" = current_setting('app.tenant_id', true))`.
   When the GUC is unset, `current_setting(..., true)` yields NULL and **no
   rows match** — default deny.
4. `Organization` and `User` are platform-scoped tables and stay outside RLS;
   access to them is controlled by the application layer and reserved roles.

## Roles and connections

- **Migration/owner role** (e.g. the `finalshop` compose user): owns tables,
  bypasses RLS, used only for migrations and the RLS bootstrap script.
- **Runtime role `finalshop_app`** (NOLOGIN; granted per-environment credentials):
  least-privilege DML, subject to RLS. The application must connect with this
  role — running as owner silently disables layer 2.
- **Platform operations** (cross-tenant search, support tooling): separate
  explicit role + audited commands; never the tenant runtime path.

## Rollout & verification

- Apply order: `prisma migrate deploy` → `rls/001-tenant-rls.sql` …
  `013-analytics-hardening-rls.sql` (idempotent).
- The integration test (`prisma-repositories.integration.test.ts`) verifies the
  tenant transaction mechanism; because it runs with owner credentials it
  cannot exercise RLS itself.
- **Required test gate (before W2 closes):** an integration suite connecting
  as `finalshop_app` asserting that (a) a tenant reads only its rows, (b)
  writes with a foreign `orgId` fail the `WITH CHECK` clause, and (c) unset
  GUC returns no rows. This is part of the cross-tenant test suite (T-01).
- Pooled/serverless deployments must run in transaction-mode pooling so the
  GUC remains transaction-scoped.

## Change log

- 2026-09-26 — initial strategy + policies for W1 tables.
- 2026-09-26 — W2: `002-catalog-rls.sql` covers Product, ProductVariant,
  Category, Collection, CollectionProduct, Asset, ProductRevision with the
  same default-deny policy pattern.
- 2026-09-26 — W3: `003-pricing-inventory-rls.sql` covers PriceList, Price,
  Promotion, InventoryItem, Reservation. Note: reservation atomicity relies
  on row locks of the conditional UPDATEs; RLS adds only the tenant
  dimension there.
- 2026-09-26 — W4: `004-cart-checkout-order-rls.sql` covers Cart, CartItem,
  Checkout, Order, OrderLine, IdempotencyRecord.
- 2026-09-26 — W5: `005-payment-finance-rls.sql` covers PaymentIntent,
  PaymentAttempt, Refund, WebhookEvent, Journal, JournalLine, Settlement,
  TaxRate.
- 2026-09-26 — W6: `006-fulfillment-rls.sql` covers Fulfillment,
  FulfillmentLine, TrackingEvent, Return, ReturnLine, ShippingRate.
- 2026-09-26 — W7: `007-cms-rls.sql` covers Page, PageRevision.
- 2026-09-26 — W8: `008-builder-theme-rls.sql` covers BlockDefinition,
  Theme, ThemeTemplate.
- 2026-09-26 — W9: `009-clone-fork-rls.sql` covers ForkLink, CloneManifest.
- 2026-09-26 — W4 addendum: `010-order-sequence-rls.sql` covers the
  OrderSequence counter allocated atomically by `nextSequence`.
- 2026-09-26 — W11: `011-search-rls.sql` covers OutboxEvent, SearchDocument.
- 2026-09-26 — W13: `012-extensions-rls.sql` covers Plugin,
  WebhookSubscription, WebhookDelivery.
- 2026-09-26 — W12/W14: `013-analytics-hardening-rls.sql` covers
  AnalyticsEvent, RateLimitPolicy, RateLimitCounter.
