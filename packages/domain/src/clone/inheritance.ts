/**
 * Inheritance model (FORK-001/002, roadmap §12.3):
 * EffectiveValue = ParentBase + ChildOverrides + LocalRuntimeContext, with a
 * per-field status of inherited | overridden | detached. Sync transfers
 * parent changes onto inherited fields, surfaces conflicts for overridden
 * fields (review before applying), and never touches detached fields.
 */

export type OverrideStatus = "inherited" | "overridden" | "detached";

export interface OverrideEntry {
  status: OverrideStatus;
  value?: unknown;
}

export interface SyncConflict {
  field: string;
  parentValue: unknown;
  childValue: unknown;
}

export interface SyncPlan {
  updates: Array<{ field: string; value: unknown }>;
  conflicts: SyncConflict[];
  skipped: string[];
}

/**
 * Plans the sync of a parent record onto a child record. `fields` is the
 * inheritable field whitelist for the entity kind. A field the child has
 * detached is skipped; a field the child overrode becomes a conflict; an
 * inherited field whose values differ becomes an update.
 */
export function planSync(
  parent: Record<string, unknown>,
  child: Record<string, unknown>,
  fields: readonly string[],
  overrides: Record<string, OverrideEntry | undefined> = {},
): SyncPlan {
  const updates: Array<{ field: string; value: unknown }> = [];
  const conflicts: SyncConflict[] = [];
  const skipped: string[] = [];
  for (const field of fields) {
    const entry = overrides[field];
    const status = entry?.status ?? "inherited";
    if (status === "detached") {
      skipped.push(field);
      continue;
    }
    const parentValue = parent[field];
    const childValue = child[field];
    if (JSON.stringify(parentValue) === JSON.stringify(childValue)) continue;
    if (status === "overridden") {
      conflicts.push({ field, parentValue, childValue });
      continue;
    }
    updates.push({ field, value: parentValue });
  }
  return { updates, conflicts, skipped };
}

/**
 * FORK-002: applies reviewed conflict resolutions — an override with an
 * explicit value wins over the parent value; detaching removes the field
 * from future syncs.
 */
export function applyOverrideDecision(
  overrides: Record<string, OverrideEntry | undefined>,
  field: string,
  decision: OverrideEntry,
): Record<string, OverrideEntry | undefined> {
  return { ...overrides, [field]: decision };
}
