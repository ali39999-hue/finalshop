import { DomainError } from "../errors";
import type { FunnelEvent } from "../analytics/funnel";

/**
 * Cohort retention (W12): sessions are bucketed into the calendar week of
 * their first event; each subsequent week counts sessions that returned.
 * Retention rates are relative to the cohort size — pure and deterministic.
 */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function weekBucketStart(at: Date): Date {
  const day = at.getUTCDay(); // 0 = Sunday
  const start = Date.UTC(
    at.getUTCFullYear(),
    at.getUTCMonth(),
    at.getUTCDate() - day,
  );
  return new Date(start);
}

export interface CohortRetentionResult {
  cohortStart: Date;
  cohortSize: number;
  /** Active sessions per week offset from the cohort week (index 0 = cohort week). */
  retainedByWeek: number[];
  retentionRates: number[];
}

export function computeWeeklyRetention(
  events: FunnelEvent[],
  cohortWeekStart: Date,
  weeks: number,
): CohortRetentionResult {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
    throw new DomainError("RETENTION_INVALID", `weeks ${weeks}`);
  }
  const cohortStartMs = weekBucketStart(cohortWeekStart).getTime();
  const firstSeen = new Map<string, number>();
  const activeWeeks = new Map<string, Set<number>>();

  for (const event of events) {
    const time = event.occurredAt.getTime();
    const weekOffset = Math.floor((time - cohortStartMs) / WEEK_MS);
    if (weekOffset < 0) continue;
    if (!firstSeen.has(event.sessionId)) {
      firstSeen.set(event.sessionId, weekOffset);
      activeWeeks.set(event.sessionId, new Set([weekOffset]));
    } else {
      const buckets = activeWeeks.get(event.sessionId)!;
      buckets.add(weekOffset);
    }
  }

  const cohortSessionIds = [...firstSeen.entries()]
    .filter(([, firstWeek]) => firstWeek === 0)
    .map(([sessionId]) => sessionId);
  const cohortSize = cohortSessionIds.length;

  const retainedByWeek = new Array<number>(weeks).fill(0);
  for (const sessionId of cohortSessionIds) {
    const buckets = activeWeeks.get(sessionId)!;
    for (let offset = 0; offset < weeks; offset += 1) {
      if (buckets.has(offset)) retainedByWeek[offset]! += 1;
    }
  }

  const retentionRates = retainedByWeek.map((count) =>
    cohortSize === 0 ? 0 : count / cohortSize,
  );
  return {
    cohortStart: weekBucketStart(cohortWeekStart),
    cohortSize,
    retainedByWeek,
    retentionRates,
  };
}
