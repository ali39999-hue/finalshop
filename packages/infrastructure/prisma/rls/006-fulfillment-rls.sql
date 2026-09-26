-- Fulfillment & returns tables (W6): same default-deny pattern as 001–005.
-- Apply after 005 and after `prisma migrate deploy`.

ALTER TABLE "Fulfillment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FulfillmentLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrackingEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Return" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReturnLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShippingRate" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_fulfillment ON "Fulfillment"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_fulfillment_line ON "FulfillmentLine"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_tracking_event ON "TrackingEvent"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_return ON "Return"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_return_line ON "ReturnLine"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_shipping_rate ON "ShippingRate"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "Fulfillment", "FulfillmentLine", "TrackingEvent",
  "Return", "ReturnLine", "ShippingRate"
TO finalshop_app;
