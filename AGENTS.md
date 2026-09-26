# AGENTS.md — Engineering Rulebook for final.shop

This is the rulebook for AI agents and human contributors working in this
repository. It condenses the authoritative documents; when in doubt, the
source documents win:

- [README.md](README.md) — mission, waves, working agreements
- [TASKS.md](TASKS.md) — canonical task IDs (use them in branch names, commits, PRs)
- [ADR-001](docs/adr/ADR-001-modular-monolith-in-monorepo.md) — modular monolith in a monorepo
- [ADR-002](docs/adr/ADR-002-v1-reference-stack.md) — V1 reference stack
- [Dependency rules](docs/architecture/dependency-rules.md) · [Domain map](docs/architecture/domain-map.md) · [Monorepo structure](docs/architecture/monorepo-structure.md) · [RLS strategy](docs/architecture/rls-strategy.md)
- [Threat model](docs/security/threat-model.md) — 12 threats; T-01 (cross-tenant) is P0

Every architectural change requires an ADR. Every new dependency requires a
license/security/maintenance review plus a Reference Ledger entry (Atlas §37).

## Project overview

**final.shop — Global Commerce OS.** A multi-tenant, white-label, cloneable
commerce platform: storefront + CMS + page builder + theme engine + ERP in one
product. It serves five roles: online store (B2C/B2B, multi-channel), CMS
(draft/publish/version/preview/schedule/localization), site & theme builder,
ERP/operations center, and SaaS platform (independent or forked child stores
from a shared core). We are not building "WordPress for shops" — we are
building a Commerce Operating System that combines WordPress's flexibility,
Shopify's section/block model, modular commerce engines, and multi-tenant
discipline. The kernel (tenancy, commerce, finance, CMS) is proprietary;
reference repositories (Medusa, Saleor, Vendure, Payload, Puck, shadcn/ui, …)
inform patterns and boundaries only — never blind copies, especially for
money, tenant isolation, auth, and state machines.

## Repository layout

npm workspaces + Turborepo ("finalshop", private). Toolchain: Node ≥ 20, npm 11
workspaces, TypeScript strict (`tsconfig.base.json`: `strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).

| Path | Contents | Status |
| --- | --- | --- |
| `apps/web` | Public storefront + customer account (Next.js) | placeholder (package.json only) |
| `apps/admin` | ERP + builder + platform admin (Next.js; may merge into `web` route groups initially) | placeholder |
| `apps/worker` | Background jobs: queues, indexing, notifications | placeholder |
| `packages/domain` | Entities, value objects, policies, state machines — pure TypeScript | **active** (tenancy, catalog, pricing, money, inventory, cart, checkout, order, payment, finance, fulfillment, cms, builder, theme, audit) |
| `packages/application` | Commands, queries, ports (transaction boundaries) | **active** |
| `packages/infrastructure` | Prisma schema, tenant transaction, repositories, RLS SQL | **active** |
| `packages/auth` | IAM + authorization (`ROLE_PERMISSIONS`, `can`, tenant-context guards) | **active** |
| `packages/testing` | Fixtures + test utilities | minimal |
| `packages/ui`, `packages/builder`, `packages/theme`, `packages/commerce`, `packages/finance`, `packages/i18n`, `packages/config` | Placeholder packages (package.json only, so the workspace resolves) — real code currently lives in `domain`/`application`/`infrastructure` per module | placeholder |
| `infra/docker` | `docker-compose.dev.yml`: postgres:17-alpine, redis:7-alpine, meilisearch v1.12, minio | active |
| `docs/` | `adr/`, `architecture/`, `security/`, `product/` (master roadmap + reference atlas, FA) | active |

`apps/api` is intentionally absent: the BFF/API contract layer starts inside
the Next.js runtime; a separate `api` app is added by ADR only if contracts
must leave it.

## The dependency rule (non-negotiable)

```text
Presentation → Application → Domain
Workers      → Application → Domain
Infrastructure implements ports defined by Domain/Application (inward only)
```

| Layer | Responsibility | Must NOT contain |
| --- | --- | --- |
| Presentation (`apps/web`, `apps/admin`, `packages/ui`) | UI, accessibility, view-models, interaction | Prisma, business rules, direct payment logic |
| Application (`packages/application`) | Commands/queries, orchestration, transaction boundaries | UI concerns |
| Domain (`packages/domain`) | Rules, entities, value objects, state machines | Framework coupling |
| Infrastructure (`packages/infrastructure`) | DB, Redis, storage, external APIs, search clients | Business policy decisions |
| Workers (`apps/worker`) | Async jobs, retries, indexing, notifications | Request-lifecycle dependency |

- **The Domain layer is pure TypeScript**: no Next.js, no React, no Prisma, no
  HTTP, no Redis imports.
- **Business logic never lives in React components or route handlers.** All of
  it belongs in Domain/Application.
- Presentation talks to Application through typed command/query contracts
  only; it never imports Infrastructure clients or reaches into tables.
- Nothing imports Infrastructure except the composition root (app wiring) and
  Workers.
- Domain-focused packages (`commerce`, `finance`, `auth`, `builder`, `theme`)
  group code per domain-map groupings; their public surface is a barrel
  (`index.ts`) — deep imports from other packages are lint violations.

## Modular monolith rules (ADR-001)

- One application core, one canonical PostgreSQL database; runtime split only
  for the Next.js app and the worker.
- **Cross-module communication happens only through the owning module's
  application commands/queries or domain events (via the transactional
  outbox). Never import another module's repositories or query its tables
  directly.** This keeps a future extraction into services mechanical.
- Boundary violations block merge. ESLint boundary enforcement is a tracked
  open item; until it lands, this is enforced by review — treat violations as
  release blockers.
- Derived state (search index, webhooks, emails) is fed by outbox events. The
  search index is derived state; no cache is a source of truth for price,
  stock, payment, or ledger. Redis is cache/locks/ephemeral only.

## Multi-tenancy — two mandatory isolation layers

Threat model **T-01 (cross-tenant data access) is P0**: the cross-tenant test
suite blocks release. A leak ends the product.

1. **Application layer (primary):** every query carries an `orgId` derived
   from the authenticated context — never from client input. Tenant context
   guards (`assertTenantContext`, `requireSameTenant`) plus tenant-scoped
   repositories and `requirePermission` on commands.
2. **PostgreSQL RLS (defense-in-depth):** default-deny row-level security
   keyed on a transaction-local GUC. Tenant-scoped tables carry a denormalized
   `orgId`; `runInTenantTransaction(db, orgId, fn)` sets
   `set_config('app.tenant_id', …, is_local => true)` so pooled connections
   cannot leak the setting. Policies use
   `USING ("orgId" = current_setting('app.tenant_id', true))` — unset GUC
   means no rows match.

RLS SQL lives in `packages/infrastructure/prisma/rls/`, numbered `001`–`007`
in [rls-strategy.md](docs/architecture/rls-strategy.md) (W1–W7 tables), with
`008-builder-theme-rls.sql` (W8 builder/theme tables) following the same
pattern. Apply order: `prisma migrate deploy` → RLS scripts (idempotent).

- `Organization` and `User` are platform-scoped and stay outside RLS; access
  is controlled by the application layer and reserved roles.
- The application must connect as the least-privilege runtime role
  (`finalshop_app`, subject to RLS) — **never** as the migration/owner role,
  which bypasses RLS silently.
- Pooled/serverless deployments must run transaction-mode pooling so the GUC
  stays transaction-scoped.

## Command orientation — every mutation

- Every mutation is a **command**: zod-validated at the boundary (T-07 mass
  assignment), permission-guarded (`requirePermission`), tenant-guarded, and
  **audited** — every command writes an audit event (IAM-004,
  `buildAuditEvent`).
- **Idempotency is mandatory** on sensitive operations (CHK-002): completed
  requests replay their result, key reuse with a different payload is
  rejected, in-flight duplicates are flagged (`IdempotencyRecord`).
- **Money is BigInt minor units** (`packages/domain/money`), currency-aware
  per the ISO-4217 registry, HALF_UP rounding, largest-remainder allocation.
  Never floats, never `Number`, in any financial value.
- Refunds and returns go through the money path: refund flow
  REQUESTED → APPROVED → EXECUTED with the money-trace invariant
  (refunds ≤ captured, per intent); balanced double-entry ledger postings
  (Σ debits = Σ credits); Return/RMA completion must link to an EXECUTED
  refund (PAY-003, FUL-004, FIN-001).
- Order, Payment, Refund, Reservation, Return, Publish/Clone jobs all have
  explicit state machines (`from[]`, `to`, `command`, `guard`, `sideEffects`,
  `auditEvent`) — no implicit status string flipping.

## CMS / Builder / Theme rules

- Pages are stored as a **JSON schema AST — never rendered HTML**
  (`packages/domain/cms`, `PAGE_SCHEMA_VERSION`, `MAX_PAGE_TREE_DEPTH`).
  Structural validation enforces unique node ids, non-empty types, and the
  depth cap.
- Revisions are **immutable** (`PageRevision`); every save writes a new one.
  Publish moves the published pointer (draft/preview/scheduled are pointer
  states); scheduled publishing runs as an audited system-actor sweep.
- AST `props.assetId` references are validated against the org's asset
  registry at save time.
- The visual editor (canvas/inspector) is **UI-layer only**. The kernel ships
  registries + validation: capability-based block/section definitions with
  typed prop fields (`packages/domain/builder`); blocks bind to domain data
  via typed sources.
- **The builder never executes tenant-supplied server-side code** (T-05):
  schema-driven blocks only, sanitized and scoped tenant CSS, no arbitrary
  HTML injection.
- Design tokens have a single source of truth (theme domain today,
  `packages/theme` as it materializes); every theme publish is an immutable
  revision with contrast/a11y guards.

## Testing & verification loop

Before considering any task done:

```bash
npm run typecheck   # turbo → tsc --noEmit per workspace
npm run test        # turbo → vitest per workspace
```

- Integration tests (e.g. `prisma-repositories.integration.test.ts`)
  **self-skip when `DATABASE_URL` is unset**; run them locally with
  `infra/docker/docker-compose.dev.yml` up for real coverage.
- No oversell: atomic reservation (single conditional UPDATE) must keep its
  concurrency tests; checkout keeps idempotency tests; ledger keeps
  property/balance tests.
- RLS verification gate: an integration suite connecting as `finalshop_app`
  must assert tenant-only reads, `WITH CHECK` rejections on foreign `orgId`,
  and no rows on unset GUC (T-01 suite).
- **Waves close on dependencies, not UI screens.** A wave closes only with
  full evidence: migration + tests + E2E + accessibility + security + runtime
  verification. "It compiles" or "it renders" is not done (TASKS.md,
  Definition of Done).
- **Cache caveat:** Turborepo may serve stale task results after unusual
  interruptions. If `npm run typecheck`/`npm run test` reports failures that
  look stale, verify directly in the affected package with
  `npx tsc --noEmit` / `npx vitest run` before debugging phantom errors.

## Security rules

- **Never commit secrets or `.env` files.** `.env.example` is the template;
  add new variables there, never real values.
- No hardcoded credentials, tokens, or provider keys in scripts, seed data, or
  provider adapters. Secrets live only in the secret manager; clone profiles
  must exclude them (T-08) — financial data, orders, payments, customers, and
  secrets are **never cloned** by default.
- Webhooks are signed (HMAC-SHA256 + timestamp tolerance), replay-safe, and
  idempotent via the webhook inbox (PAY-002, T-03).
- Adopt the **OWASP ASVS 5.0 mindset**: the ASVS checklist is reviewed per
  release; CI security gates include Semgrep (tenant-scope and money-handling
  rules), Gitleaks, and Trivy.
- AI assistants suggest; they never become the source of truth for orders or
  finance — approval boundaries sit on sensitive commands (T-12).

## Commits & CI

- **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`,
  …). Task IDs from TASKS.md are canonical — include them in branch names,
  commit messages, and PRs (e.g. `feat(cart): … (CART-001)`).
- CI ("Production Gate CI", `.github/workflows/ci.yml`) runs on every push/PR
  to `main` and must pass all gates: **typecheck, lint, test, build, and
  `npm audit --omit=dev --audit-level=high`**.
- Do not switch package managers casually: npm 11 is pinned because pnpm's
  shim is broken on the current dev machine (ADR-002); a swap requires an ADR
  before the workspace grows.

## Known current-state caveats

Ground truth as of this writing; update this section as waves close.

- `apps/web`, `apps/admin`, `apps/worker` are **placeholders** (package.json
  only) — no Next.js app exists yet.
- `packages/infrastructure/prisma/migrations/` **does not exist yet** — the
  baseline Prisma migration is pending; only `schema.prisma` and the
  `rls/*.sql` scripts are present.
- Root packages `i18n`, `builder`, `commerce`, `config`, `finance`, `theme`,
  `ui` are **placeholder packages** except where equivalent code exists in
  `packages/domain` (which already contains `builder/` and `theme/` modules)
  and `packages/application`/`packages/infrastructure` (builder-theme ports,
  commands, repositories).
- Waves **W0–W7 are closed** (kernel-level: tenancy/IAM, catalog, pricing/
  inventory, cart/checkout/orders, payment/finance, fulfillment/returns, CMS).
  **W8 (builder/theme) is in progress**: kernel code exists across
  domain/application/infrastructure (including `008-builder-theme-rls.sql`),
  but TASKS.md W8 items (BLD-001…005, THEME-001…002) are not checked and the
  wave is not closed.
- Open kernel-adjacent items carried per wave (see TASKS.md): auth provider
  integration (sessions feeding the tenant context), ESLint boundary
  enforcement, DNS-token domain verification, Stripe adapter, customer/
  channel models, worker scheduler wiring, browser-level E2E.
- Everything is private (`"private": true`); publishing packages is not a
  goal.
