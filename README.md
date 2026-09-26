# final.shop — Global Commerce OS

A multi-tenant, white-label, cloneable commerce platform: storefront + CMS +
page builder + theme engine + ERP in one Commerce OS. The mission, architecture,
and reference stack are defined by two master documents (Persian), kept under
`docs/product/`:

- **Master roadmap** — [docs/product/master-roadmap-fa.md](docs/product/master-roadmap-fa.md):
  product definition, non-negotiable principles, architecture, domain model,
  clone/fork algorithm, ERP, security, 16 execution waves (W0–W16), and the
  first-50-tasks appendix.
- **Reference atlas** — [docs/product/reference-atlas-fa.md](docs/product/reference-atlas-fa.md):
  which repositories/skills (Medusa, Saleor, Vendure, Payload, Puck, shadcn/ui,
  …) inform each area, with adoption labels (CORE/ADOPT/EMBED/REFERENCE/TEST)
  and usage rules. References are for patterns and boundaries — never blind
  copies, especially for money, tenant isolation, auth, and state machines.

> Central principle (roadmap §0): we are not building "WordPress for shops";
> we are building a Commerce Operating System that combines WordPress's
> flexibility, Shopify's section/block model, modular commerce engines, and
> multi-tenant discipline in one product.

## The five roles

1. Online store (B2C/B2B, multi-channel)
2. CMS (draft/publish/version/preview/schedule/localization)
3. Site & theme builder (schema-driven blocks + design tokens)
4. ERP / operations center (orders, inventory, finance, CRM, support)
5. SaaS platform (independent or forked child stores from a shared core)

## Architecture baseline (Wave 0)

| Document | What it decides |
| --- | --- |
| [ADR-001](docs/adr/ADR-001-modular-monolith-in-monorepo.md) | Modular monolith in a monorepo; runtime split only for web/worker |
| [ADR-002](docs/adr/ADR-002-v1-reference-stack.md) | V1 stack: Next.js, TypeScript, PostgreSQL+Prisma, Redis+BullMQ, Meilisearch, shadcn/ui |
| [Domain map](docs/architecture/domain-map.md) | 17 domains, entities, and P0 invariants |
| [Dependency rules](docs/architecture/dependency-rules.md) | Layer + module boundaries enforced from day one |
| [Monorepo structure](docs/architecture/monorepo-structure.md) | apps/packages/infra/docs layout |
| [Threat model](docs/security/threat-model.md) | 12 threats with mitigations and test gates (T-01 cross-tenant is P0) |

## Repository layout

```text
apps/        web (demo storefront, Next.js) · admin (placeholder) · worker (placeholder)
packages/    domain · application · infrastructure · ui · builder · theme
             commerce · finance · auth · i18n · testing · config
infra/       docker/ (local: postgres, redis, meilisearch, minio)
docs/        adr · architecture · security · product
```

## Storefront quickstart (demo)

```bash
docker compose -f infra/docker/docker-compose.dev.yml up -d
npm install
cd packages/infrastructure && npx prisma migrate deploy   # or `prisma migrate dev`
cd ../.. && npm run dev -w @finalshop/web
# open http://localhost:3000 → /setup seeds the demo org (idempotent)
```

The storefront serves one demo organization (`DEMO_ORG_SLUG`, default
`demo`) and walks the golden journey over HTTP: browse → cart → priced
checkout → order (idempotent) → payment confirmation → stock commit.

## Local development

```bash
# local data services (from W1 the apps also need node_modules + migrations)
docker compose -f infra/docker/docker-compose.dev.yml up -d

npm install     # resolves the workspace (turbo + typescript at root)
npm run build   # turbo build pipeline
```

Toolchain: Node ≥ 20, npm 11 workspaces, Turborepo, TypeScript strict.
(pnpm is the usual companion for Turborepo but its shim is broken on the
current dev machine — see ADR-002 before changing this.)

## Roadmap waves

| Wave | Focus | Wave | Focus |
| --- | --- | --- | --- |
| W0 | Vision, ADRs, threat model, domain map ✅ | W8 | Theme + Builder (blocks, inspector) ✅ kernel |
| W1 | Platform core: Tenant/Org/Store/IAM/RBAC ✅ kernel | W9 | Clone/Fork (snapshot, manifest, sync/detach) ✅ kernel |
| W2 | Commerce kernel: catalog/product/variant ✅ kernel | W10 | ERP (grids, queues, finance, CRM) |
| W3 | Pricing engine + inventory reservations ✅ kernel | W11 | Search + SEO ✅ kernel |
| W4 | Cart + checkout state machine + orders ✅ kernel | W12 | Analytics ✅ kernel |
| W5 | Payment + tax + ledger ✅ kernel | W13 | Extensions (plugins, apps, webhooks) ✅ kernel |
| W6 | Fulfillment + returns ✅ kernel | W14 | Hardening (security/perf/a11y) ✅ kernel |
| W7 | CMS core (pages, revisions, media) ✅ kernel | W15+ | Launch, then scale (AI, multi-region) |

Waves close on dependencies, not UI screens; each closes only with full
evidence: migration + tests + E2E + accessibility + security + runtime
verification. Execution tasks: [TASKS.md](TASKS.md).

## Working agreements

- Business logic lives in Domain/Application — never in React components or
  route handlers. Tenant isolation is enforced by policy + constraints + tests.
- Every important mutation is command-oriented, idempotent, and audited.
- Financial data, orders, payments, customers, and secrets are **never** cloned
  by default; clone profiles define what is copied.
- The page builder never executes tenant-supplied server-side code.
- AI suggests; it never becomes the source of truth for orders or finance.
- Every architectural change → ADR. Every dependency → Reference Ledger entry
  (atlas §37) after license/security review.
