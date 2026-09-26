import { z } from "zod";
import {
  DomainError,
  type OverrideEntry,
  type TenantContext,
  planSync,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { ForkLinkRecord, ForkEntityType } from "../clone-ports";
import type { Repositories } from "../ports";

/** Per-entity-type inheritable fields (roadmap §12.3 whitelist). */
const INHERITED_FIELDS: Record<ForkEntityType, readonly string[]> = {
  theme: ["tokens"],
  page: ["schema"],
  priceList: ["priority"],
};

/** Permission per entity type keeps fork management inside owning domains. */
function requireForkPermission(ctx: TenantContext, entityType: ForkEntityType): void {
  if (entityType === "page") requirePermission(ctx, "cms.manage");
  else if (entityType === "theme") requirePermission(ctx, "theme.manage");
  else requirePermission(ctx, "price.update");
}

async function loadActiveLink(
  repos: Repositories,
  orgId: string,
  forkLinkId: string,
): Promise<ForkLinkRecord> {
  const link = await repos.forkLinks.findById(forkLinkId);
  if (!link || link.orgId !== orgId) {
    throw new DomainError("FORK_LINK_NOT_FOUND", `fork link ${forkLinkId} not found`);
  }
  if (link.status !== "ACTIVE") {
    throw new DomainError("FORK_LINK_DETACHED", "fork link is detached");
  }
  return link;
}

/** FORK-001: override or detach a field on a forked entity. */
export async function applyOverride(
  repos: Repositories,
  ctx: TenantContext,
  input: {
    orgId: string;
    forkLinkId: string;
    field: string;
    decision: "overridden" | "detached";
    value?: unknown;
  },
) {
  const parsed = z
    .object({
      orgId: z.string().min(1),
      forkLinkId: z.string().min(1),
      field: z.string().min(1).max(100),
      decision: z.enum(["overridden", "detached"]),
      value: z.unknown().optional(),
    })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const link = await loadActiveLink(repos, parsed.orgId, parsed.forkLinkId);
  requireForkPermission(ctx, link.entityType);
  requireUserId(ctx);
  if (!INHERITED_FIELDS[link.entityType].includes(parsed.field)) {
    throw new DomainError(
      "FORK_FIELD_NOT_INHERITABLE",
      `field ${parsed.field} is not inheritable for ${link.entityType}`,
    );
  }
  const entry: OverrideEntry =
    parsed.decision === "detached"
      ? { status: "detached" }
      : { status: "overridden", value: parsed.value };
  const overrides = { ...link.overrides, [parsed.field]: entry };
  return repos.forkLinks.setOverrides({
    id: link.id,
    orgId: parsed.orgId,
    overrides,
  });
}

/**
 * FORK-002: syncs the parent's current values onto the child. Inherited
 * fields update automatically; overridden fields become conflicts for review
 * (apply the reviewed values via applyOverride first); detached fields are
 * skipped entirely.
 */
export async function syncFromParent(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; forkLinkId: string; force?: boolean },
) {
  const parsed = z
    .object({
      orgId: z.string().min(1),
      forkLinkId: z.string().min(1),
      force: z.boolean().default(false),
    })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const link = await repos.forkLinks.findById(parsed.forkLinkId);
  if (!link || link.orgId !== parsed.orgId) {
    throw new DomainError("FORK_LINK_NOT_FOUND", `fork link ${parsed.forkLinkId} not found`);
  }
  requireForkPermission(ctx, link.entityType);
  requireUserId(ctx);
  const fields = INHERITED_FIELDS[link.entityType];
  // A detached link has left inheritance: sync is a no-op, never an error.
  if (link.status === "DETACHED") {
    return { applied: 0, conflicts: [], skipped: [...fields] };
  }

  const parentRecord = await loadEntityRecord(
    repos,
    link.parentOrgId,
    link.entityType,
    link.parentEntityId,
  );
  const childRecord = await loadEntityRecord(
    repos,
    link.orgId,
    link.entityType,
    link.entityId,
  );
  const plan = planSync(
    parentRecord as Record<string, unknown>,
    childRecord as Record<string, unknown>,
    fields,
    link.overrides,
  );

  if (plan.conflicts.length > 0 && !parsed.force) {
    return { applied: 0, conflicts: plan.conflicts, skipped: plan.skipped };
  }
  for (const update of plan.updates) {
    await applyFieldValue(repos, link, update.field, update.value);
  }
  for (const conflict of plan.conflicts) {
    // Force: the reviewed decision takes the parent's value.
    await applyFieldValue(repos, link, conflict.field, conflict.parentValue);
  }
  return {
    applied: plan.updates.length + (parsed.force ? plan.conflicts.length : 0),
    conflicts: parsed.force ? [] : plan.conflicts,
    skipped: plan.skipped,
  };
}

/** FORK-001: detaches the child entity from the parent for good. */
export async function detachFork(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; forkLinkId: string },
) {
  const parsed = z
    .object({ orgId: z.string().min(1), forkLinkId: z.string().min(1) })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const link = await loadActiveLink(repos, parsed.orgId, parsed.forkLinkId);
  requireForkPermission(ctx, link.entityType);
  requireUserId(ctx);
  return repos.forkLinks.markDetached({ id: link.id, orgId: parsed.orgId });
}

export async function listForkLinks(repos: Repositories, ctx: TenantContext, input: {
  orgId: string;
}) {
  const parsed = z.object({ orgId: z.string().min(1) }).parse(input);
  requireSameTenant(ctx, parsed.orgId);
  return repos.forkLinks.listByOrg(parsed.orgId);
}

async function loadEntityRecord(
  repos: Repositories,
  orgId: string,
  entityType: ForkEntityType,
  entityId: string,
): Promise<unknown> {
  if (entityType === "theme") {
    const theme = await repos.themes.findById(entityId);
    if (!theme || theme.orgId !== orgId) {
      throw new DomainError("FORK_PARENT_MISSING", entityId);
    }
    return { tokens: theme.tokens };
  }
  if (entityType === "page") {
    const latest = await repos.pageRevisions.latestNumber(orgId, entityId);
    const revision =
      latest !== null
        ? await repos.pageRevisions.findByNumber(orgId, entityId, latest)
        : null;
    if (!revision) throw new DomainError("FORK_PARENT_MISSING", entityId);
    return { schema: revision.schema };
  }
  const priceList = await repos.priceLists.findById(entityId);
  if (!priceList || priceList.orgId !== orgId) {
    throw new DomainError("FORK_PARENT_MISSING", entityId);
  }
  return { priority: priceList.priority };
}

async function applyFieldValue(
  repos: Repositories,
  link: ForkLinkRecord,
  field: string,
  value: unknown,
): Promise<void> {
  if (link.entityType === "theme" && field === "tokens") {
    await repos.themes.setTokens({
      id: link.entityId,
      orgId: link.orgId,
      tokens: value as ThemeTokensLike,
    });
  } else if (link.entityType === "page" && field === "schema") {
    const latest = await repos.pageRevisions.latestNumber(link.orgId, link.entityId);
    // A sync lands as a NEW child revision — history stays append-only.
    await repos.pageRevisions.create({
      orgId: link.orgId,
      pageId: link.entityId,
      revisionNumber: (latest ?? 0) + 1,
      schema: value as PageSchemaLike,
      seo: {},
      authorId: "system-fork-sync",
    });
  } else if (link.entityType === "priceList" && field === "priority") {
    await repos.priceLists.setPriority({
      id: link.entityId,
      orgId: link.orgId,
      priority: value as number,
    });
  }
}

interface ThemeTokensLike {
  colors: Record<string, string>;
  typography: { fontFamily: string; scale: Record<string, number> };
  spacing: Record<string, number>;
  radius: Record<string, number>;
  shadow: Record<string, string>;
  motion: { durationMs: number; easing: string };
}

interface PageSchemaLike {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: PageSchemaLike[];
}
