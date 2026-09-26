# Monorepo Structure

Wave 0 baseline, implementing roadmap §22 and ADR-001.

```text
apps/
  web/            # public storefront + customer account (Next.js)
  admin/          # ERP + builder + platform admin (Next.js; may merge into web route groups initially)
  worker/         # background jobs: queues, indexing, notifications

packages/
  domain/          # entities, value objects, policies, state machines
  application/     # commands, queries, workflows
  infrastructure/  # prisma, redis, storage, search adapters (implements ports)
  ui/              # shared accessible primitives (shadcn/ui + Radix)
  builder/         # block schema + renderer + inspector
  theme/           # design tokens + theme runtime
  commerce/        # cart/order/catalog modules
  finance/         # money/ledger/tax kernel
  auth/            # IAM + authorization
  i18n/            # locale contracts
  testing/         # fixtures + test utilities
  config/          # eslint / tsconfig / build shared config

infra/
  docker/          # docker-compose.dev.yml: postgres, redis, meilisearch, minio
  migrations/      # (from W1: prisma migrations live with infrastructure)
  observability/   # otel collector / dashboards (from W11+)

docs/
  adr/             # architecture decision records
  architecture/    # domain map, dependency rules, structure
  security/        # threat model
  product/         # master roadmap + reference atlas (FA) + sources
```

## Notes

- **web vs admin**: the roadmap allows starting with one Next.js app split by
  route groups; package boundaries are kept from day one so a later split is
  cheap. Decision on merging is made at W1 kickoff; the `apps/web` +
  `apps/admin` placeholders exist either way.
- **apps/api** is intentionally absent: the BFF/API contract layer starts
  inside the Next.js runtime. A separate `api` app is added by ADR only when
  contracts must leave it.
- Placeholders created in W0 contain only `package.json` so the workspace
  resolves; real code lands wave by wave (see TASKS.md).
- Everything is private (`"private": true`); publishing is not a goal.
