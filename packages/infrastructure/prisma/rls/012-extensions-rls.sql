-- Extension tables (W13): same default-deny pattern as 001–011.
-- Apply after 011 and after `prisma migrate deploy`.

ALTER TABLE "Plugin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookDelivery" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_plugin ON "Plugin"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_webhook_subscription ON "WebhookSubscription"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_webhook_delivery ON "WebhookDelivery"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "Plugin", "WebhookSubscription", "WebhookDelivery"
TO finalshop_app;
