import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type CloneEntityKind,
  type CloneManifest,
  type TenantContext,
  buildAuditEvent,
  buildManifest,
  CLONE_PROFILES,
  collectPageAssetIds,
  type CloneProfileName,
  type ManifestEntry,
  topologicalSort,
  warningForUnmapped,
  type DependencyNode,
} from "@finalshop/domain";
import { requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const CloneStoreInput = z.object({
  sourceOrgId: z.string().min(1),
  targetOrgId: z.string().min(1),
  profile: z.enum([
    "THEME_ONLY",
    "STORE_BLUEPRINT",
    "FULL_LAUNCH_SEED",
    "SANDBOX",
    "CHILD_BRANCH",
  ]),
});

export type CloneStoreInput = z.input<typeof CloneStoreInput>;

/** Only the source org's OWNER may clone out of it (roadmap §12.2 step 1). */
function assertCloneAuthorized(ctx: TenantContext, sourceOrgId: string): void {
  requireUserId(ctx);
  if (ctx.role !== "OWNER" || ctx.orgId !== sourceOrgId) {
    throw new DomainError(
      "CLONE_UNAUTHORIZED",
      "only the source organization owner may clone",
    );
  }
}

/**
 * W9 flagship: clones a store's clonable structure into a target org
 * following the §12.2 algorithm — snapshot, dependency graph, topological
 * copy with ID remap, manifest with warnings. Orders, payments, customers
 * and secrets are never copied (profile whitelist).
 */
export async function cloneStore(
  repos: Repositories,
  ctx: TenantContext,
  input: CloneStoreInput,
): Promise<{ manifest: CloneManifest }> {
  const parsed = CloneStoreInput.parse(input);
  assertCloneAuthorized(ctx, parsed.sourceOrgId);
  if (parsed.sourceOrgId === parsed.targetOrgId) {
    throw new DomainError("CLONE_SAME_ORG", "source and target must differ");
  }
  const target = await repos.organizations.findById(parsed.targetOrgId);
  if (!target) {
    throw new DomainError("ORG_TARGET_NOT_FOUND", parsed.targetOrgId);
  }
  const profile = parsed.profile as CloneProfileName;
  const kinds = CLONE_PROFILES[profile] as readonly CloneEntityKind[];
  const allows = (kind: CloneEntityKind): boolean => kinds.includes(kind);
  const src = parsed.sourceOrgId;
  const dst = parsed.targetOrgId;

  const entries: ManifestEntry[] = [];
  const warnings: string[] = [];
  const remapped = (kind: CloneEntityKind, sourceId: string): string =>
    entries.find((e) => e.kind === kind && e.sourceId === sourceId)?.targetId ?? sourceId;

  // ── Gather source snapshots (only whitelisted kinds) ──
  const srcThemes = allows("theme") ? await repos.themes.listByOrg(src) : [];
  const srcPages = allows("page") ? await repos.pages.listByOrg(src) : [];
  const srcProducts = allows("product") ? await repos.products.listByOrg(src) : [];
  const srcVariants = allows("variant")
    ? (
        await Promise.all(
          srcProducts.map((p) => repos.variants.listByProduct(src, p.id)),
        )
      ).flat()
    : [];
  const srcCategories = allows("category") ? await repos.categories.listByOrg(src) : [];
  const srcCollections = allows("collection")
    ? await repos.collections.listByOrg(src)
    : [];
  const srcPriceLists = allows("priceList") ? await repos.priceLists.listByOrg(src) : [];
  const srcPrices = allows("price")
    ? (
        await Promise.all(
          srcVariants.map((v) =>
            repos.prices.listForVariant(
              src,
              v.id,
              srcPriceLists.map((pl) => pl.id),
            ),
          ),
        )
      ).flat()
    : [];
  const srcShippingRates = allows("shippingRate")
    ? await repos.shippingRates.listByOrg(src)
    : [];
  const srcAssets = allows("asset") ? await repos.assets.listByOrg(src) : [];

  // ── Dependency graph + topological order (CLONE-002) ──
  const nodes: DependencyNode[] = [];
  for (const theme of srcThemes) {
    nodes.push({ kind: "theme", sourceId: theme.id, deps: [] });
  }
  for (const page of srcPages) {
    const revisionNumber = await repos.pageRevisions.latestNumber(src, page.id);
    const revision =
      revisionNumber !== null
        ? await repos.pageRevisions.findByNumber(src, page.id, revisionNumber)
        : null;
    const assetDeps = revision
      ? collectPageAssetIds(revision.schema).map((assetId) => ({
          kind: "asset" as const,
          sourceId: assetId,
        }))
      : [];
    nodes.push({ kind: "page", sourceId: page.id, deps: assetDeps });
  }
  for (const product of srcProducts) {
    nodes.push({ kind: "product", sourceId: product.id, deps: [] });
  }
  for (const variant of srcVariants) {
    nodes.push({
      kind: "variant",
      sourceId: variant.id,
      deps: [{ kind: "product", sourceId: variant.productId }],
    });
  }
  for (const category of srcCategories) {
    nodes.push({
      kind: "category",
      sourceId: category.id,
      deps: category.parentId
        ? [{ kind: "category", sourceId: category.parentId }]
        : [],
    });
  }
  for (const collection of srcCollections) {
    nodes.push({ kind: "collection", sourceId: collection.id, deps: [] });
  }
  for (const priceList of srcPriceLists) {
    nodes.push({ kind: "priceList", sourceId: priceList.id, deps: [] });
  }
  for (const price of srcPrices) {
    nodes.push({
      kind: "price",
      sourceId: price.id,
      deps: [
        { kind: "priceList", sourceId: price.priceListId },
        { kind: "variant", sourceId: price.variantId },
      ],
    });
  }
  for (const rate of srcShippingRates) {
    nodes.push({ kind: "shippingRate", sourceId: rate.id, deps: [] });
  }
  for (const asset of srcAssets) {
    nodes.push({ kind: "asset", sourceId: asset.id, deps: [] });
  }

  // ── Topological copy with ID remap (CLONE-003) ──
  for (const node of topologicalSort(nodes)) {
    switch (node.kind) {
      case "theme": {
        const source = srcThemes.find((t) => t.id === node.sourceId)!;
        const copy = await repos.themes.create({
          orgId: dst,
          name: source.name,
          tokens: source.tokens,
        });
        for (const template of await repos.themeTemplates.listByTheme(src, source.id)) {
          await repos.themeTemplates.create({
            orgId: dst,
            themeId: copy.id,
            name: template.name,
            kind: template.kind,
            root: template.root,
          });
        }
        entries.push({ kind: "theme", sourceId: source.id, targetId: copy.id });
        break;
      }
      case "page": {
        const source = srcPages.find((p) => p.id === node.sourceId)!;
        const revisionNumber = await repos.pageRevisions.latestNumber(src, source.id);
        const revision =
          revisionNumber !== null
            ? await repos.pageRevisions.findByNumber(src, source.id, revisionNumber)
            : null;
        if (!revision) {
          warnings.push(warningForUnmapped("page", `${source.id}: no revisions`));
          break;
        }
        const copy = await repos.pages.create({
          orgId: dst,
          slug: source.slug,
          title: source.title,
          locale: source.locale,
        });
        await repos.pageRevisions.create({
          orgId: dst,
          pageId: copy.id,
          revisionNumber: 1,
          schema: revision.schema,
          seo: revision.seo,
          authorId: ctx.userId!,
        });
        if (!allows("asset") && collectPageAssetIds(revision.schema).length > 0) {
          warnings.push(
            `page/${source.id}: references assets that were not cloned by profile ${profile}`,
          );
        }
        entries.push({ kind: "page", sourceId: source.id, targetId: copy.id });
        break;
      }
      case "product": {
        const source = srcProducts.find((p) => p.id === node.sourceId)!;
        const copy = await repos.products.create({
          orgId: dst,
          slug: source.slug,
          title: source.title,
          description: source.description ?? undefined,
          options: source.options,
        });
        entries.push({ kind: "product", sourceId: source.id, targetId: copy.id });
        break;
      }
      case "variant": {
        const source = srcVariants.find((v) => v.id === node.sourceId)!;
        const copy = await repos.variants.create({
          orgId: dst,
          productId: remapped("product", source.productId),
          sku: source.sku,
          barcode: source.barcode ?? undefined,
          optionValues: source.optionValues,
          weightGrams: source.weightGrams ?? undefined,
        });
        entries.push({ kind: "variant", sourceId: source.id, targetId: copy.id });
        break;
      }
      case "category": {
        const source = srcCategories.find((c) => c.id === node.sourceId)!;
        const copy = await repos.categories.create({
          orgId: dst,
          parentId: source.parentId ?? undefined,
          slug: source.slug,
          name: source.name,
        });
        entries.push({ kind: "category", sourceId: source.id, targetId: copy.id });
        break;
      }
      case "collection": {
        const source = srcCollections.find((c) => c.id === node.sourceId)!;
        const copy = await repos.collections.create({
          orgId: dst,
          slug: source.slug,
          name: source.name,
          kind: source.kind,
        });
        const productIds = await repos.collections.listProductIds(src, source.id);
        const remappedIds = productIds
          .map((id) => remapped("product", id))
          .filter((id) => id !== undefined);
        await repos.collections.addProducts({
          orgId: dst,
          collectionId: copy.id,
          productIds: remappedIds,
        });
        entries.push({ kind: "collection", sourceId: source.id, targetId: copy.id });
        break;
      }
      case "priceList": {
        const source = srcPriceLists.find((pl) => pl.id === node.sourceId)!;
        const copy = await repos.priceLists.create({
          orgId: dst,
          currency: source.currency,
          priority: source.priority,
          ...(source.validFrom ? { validFrom: source.validFrom } : {}),
          ...(source.validTo ? { validTo: source.validTo } : {}),
        });
        entries.push({ kind: "priceList", sourceId: source.id, targetId: copy.id });
        break;
      }
      case "price": {
        const source = srcPrices.find((p) => p.id === node.sourceId)!;
        const copy = await repos.prices.setPrice({
          orgId: dst,
          priceListId: remapped("priceList", source.priceListId),
          variantId: remapped("variant", source.variantId),
          minQuantity: source.minQuantity,
          unitPriceMinor: source.unitPriceMinor,
        });
        entries.push({ kind: "price", sourceId: source.id, targetId: copy.id });
        break;
      }
      case "shippingRate": {
        const source = srcShippingRates.find((r) => r.id === node.sourceId)!;
        const copy = await repos.shippingRates.create({
          orgId: dst,
          name: source.name,
          kind: source.kind,
          currency: source.currency,
          amountMinor: source.amountMinor,
          ...(source.maxWeightGrams !== null && {
            maxWeightGrams: source.maxWeightGrams,
          }),
          ...(source.country !== null && { country: source.country }),
        });
        entries.push({ kind: "shippingRate", sourceId: source.id, targetId: copy.id });
        break;
      }
      case "asset": {
        const source = srcAssets.find((a) => a.id === node.sourceId)!;
        const storageKey = source.storageKey.replace(
          `org/${src}/`,
          `org/${dst}/`,
        );
        const copy = await repos.assets.create({
          orgId: dst,
          kind: source.kind,
          storageKey,
          mime: source.mime,
          sizeBytes: source.sizeBytes,
          checksum: source.checksum ?? undefined,
        });
        warnings.push(
          `asset/${copy.id}: object file must be migrated (${source.storageKey} → ${storageKey})`,
        );
        entries.push({ kind: "asset", sourceId: source.id, targetId: copy.id });
        break;
      }
      default:
        break;
    }
  }

  const manifest = buildManifest({
    profile,
    sourceOrgId: src,
    targetOrgId: dst,
    entries,
    warnings,
  });
  await repos.cloneManifests.create({
    orgId: dst,
    sourceOrgId: src,
    profile,
    manifest,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: dst,
      actorId: ctx.userId!,
      action: "clone.completed",
      subjectType: AUDIT_SUBJECTS.PAGE,
      subjectId: target.id,
      after: {
        profile,
        copied: manifest.entries.length,
        warnings: manifest.warnings.length,
      },
    }),
  );
  return { manifest };
}

/** FORK-001: clone into a child org + record fork links for inheritable kinds. */
export const INHERITABLE_KINDS: readonly CloneEntityKind[] = ["theme", "page", "priceList"];

export async function forkStore(
  repos: Repositories,
  ctx: TenantContext,
  input: CloneStoreInput,
) {
  const parsed = CloneStoreInput.extend({ profile: z.literal("CHILD_BRANCH") }).parse(input);
  const { manifest } = await cloneStore(repos, ctx, parsed);
  const forkLinks = [];
  for (const entry of manifest.entries) {
    if (!INHERITABLE_KINDS.includes(entry.kind)) continue;
    forkLinks.push(
      await repos.forkLinks.create({
        orgId: manifest.targetOrgId,
        entityType: entry.kind as "theme" | "page" | "priceList",
        entityId: entry.targetId,
        parentOrgId: manifest.sourceOrgId,
        parentEntityId: entry.sourceId,
      }),
    );
  }
  return { manifest, forkLinks };
}
