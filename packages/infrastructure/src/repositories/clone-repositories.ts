import type {
  CloneManifest as CloneManifestRow,
  ForkLink,
  ForkLinkStatus,
  PrismaClient,
} from "@prisma/client";
import {
  DomainError,
  type CloneManifest,
  type CloneProfileName,
} from "@finalshop/domain";
import type {
  CloneManifestRecord,
  CloneManifestRepository,
  ForkEntityType,
  ForkLinkRecord,
  ForkLinkRepository,
  OverrideEntry,
} from "@finalshop/application";

const toForkLink = (row: ForkLink): ForkLinkRecord => ({
  id: row.id,
  orgId: row.orgId,
  entityType: row.entityType as ForkEntityType,
  entityId: row.entityId,
  parentOrgId: row.parentOrgId,
  parentEntityId: row.parentEntityId,
  overrides: (row.overrides as Record<string, OverrideEntry | undefined>) ?? {},
  status: row.status as ForkLinkStatus,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toManifest = (row: CloneManifestRow): CloneManifestRecord => ({
  id: row.id,
  orgId: row.orgId,
  sourceOrgId: row.sourceOrgId,
  profile: row.profile as CloneProfileName,
  manifest: row.manifest as unknown as CloneManifest,
  createdAt: row.createdAt,
});

const json = (value: unknown) => value as never;

/** Prisma implementations of the clone/fork ports (W9). */
export function createCloneRepositories(db: PrismaClient): {
  forkLinks: ForkLinkRepository;
  cloneManifests: CloneManifestRepository;
} {
  const forkLinks: ForkLinkRepository = {
    create: async (input) => {
      const row = await db.forkLink.create({
        data: {
          orgId: input.orgId,
          entityType: input.entityType,
          entityId: input.entityId,
          parentOrgId: input.parentOrgId,
          parentEntityId: input.parentEntityId,
          overrides: json({}),
        },
      });
      return toForkLink(row);
    },
    findById: async (id) => {
      const row = await db.forkLink.findUnique({ where: { id } });
      return row ? toForkLink(row) : null;
    },
    listByOrg: async (orgId) => {
      const rows = await db.forkLink.findMany({
        where: { orgId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toForkLink);
    },
    setOverrides: async (input) => {
      const existing = await db.forkLink.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("FORK_LINK_NOT_FOUND", input.id);
      const row = await db.forkLink.update({
        where: { id: input.id },
        data: { overrides: json(input.overrides) },
      });
      return toForkLink(row);
    },
    markDetached: async (input) => {
      const existing = await db.forkLink.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("FORK_LINK_NOT_FOUND", input.id);
      const row = await db.forkLink.update({
        where: { id: input.id },
        data: { status: "DETACHED" },
      });
      return toForkLink(row);
    },
  };

  const cloneManifests: CloneManifestRepository = {
    create: async (input) => {
      const row = await db.cloneManifest.create({
        data: {
          orgId: input.orgId,
          sourceOrgId: input.sourceOrgId,
          profile: input.profile,
          manifest: json(input.manifest),
        },
      });
      return toManifest(row);
    },
    findById: async (id) => {
      const row = await db.cloneManifest.findUnique({ where: { id } });
      return row ? toManifest(row) : null;
    },
    listByOrg: async (orgId, limit = 50) => {
      const rows = await db.cloneManifest.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return rows.map(toManifest);
    },
  };

  return { forkLinks, cloneManifests };
}
