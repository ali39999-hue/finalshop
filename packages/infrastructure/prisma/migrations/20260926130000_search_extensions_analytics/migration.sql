-- Follow-up baseline: W11 search/outbox, W13 extensions, W12/W14 analytics
-- and rate limiting tables (added after 20260926111538_add_order_sequence).

-- ── W11: Outbox & Search ───────────────────────────────────────────────────

CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SearchDocument" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "currency" TEXT,
    "priceMinor" BIGINT,
    "collectionIds" JSONB NOT NULL,
    "published" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboxEvent_orgId_processedAt_createdAt_idx" ON "OutboxEvent"("orgId", "processedAt", "createdAt");

-- The unique index below also covers (orgId, kind, entityId) lookups;
-- a separate non-unique index with the same name would collide (42P07).
CREATE UNIQUE INDEX "SearchDocument_orgId_kind_entityId_key" ON "SearchDocument"("orgId", "kind", "entityId");

CREATE INDEX "SearchDocument_orgId_kind_published_idx" ON "SearchDocument"("orgId", "kind", "published");

ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SearchDocument" ADD CONSTRAINT "SearchDocument_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── W13: Extensions ────────────────────────────────────────────────────────

CREATE TYPE "PluginStatus" AS ENUM ('ENABLED', 'DISABLED');

CREATE TABLE "Plugin" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "status" "PluginStatus" NOT NULL DEFAULT 'ENABLED',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plugin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookSubscription" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "outboxEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" TEXT NOT NULL,
    "timestampMs" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Plugin_orgId_name_key" ON "Plugin"("orgId", "name");

CREATE INDEX "Plugin_orgId_status_idx" ON "Plugin"("orgId", "status");

CREATE INDEX "WebhookSubscription_orgId_isActive_idx" ON "WebhookSubscription"("orgId", "isActive");

CREATE INDEX "WebhookDelivery_orgId_status_idx" ON "WebhookDelivery"("orgId", "status");

CREATE INDEX "WebhookDelivery_subscriptionId_status_idx" ON "WebhookDelivery"("subscriptionId", "status");

ALTER TABLE "Plugin" ADD CONSTRAINT "Plugin_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WebhookSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── W12/W14: Analytics & Rate limiting ─────────────────────────────────────

CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "properties" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateLimitPolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "limit" INTEGER NOT NULL,
    "windowSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateLimitCounter" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnalyticsEvent_orgId_name_version_occurredAt_idx" ON "AnalyticsEvent"("orgId", "name", "version", "occurredAt");

CREATE INDEX "AnalyticsEvent_orgId_sessionId_idx" ON "AnalyticsEvent"("orgId", "sessionId");

CREATE UNIQUE INDEX "RateLimitPolicy_orgId_route_key" ON "RateLimitPolicy"("orgId", "route");

CREATE INDEX "RateLimitPolicy_orgId_idx" ON "RateLimitPolicy"("orgId");

CREATE UNIQUE INDEX "RateLimitCounter_orgId_route_windowKey_key" ON "RateLimitCounter"("orgId", "route", "windowKey");

CREATE INDEX "RateLimitCounter_orgId_windowKey_idx" ON "RateLimitCounter"("orgId", "windowKey");

ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RateLimitPolicy" ADD CONSTRAINT "RateLimitPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RateLimitCounter" ADD CONSTRAINT "RateLimitCounter_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
