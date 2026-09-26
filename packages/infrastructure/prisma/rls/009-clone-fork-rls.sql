-- Clone/fork tables (W9): same default-deny pattern as 001–008.
-- Apply after 008 and after `prisma migrate deploy`.

ALTER TABLE "ForkLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CloneManifest" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_fork_link ON "ForkLink"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_clone_manifest ON "CloneManifest"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "ForkLink", "CloneManifest"
TO finalshop_app;
