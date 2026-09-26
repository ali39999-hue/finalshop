# Threat Model

Wave 0 initial draft (task ARC-004), from roadmap §3 (non-negotiables), §14
(IAM/RBAC/Security) and Atlas §25. **Living document** — reviewed at every wave
gate; updates are noted in the change log at the bottom.

## Scope

The platform kernel: multi-tenant commerce (catalog → checkout → payment →
ledger), CMS/page builder/theme engine, clone/fork, and the extension platform.

## Assets (what we protect)

1. **Tenant data isolation** — the single most valuable invariant; a leak ends
   the product.
2. **Financial integrity** — payments, ledger, refunds, reconciliation.
3. **Customer PII**.
4. **Content integrity** — pages/themes/publish history (revisions, rollback).
5. **Platform secrets** — provider keys, signing secrets; never copied by clone.

## Trust boundaries

```text
Internet → Edge (CDN/WAF) → Next.js apps → Application layer → PostgreSQL/Redis/Storage
                                     ↑
   Payment providers (webhooks) ─────┤
   Tenant admin users (browser) ─────┤
   Installed plugins/apps ───────────┤
   AI assistants (suggestions only) ─┘
```

## Threat catalog

| ID | Threat | Vector | Mitigations | Test gate |
| --- | --- | --- | --- | --- |
| T-01 | Cross-tenant data access (IDOR) | Missing/weak tenant scope on any read/write | Tenant context guard on every query; tenant-aware repositories; PostgreSQL RLS on sensitive tables as defense-in-depth (W1, IAM-005) | Cross-tenant test suite — P0, blocks release |
| T-02 | AuthN attacks | Session fixation, CSRF, token lifecycle flaws | Modern auth library patterns + OWASP session/CSRF cheat sheets; threat-model review before auth adoption | Auth flow E2E + security review |
| T-03 | Webhook spoofing / replay | Forged or replayed provider events | Signature verification, replay protection, idempotent webhook inbox (PAY-002) | Webhook integration tests incl. replays |
| T-04 | SSRF | Builder data sources, asset import, webhook targets fetching attacker URLs | Egress allowlist; no raw user-supplied URLs in server-side fetches | Unit tests on URL validation; review |
| T-05 | XSS via theme/blocks/custom CSS | Malicious props/CSS in page schema | Schema-driven blocks only; sanitized, scoped tenant stylesheet; no arbitrary HTML injection | Visual + DOM assertions in E2E |
| T-06 | Open redirect | Domain resolver / storefront redirects | Validate domain records and redirect targets | E2E on domain routing |
| T-07 | Mass assignment | Admin APIs accepting unvalidated payloads | Zod schemas at every boundary; explicit DTOs; field-scope permissions | Contract tests per command |
| T-08 | Secret leakage via clone/sandbox | Clone profiles copying provider keys into child stores/sandboxes | Secrets live only in secret manager; profiles exclude them; sandbox data masked | Clone manifest assertions (CLONE-001) |
| T-09 | Plugin overreach | Plugin accessing schema/tables outside granted capabilities | Capability-based manifest (permissions, events, UI slots); no direct Prisma access | Plugin permission tests (W13) |
| T-10 | Abuse / DoS | Checkout, search, auth endpoints hammered | Tenant-aware + route-aware rate limiting; quotas per plan | k6 load scenarios |
| T-11 | Financial invariant breakage | Duplicate capture/refund, unbalanced journals | Idempotency keys on all sensitive POSTs; balanced journal invariant; audit events; reconciliation | Concurrency tests (INV-003, CHK-002); ledger property tests |
| T-12 | AI overreach | Agent-triggered financial/order mutations | AI suggests, humans approve; approval boundaries on sensitive commands (roadmap §3) | Review + approval-flow tests |

## Security gates (CI, from W1)

- SAST: Semgrep (custom rules for tenant-scope and money-handling code).
- Secrets: Gitleaks (pre-commit + CI).
- Dependencies/containers: Trivy + Renovate.
- Permission tests: every command's authz path covered.
- OWASP ASVS checklist reviewed per release.
- Break-glass: short-lived emergency access, fully audited.

## Change log

- 2026-09-26 — initial draft (W0).
