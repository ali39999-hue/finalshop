/**
 * Tenancy value objects and enums. Role lives here (not in packages/auth)
 * because it is part of the tenancy domain vocabulary; the permission matrix
 * in packages/auth is built on top of it.
 */

export type OrganizationStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";
export type StoreStatus = "ACTIVE" | "INACTIVE";
export type BranchKind =
  | "RETAIL_LOCATION"
  | "WAREHOUSE"
  | "FULFILLMENT"
  | "BUSINESS_UNIT";

export const ROLES = [
  "OWNER",
  "ADMIN",
  "STORE_ADMIN",
  "CATALOG_ADMIN",
  "ORDER_MANAGER",
  "FINANCE",
  "DESIGNER",
  "SUPPORT",
  "MEMBER",
] as const;

export type Role = (typeof ROLES)[number];
