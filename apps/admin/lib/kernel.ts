import type { TenantContext } from "@finalshop/domain";
import {
  createPrismaClient,
  PrismaRepositories,
} from "@finalshop/infrastructure";
import type { Repositories } from "@finalshop/application";

/**
 * Kernel singleton + demo owner context for the ERP console. Real auth
 * (Better Auth) + the permission matrix replace this when the admin app
 * gets its login slice.
 */

const globalForKernel = globalThis as unknown as {
  __finalshopAdminKernel?: { repos: Repositories };
};

export function getRepos(): Repositories {
  if (!globalForKernel.__finalshopAdminKernel) {
    const db = createPrismaClient();
    globalForKernel.__finalshopAdminKernel = { repos: new PrismaRepositories(db) };
  }
  return globalForKernel.__finalshopAdminKernel.repos;
}

export async function getDemoOrgId(): Promise<string> {
  const slug = process.env.DEMO_ORG_SLUG ?? "demo";
  const org = await getRepos().organizations.findBySlug(slug);
  if (!org) {
    throw new Error("ADMIN_NOT_SEEDED: seed the demo store via the web app (/setup)");
  }
  return org.id;
}

/** Demo ERP operator: full owner context (real auth lands with W1-UI). */
export async function getOperatorContext(): Promise<TenantContext> {
  return {
    orgId: await getDemoOrgId(),
    userId: "demo-owner",
    role: "OWNER",
  };
}
