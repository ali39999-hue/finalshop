-- Analytics & rate limiting tables (W12/W14): same default-deny pattern as
-- 001–012. Apply after 012 and after `prisma migrate deploy`.

ALTER TABLE "AnalyticsEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateLimitPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateLimitCounter" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_analytics_event ON "AnalyticsEvent"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_rate_limit_policy ON "RateLimitPolicy"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_rate_limit_counter ON "RateLimitCounter"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "AnalyticsEvent", "RateLimitPolicy", "RateLimitCounter"
TO finalshop_app;
