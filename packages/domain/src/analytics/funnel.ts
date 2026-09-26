import { DomainError } from "../errors";

/**
 * Funnels (W12): session-ordered step progression. A session counts for
 * step N only if it fired every previous step (in order) before it. Pure and
 * deterministic — dashboards render, the kernel computes.
 */

export interface FunnelStep {
  eventName: string;
}

export interface FunnelEvent {
  name: string;
  sessionId: string;
  occurredAt: Date;
}

export interface FunnelResult {
  /** Sessions that reached each step, index-aligned with the steps. */
  counts: number[];
  /** counts[i] / counts[i-1] (1 for the first step). */
  conversionRates: number[];
  totalSessions: number;
}

export function computeFunnel(
  events: FunnelEvent[],
  steps: FunnelStep[],
): FunnelResult {
  if (steps.length === 0) {
    throw new DomainError("FUNNEL_INVALID", "a funnel needs at least one step");
  }
  const bySession = new Map<string, FunnelEvent[]>();
  for (const event of events) {
    const list = bySession.get(event.sessionId) ?? [];
    list.push(event);
    bySession.set(event.sessionId, list);
  }

  const counts = new Array<number>(steps.length).fill(0);
  for (const [, sessionEvents] of bySession) {
    const sorted = [...sessionEvents].sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
    );
    let stepIndex = 0;
    for (const event of sorted) {
      if (event.name === steps[stepIndex]!.eventName) {
        counts[stepIndex]! += 1;
        stepIndex += 1;
        if (stepIndex >= steps.length) break;
      }
    }
  }

  const conversionRates = counts.map((count, i) =>
    i === 0 ? (counts[0]! > 0 ? 1 : 0) : counts[i - 1]! > 0 ? count / counts[i - 1]! : 0,
  );
  return { counts, conversionRates, totalSessions: bySession.size };
}
