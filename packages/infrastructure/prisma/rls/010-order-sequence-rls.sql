-- Order sequence counter (W4): one row per org; allocated atomically by
-- `nextSequence` via INSERT ... ON CONFLICT DO UPDATE ... RETURNING.
-- Same default-deny pattern as 001–009. Apply after the
-- add_order_sequence migration.

ALTER TABLE "OrderSequence" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_order_sequence ON "OrderSequence"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE ON "OrderSequence" TO finalshop_app;
