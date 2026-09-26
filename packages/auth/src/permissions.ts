import type { Role } from "@finalshop/domain";

/**
 * Permission matrix (IAM-002). Permissions are `resource.action` strings
 * (roadmap §14). The matrix is explicit data so it can be rendered in the
 * admin UI, audited in reviews, and unit-tested.
 *
 * Roles whose domains arrive in later waves (catalog, orders, finance,
 * designer, support) are listed with empty grants to keep the matrix total;
 * their grants land with W2+.
 */
export const PERMISSIONS = [
  "org.read",
  "org.update",
  "org.close",
  "store.create",
  "store.read",
  "store.update",
  "storefront.create",
  "storefront.update",
  "branch.create",
  "branch.update",
  "domain.attach",
  "domain.verify",
  "member.invite",
  "member.role.assign",
  "member.remove",
  "audit.read",
  "product.read",
  "product.create",
  "product.update",
  "category.create",
  "category.update",
  "collection.create",
  "collection.update",
  "asset.upload",
  "asset.read",
  "price.read",
  "price.update",
  "promotion.read",
  "promotion.update",
  "inventory.read",
  "inventory.update",
  "order.read",
  "order.update",
  "payment.read",
  "payment.update",
  "finance.read",
  "finance.post",
  "fulfillment.read",
  "fulfillment.manage",
  "return.read",
  "return.manage",
  "cms.read",
  "cms.manage",
  "cms.publish",
  "builder.read",
  "builder.manage",
  "theme.read",
  "theme.manage",
  "extension.read",
  "extension.manage",
  "analytics.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;
const without = (...denied: Permission[]): readonly Permission[] =>
  ALL.filter((p) => !denied.includes(p));

const CATALOG: readonly Permission[] = [
  "product.read",
  "product.create",
  "product.update",
  "category.create",
  "category.update",
  "collection.create",
  "collection.update",
  "asset.upload",
  "asset.read",
  "price.read",
  "price.update",
  "promotion.read",
  "promotion.update",
];

export const ROLE_PERMISSIONS: Record<Role, "*" | readonly Permission[]> = {
  OWNER: "*",
  ADMIN: without("org.close", "domain.verify"),
  STORE_ADMIN: [
    "org.read",
    "store.read",
    "store.update",
    "storefront.create",
    "storefront.update",
    "branch.create",
    "branch.update",
    "product.read",
    "asset.read",
    "price.read",
    "promotion.read",
    "inventory.read",
    "inventory.update",
    "order.read",
    "fulfillment.read",
  ],
  CATALOG_ADMIN: CATALOG,
  ORDER_MANAGER: [
    "inventory.read",
    "order.read",
    "order.update",
    "payment.read",
    "fulfillment.read",
    "fulfillment.manage",
    "return.read",
    "return.manage",
  ],
  FINANCE: [
    "price.read",
    "promotion.read",
    "order.read",
    "payment.read",
    "payment.update",
    "finance.read",
    "finance.post",
  ],
  DESIGNER: [
    "cms.read",
    "cms.manage",
    "cms.publish",
    "builder.read",
    "builder.manage",
    "theme.read",
    "theme.manage",
  ],
  SUPPORT: ["order.read", "return.read", "fulfillment.read"],
  MEMBER: ["org.read", "store.read"],
};

/** Wildcards allow-listed explicitly to keep `can` simple and total. */
export function can(
  role: Role | undefined,
  permission: Permission,
): boolean {
  if (!role) return false;
  const grants = ROLE_PERMISSIONS[role];
  if (grants === "*") return true;
  return grants.includes(permission);
}
