import type { CloneEntityKind, CloneProfileName } from "./profiles";

/**
 * Clone manifest (CLONE-003, roadmap §12.2 steps 5–10): every clone emits a
 * manifest — entity mappings, warnings, and skipped entities — so support,
 * audit, and rollback always have the full picture.
 */

export interface ManifestEntry {
  kind: CloneEntityKind;
  sourceId: string;
  targetId: string;
}

export interface CloneManifest {
  profile: CloneProfileName;
  sourceOrgId: string;
  targetOrgId: string;
  entries: ManifestEntry[];
  warnings: string[];
  createdAt: string;
}

export function buildManifest(input: {
  profile: CloneProfileName;
  sourceOrgId: string;
  targetOrgId: string;
  entries: ManifestEntry[];
  warnings?: string[];
}): CloneManifest {
  return Object.freeze({
    profile: input.profile,
    sourceOrgId: input.sourceOrgId,
    targetOrgId: input.targetOrgId,
    entries: [...input.entries],
    warnings: [...(input.warnings ?? [])],
    createdAt: new Date().toISOString(),
  });
}

/** Rewrites a source id through the manifest; unmapped ids return null. */
export function remapId(
  manifest: CloneManifest,
  kind: CloneEntityKind,
  sourceId: string,
): string | null {
  return (
    manifest.entries.find(
      (entry) => entry.kind === kind && entry.sourceId === sourceId,
    )?.targetId ?? null
  );
}

/** Adds a warning for source references that could not be remapped. */
export function warningForUnmapped(
  kind: CloneEntityKind,
  sourceId: string,
): string {
  return `${kind}/${sourceId}: source reference not part of the cloned set`;
}
