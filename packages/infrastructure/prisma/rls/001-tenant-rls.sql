-- IAM-005: defense-in-depth tenant isolation via PostgreSQL RLS.
--
-- The PRIMARY mechanism is application-level: the tenant context guard
-- (IAM-003) plus tenant-scoped repositories on every query. RLS is the SECOND
-- layer (roadmap §5, threat T-01): even a forgotten WHERE clause cannot cross
-- tenants when the connection runs under a non-owner role.
--
-- How it works
-- - runInTenantTransaction() (packages/infrastructure) sets the GUC
--   `app.tenant_id` per transaction via set_config(..., is_local => true);
--   it resets automatically when the transaction ends.
-- - Policies are DEFAULT-DENY: when `app.tenant_id` is not set,
--   current_setting(..., true) returns NULL and no rows match.
-- - Table owners and superusers BYPASS RLS. The runtime application must
--   connect with a non-owner role (see docs/architecture/rls-strategy.md);
--   migrations run as owner and intentionally bypass.
--
-- Apply after `prisma migrate deploy`.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finalshop_app') THEN
    CREATE ROLE finalshop_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO finalshop_app;

ALTER TABLE "Store" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Storefront" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Branch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Domain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_store ON "Store"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_storefront ON "Storefront"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_branch ON "Branch"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_domain ON "Domain"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_membership ON "Membership"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_audit_event ON "AuditEvent"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

-- The runtime role gets least-privilege DML; ownership stays with the
-- migration role.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "Organization", "User", "Store", "Storefront", "Branch", "Domain",
  "Membership", "AuditEvent"
TO finalshop_app;
