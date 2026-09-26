-- Search / outbox tables (W11): same default-deny pattern as 001–010.
-- Apply after 010 and after `prisma migrate deploy`.

ALTER TABLE "OutboxEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SearchDocument" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_outbox_event ON "OutboxEvent"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_search_document ON "SearchDocument"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "OutboxEvent", "SearchDocument"
TO finalshop_app;
