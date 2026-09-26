import { describe, expect, it } from "vitest";
import { computeWeeklyRetention, weekBucketStart } from "./retention";
import type { FunnelEvent } from "./funnel";

const at = (iso: string) => new Date(iso);

const events: FunnelEvent[] = [
  // Cohort week (both sessions first seen in the same week).
  { name: "session.started@1", sessionId: "s1", occurredAt: at("2026-09-07T10:00:00Z") },
  { name: "cart.updated@1", sessionId: "s1", occurredAt: at("2026-09-08T10:00:00Z") },
  { name: "session.started@1", sessionId: "s2", occurredAt: at("2026-09-09T10:00:00Z") },
  // Week +1: only s1 returns.
  { name: "session.started@1", sessionId: "s1", occurredAt: at("2026-09-15T10:00:00Z") },
  // Week +2: s1 and s2 return.
  { name: "session.started@1", sessionId: "s1", occurredAt: at("2026-09-22T10:00:00Z") },
  { name: "session.started@1", sessionId: "s2", occurredAt: at("2026-09-23T10:00:00Z") },
  // A later session (not part of the cohort) must be ignored.
  { name: "session.started@1", sessionId: "s3", occurredAt: at("2026-09-24T10:00:00Z") },
];

describe("cohort retention (W12)", () => {
  it("buckets sessions by their first-seen week", () => {
    const start = weekBucketStart(at("2026-09-09T10:00:00Z"));
    expect(start.toISOString()).toBe("2026-09-06T00:00:00.000Z");
  });

  it("computes weekly retention relative to cohort size", () => {
    const result = computeWeeklyRetention(events, at("2026-09-07T00:00:00Z"), 3);
    expect(result.cohortSize).toBe(2);
    expect(result.retainedByWeek).toEqual([2, 1, 2]);
    expect(result.retentionRates[0]).toBe(1);
    expect(result.retentionRates[1]).toBeCloseTo(0.5);
    expect(result.retentionRates[2]).toBe(1);
  });

  it("validates the horizon", () => {
    expect(() => computeWeeklyRetention(events, at("2026-09-07T00:00:00Z"), 0)).toThrow(
      expect.objectContaining({ code: "RETENTION_INVALID" }),
    );
    expect(() => computeWeeklyRetention(events, at("2026-09-07T00:00:00Z"), 53)).toThrow();
  });
});
