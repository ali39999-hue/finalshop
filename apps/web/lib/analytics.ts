import { trackEvent } from "@finalshop/application";
import type { Repositories } from "@finalshop/application";
import type { TenantContext } from "@finalshop/domain";

/**
 * Fire-and-forget analytics wrapper: telemetry failures must never break a
 * shopper page or action (roadmap §15 — telemetry is best-effort at the edge).
 * Skips silently when no visitor id exists yet (first request before the
 * middleware cookie lands) — anonymous events would pollute funnels.
 */
export async function track(
  repos: Repositories,
  ctx: TenantContext,
  name: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  try {
    if (!ctx.userId) return;
    await trackEvent(repos, ctx, {
      orgId: ctx.orgId,
      sessionId: ctx.userId,
      name,
      properties,
      userId: ctx.userId,
    });
  } catch {
    // Analytics must never break the shopper journey.
  }
}
