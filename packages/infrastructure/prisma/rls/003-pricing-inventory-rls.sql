-- Pricing & inventory tables (W3, PRICE/INV): same default-deny pattern as
-- 001/002. Inventory rows are the concurrency point for reservations — the
-- conditional UPDATEs in InventoryItemRepository rely on row locks, RLS only
-- adds the tenant dimension. Apply after 002.

ALTER TABLE "PriceList" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Price" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Promotion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reservation" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_price_list ON "PriceList"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_price ON "Price"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_promotion ON "Promotion"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_inventory_item ON "InventoryItem"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_reservation ON "Reservation"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "PriceList", "Price", "Promotion", "InventoryItem", "Reservation"
TO finalshop_app;
