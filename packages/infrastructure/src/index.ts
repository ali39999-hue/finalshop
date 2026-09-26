import { PrismaClient } from "@prisma/client";

export function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

export * from "./tenant-transaction";
export * from "./repositories/prisma-repositories";
export * from "./repositories/catalog-repositories";
export * from "./repositories/pricing-inventory-repositories";
export * from "./repositories/order-repositories";
export * from "./repositories/payment-finance-repositories";
export * from "./repositories/fulfillment-repositories";
export * from "./repositories/cms-repositories";
export * from "./repositories/builder-theme-repositories";
export * from "./repositories/clone-repositories";
export * from "./repositories/search-repositories";
export * from "./repositories/extension-repositories";
export * from "./repositories/analytics-repositories";
export * from "./repositories/user-repository";
export * from "./providers/stripe-payment-provider";
export * from "./providers/meilisearch-search-index";
