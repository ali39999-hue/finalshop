# Dependency Rules

Wave 0 baseline (task ARC-003). These rules implement ADR-001 and the roadmap's
layer table (§4). They are enforced by lint boundaries (added in W1) and code
review; violations block merge.

## Layer responsibilities

| Layer | Responsibility | Must NOT contain |
| --- | --- | --- |
| Presentation (`apps/web`, `apps/admin`, `packages/ui`) | UI, accessibility, view-models, interaction | Prisma, business rules, direct payment logic |
| Application (`packages/application`) | Commands/queries, orchestration, transaction boundaries | UI concerns |
| Domain (`packages/domain`) | Rules, entities, value objects, state machines | Framework coupling |
| Infrastructure (`packages/infrastructure`) | DB, Redis, storage, external APIs, search clients | Business policy decisions |
| Workers (`apps/worker`) | Async jobs, retries, indexing, notifications | Request-lifecycle dependency |

## Allowed dependency directions

```text
Presentation → Application → Domain
Workers      → Application → Domain
Infrastructure implements ports defined by Domain/Application (inward only)
```

- The Domain layer is pure TypeScript: no Next.js, no React, no Prisma, no HTTP,
  no Redis imports.
- Presentation talks to Application through typed command/query contracts only;
  it never imports Infrastructure clients or reaches into tables.
- Infrastructure may implement interfaces from Domain/Application but nothing
  may import Infrastructure except the composition root (app wiring) and Workers.

## Module boundaries

- Cross-module calls go through the owning module's application commands/queries
  or domain events (via the outbox). **Never** import another module's
  repositories or query its tables directly.
- `packages/commerce`, `packages/finance`, `packages/auth`, `packages/builder`,
  `packages/theme` group domain+application code per domain-map groupings;
  their public surface is a barrel (index) — deep imports from other packages
  are lint violations.
- `packages/ui` contains shared accessible primitives; design tokens come only
  from `packages/theme` (single source of truth).

## External dependencies

- External/reference code is isolated in adapter modules so it can be replaced
  without touching the core (Atlas §1). Adapters live in
  `packages/infrastructure` (or a dedicated adapter package) behind a port.
- Every new dependency requires: license/security/maintenance review + Reference
  Ledger entry (Atlas §37) + ADR if it is architecturally load-bearing.
- Never copy from reference repositories: money/ledger logic, tenant isolation,
  auth/session models, order/payment state machines, or editor JSON schemas
  without a versioning/migration strategy (Atlas §39).

## Data rules

- PostgreSQL is the canonical store. Redis is cache/locks/ephemeral only.
- The search index is derived state, rebuilt from outbox events; no cache is a
  source of truth for price, stock, payment, or ledger.
- Identifiers: canonical entities carry immutable IDs; slugs/domains are
  presentation identifiers; externally referenced identifiers are globally
  safe or tenant-scoped unique.
