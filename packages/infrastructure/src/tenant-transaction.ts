import type { Prisma, PrismaClient } from "@prisma/client";

export type DbTransaction = Prisma.TransactionClient;

/**
 * Runs `fn` inside a transaction whose `app.tenant_id` GUC is set
 * transaction-locally. With the RLS policies applied
 * (prisma/rls/001-tenant-rls.sql) and a non-owner connection role, reads and
 * writes are confined to the tenant's rows even if an application-level
 * scope is ever forgotten — defense-in-depth for threat T-01.
 */
export async function runInTenantTransaction<T>(
  client: PrismaClient,
  orgId: string,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${orgId}, true)`;
    return fn(tx);
  });
}
