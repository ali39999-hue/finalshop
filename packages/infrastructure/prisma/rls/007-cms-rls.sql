-- CMS tables (W7): same default-deny pattern as 001–006.
-- Apply after 006 and after `prisma migrate deploy`.

ALTER TABLE "Page" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PageRevision" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_page ON "Page"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_page_revision ON "PageRevision"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "Page", "PageRevision"
TO finalshop_app;
