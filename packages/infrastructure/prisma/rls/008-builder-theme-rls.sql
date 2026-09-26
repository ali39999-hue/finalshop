-- Builder & theme tables (W8): same default-deny pattern as 001–007.
-- Apply after 007 and after `prisma migrate deploy`.

ALTER TABLE "BlockDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Theme" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ThemeTemplate" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_block_definition ON "BlockDefinition"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_theme ON "Theme"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_theme_template ON "ThemeTemplate"
  USING ("orgId" = current_setting('app.tenant_id', true))
  WITH CHECK ("orgId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "BlockDefinition", "Theme", "ThemeTemplate"
TO finalshop_app;
