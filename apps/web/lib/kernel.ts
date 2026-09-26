import { cookies } from "next/headers";
import {
  createPrismaClient,
  MeilisearchSearchIndex,
  PrismaRepositories,
} from "@finalshop/infrastructure";
import type { Repositories } from "@finalshop/application";
import type { TenantContext } from "@finalshop/domain";

/**
 * Composition root for the storefront. The kernel is a singleton; when
 * MEILI_URL is configured the Meilisearch adapter replaces the DB-backed
 * search index — the hexagonal swap promised by Atlas §13, with zero changes
 * to pages or actions.
 */

const globalForKernel = globalThis as unknown as {
  __finalshopKernel?: { repos: Repositories };
};

export function getRepos(): Repositories {
  if (!globalForKernel.__finalshopKernel) {
    const db = createPrismaClient();
    const repos = decorateWithAdapters(new PrismaRepositories(db));
    globalForKernel.__finalshopKernel = { repos };
  }
  return globalForKernel.__finalshopKernel.repos;
}

/** Composition-root swap: Meilisearch replaces the DB-backed search index. */
function decorateWithAdapters(repos: Repositories): Repositories {
  const meiliUrl = process.env.MEILI_URL;
  if (!meiliUrl) return repos;
  const meili = new MeilisearchSearchIndex(
    meiliUrl,
    process.env.MEILI_API_KEY ?? "",
    process.env.MEILI_INDEX ?? "catalog",
  );
  void meili.ensureIndex().catch(() => {
    // Provisioning is retried on the next cold start.
  });
  return { ...repos, searchIndex: meili };
}

export const VISITOR_COOKIE = "fs_visitor";
export const CART_COOKIE = "fs_cart";

export async function getDemoOrgId(): Promise<string> {
  const slug = process.env.DEMO_ORG_SLUG ?? "demo";
  const org = await getRepos().organizations.findBySlug(slug);
  if (!org) {
    throw new Error("STOREFRONT_NOT_SEEDED: open /setup once to seed the demo store");
  }
  return org.id;
}

export async function getVisitorId(): Promise<string> {
  const store = await cookies();
  return store.get(VISITOR_COOKIE)?.value ?? "anonymous-preview";
}

/** Shopper context: authenticated by visitor cookie, no staff role. */
export async function getShopperContext(): Promise<TenantContext> {
  return { orgId: await getDemoOrgId(), userId: await getVisitorId() };
}

/** Owner context — demo bootstrap/payment simulation only. */
export function getDemoOwnerContext(orgId: string): TenantContext {
  return { orgId, userId: "demo-owner", role: "OWNER" };
}
