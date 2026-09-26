# ADR-002: V1 Reference Stack

## Status

Accepted — 2026-09-26 (Wave 0 baseline)

## Context

The Reference Atlas (§38, "Reference Stack پیشنهادی برای نسخه اول") proposes the
first-version stack. Atlas rule (§1): every dependency is adopted only after a
license / security / maintenance / bus-factor review, external code stays
isolated in adapter packages, and each adoption gets an entry in the Reference
Ledger (§37). Nothing in the money/ledger/tenant-isolation/order-state space may
be copied from reference repositories.

## Decision

| Layer | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript everywhere | strict mode; shared `tsconfig.base.json` |
| Web + Admin | Next.js (App Router, RSC) | initially one app with route groups; split later only if needed |
| Monorepo | npm workspaces + Turborepo | npm chosen because pnpm's shim is broken on current dev machines; pnpm can be swapped later |
| UI primitives | shadcn/ui + Radix Primitives | one design-token source of truth in `packages/theme`; React Aria where a11y is complex |
| Data fetching (client) | TanStack Query | operational/admin screens; RSC where possible |
| Validation | Zod | command/query boundaries, form validation, plugin manifests |
| Database | PostgreSQL (canonical) + Prisma | Drizzle evaluated as alternative at W1 before migrations harden |
| Cache / queues | Redis + BullMQ | cache, locks, ephemeral state only — never canonical business data |
| Search | Meilisearch | derived index via outbox events; OpenSearch deferred until scale justifies it |
| Durable workflows | Temporal — deferred | BullMQ first; Temporal only when multi-step compensating workflows appear (W12+) |
| Payments | Provider-agnostic adapter, Stripe first | idempotency + signed webhook inbox mandatory (roadmap §9) |
| Money | Internal decimal money kernel | no floating point in financial values; dinero.js/currency.js are pattern references only |
| Email | React Email + Resend | adapter-based notification service |
| Testing | Vitest, Testing Library, MSW, Playwright, axe-core, k6 | golden journeys + visual + a11y + load gates (roadmap §20) |
| Security | OWASP ASVS checklist, Semgrep, Gitleaks, Trivy | CI gates from W1 |
| Observability | OpenTelemetry + Sentry | correlation on requestId/tenantId/actorId/commandId/workflowId |
| Local infra | Docker Compose | Postgres, Redis, Meilisearch, MinIO (`infra/docker/`) |

## Consequences

- `packages/infrastructure` owns all Prisma/Redis/search/storage access behind
  ports; no other layer imports those clients.
- Any stack change requires an ADR and a Reference Ledger entry.
- npm-workspaces lockstep: if pnpm is fixed/standardized later, migrate before
  the workspace grows (cheap now, expensive after CI depends on it).

## Alternatives considered

- **Adopt Medusa/Saleor/Vendure as the commerce core** — rejected: they are
  reference architectures for boundaries and patterns (Atlas §4); the roadmap
  requires a proprietary commerce/tenant/clone kernel.
- **Adopt WordPress/Gutenberg as CMS core** — rejected (roadmap §26): WordPress
  informs editor UX and block/pattern concepts only; the core must be
  commerce-native.
