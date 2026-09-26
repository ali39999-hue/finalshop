import { z } from "zod";
import {
  DomainError,
  evaluatePolicy,
  type TenantContext,
  assertEventPropertiesSafe,
  computeFunnel,
  parseEventName,
  windowKey,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { FunnelResult } from "@finalshop/domain";
import type { Repositories } from "../ports";

const TrackEventInput = z.object({
  orgId: z.string().min(1),
  sessionId: z.string().min(6).max(128),
  name: z.string().min(3).max(100),
  properties: z.record(z.string(), z.unknown()).default({}),
  userId: z.string().min(1).optional(),
});

/**
 * W12: public storefront ingest. Requires a tenant context (the storefront
 * knows the org after domain resolution) but no staff role; PII and size
 * guards are the domain's job.
 */
export async function trackEvent(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof TrackEventInput>,
) {
  const parsed = TrackEventInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const { base, version } = parseEventName(parsed.name);
  assertEventPropertiesSafe(parsed.properties);
  const record = await repos.analyticsEvents.append({
    orgId: parsed.orgId,
    name: base,
    version,
    sessionId: parsed.sessionId,
    ...(parsed.userId !== undefined && { userId: parsed.userId }),
    properties: parsed.properties,
    occurredAt: new Date(),
  });
  return record;
}

const FunnelReportInput = z.object({
  orgId: z.string().min(1),
  steps: z
    .array(z.string().min(3).max(100))
    .min(1)
    .max(10),
  from: z.date(),
  to: z.date(),
});

/** W12: funnel conversion across the tenant's collected events. */
export async function funnelReport(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof FunnelReportInput>,
): Promise<FunnelResult> {
  const parsed = FunnelReportInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "analytics.read");
  if (parsed.from >= parsed.to) {
    throw new DomainError("FUNNEL_INVALID", "from must precede to");
  }
  const steps = parsed.steps.map((step) => {
    const { base, version } = parseEventName(step);
    return { eventName: `${base}@${version}` };
  });
  const events = await repos.analyticsEvents.listByNames({
    orgId: parsed.orgId,
    names: steps.map((s) => s.eventName),
    from: parsed.from,
    to: parsed.to,
  });
  return computeFunnel(
    events.map((e) => ({
      name: `${e.name}@${e.version}`,
      sessionId: e.sessionId,
      occurredAt: e.occurredAt,
    })),
    steps,
  );
}

const CheckRateLimitInput = z.object({
  orgId: z.string().min(1),
  route: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(100_000),
  windowSeconds: z.number().int().min(1).max(3600),
});

/**
 * W14: edge-middleware helper (system context — the middleware runs before
 * any handler). Increments the tenant+route counter atomically and returns
 * the verdict for the fixed window.
 */
export async function checkRateLimit(
  repos: Repositories,
  input: z.input<typeof CheckRateLimitInput>,
) {
  const parsed = CheckRateLimitInput.parse(input);
  const now = new Date();
  const key = windowKey(now, parsed.windowSeconds);
  const hits = await repos.rateLimitCounters.incrementHits({
    orgId: parsed.orgId,
    route: parsed.route,
    windowKey: key,
  });
  return evaluatePolicy(
    { route: parsed.route, limit: parsed.limit, windowSeconds: parsed.windowSeconds },
    hits,
    now,
  );
}

const PolicyInput = z.object({
  orgId: z.string().min(1),
  route: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(100_000),
  windowSeconds: z.number().int().min(1).max(3600),
});

export async function createRateLimitPolicy(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof PolicyInput>,
) {
  const parsed = PolicyInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "extension.manage");
  requireUserId(ctx);
  return repos.rateLimitPolicies.upsert({
    orgId: parsed.orgId,
    route: parsed.route,
    limit: parsed.limit,
    windowSeconds: parsed.windowSeconds,
  });
}

export async function listRateLimitPolicies(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string },
) {
  const parsed = z.object({ orgId: z.string().min(1) }).parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "extension.manage");
  return repos.rateLimitPolicies.listByOrg(parsed.orgId);
}
