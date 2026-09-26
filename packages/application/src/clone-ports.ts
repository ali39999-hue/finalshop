import type { CloneManifest, CloneProfileName, OverrideEntry } from "@finalshop/domain";

export type { CloneManifest, CloneProfileName, OverrideEntry };

/**
 * Clone/fork ports (W9). A ForkLink records the parent←child relationship of
 * one inherited entity plus its per-field overrides; a CloneManifest records
 * one clone run's full mapping (CLONE-003).
 */

export type ForkEntityType = "theme" | "page" | "priceList";

export type ForkLinkStatus = "ACTIVE" | "DETACHED";

export interface ForkLinkRecord {
  id: string;
  /** The child (fork) organization. */
  orgId: string;
  entityType: ForkEntityType;
  entityId: string;
  parentOrgId: string;
  parentEntityId: string;
  overrides: Record<string, OverrideEntry | undefined>;
  status: ForkLinkStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CloneManifestRecord {
  id: string;
  /** The target (child) organization. */
  orgId: string;
  sourceOrgId: string;
  profile: CloneProfileName;
  manifest: CloneManifest;
  createdAt: Date;
}

export interface ForkLinkRepository {
  create(input: {
    orgId: string;
    entityType: ForkEntityType;
    entityId: string;
    parentOrgId: string;
    parentEntityId: string;
  }): Promise<ForkLinkRecord>;
  findById(id: string): Promise<ForkLinkRecord | null>;
  listByOrg(orgId: string): Promise<ForkLinkRecord[]>;
  setOverrides(input: {
    id: string;
    orgId: string;
    overrides: Record<string, OverrideEntry | undefined>;
  }): Promise<ForkLinkRecord>;
  markDetached(input: { id: string; orgId: string }): Promise<ForkLinkRecord>;
}

export interface CloneManifestRepository {
  create(input: {
    orgId: string;
    sourceOrgId: string;
    profile: CloneProfileName;
    manifest: CloneManifest;
  }): Promise<CloneManifestRecord>;
  findById(id: string): Promise<CloneManifestRecord | null>;
  listByOrg(orgId: string, limit?: number): Promise<CloneManifestRecord[]>;
}
