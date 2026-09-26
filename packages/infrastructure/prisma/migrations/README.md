# Migrations

## Apply order (W15 runbook)

1. `npx prisma migrate deploy` — applies the baseline DDL
   (`000000000000_init/migration.sql`) and any later migrations.
2. Apply the RLS scripts **in numeric order** (they are idempotent):

   ```bash
   for f in prisma/rls/0*.sql; do psql "$DATABASE_URL" -f "$f"; done
   ```

   Or apply them individually with psql/`prisma db execute`.
3. The runtime application must connect as a **non-owner** role
   (`finalshop_app`) so RLS is actually enforced — see
   `docs/architecture/rls-strategy.md`.

## Baseline

- `20260926110903_init/migration.sql` — full W0–W10 kernel schema.
- `20260926111538_add_order_sequence/migration.sql` — atomic order-number
  counter (used by `nextSequence`).
- `20260926130000_search_extensions_analytics/migration.sql` — W11 search &
  outbox, W13 extensions, W12/W14 analytics and rate-limit counters.
- `000000000000_init` was removed as a duplicate of the real baseline.
