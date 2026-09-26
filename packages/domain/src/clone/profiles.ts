import { DomainError } from "../errors";

/**
 * Clone profiles (CLONE-001, roadmap §12.1): each profile whitelists the
 * entity kinds a clone may copy. Transactional and identity data — orders,
 * carts, checkouts, payments, refunds, reservations, customers, journals,
 * audit — is FORBIDDEN in every profile; secrets never live in clonable
 * entities at all.
 */

export type CloneEntityKind =
  | "asset"
  | "theme"
  | "page"
  | "product"
  | "variant"
  | "category"
  | "collection"
  | "priceList"
  | "price"
  | "shippingRate"
  | "inventoryItem";

/** Never cloneable, no exceptions (roadmap §3 non-negotiables). */
export const FORBIDDEN_KINDS = [
  "order",
  "cart",
  "checkout",
  "paymentIntent",
  "refund",
  "reservation",
  "customer",
  "journal",
  "auditEvent",
  "idempotency",
] as const;

export type ForbiddenKind = (typeof FORBIDDEN_KINDS)[number];

export const CLONE_PROFILES = {
  THEME_ONLY: ["theme"],
  STORE_BLUEPRINT: [
    "asset",
    "theme",
    "page",
    "product",
    "variant",
    "category",
    "collection",
    "priceList",
    "price",
    "shippingRate",
  ],
  FULL_LAUNCH_SEED: [
    "asset",
    "theme",
    "page",
    "product",
    "variant",
    "category",
    "collection",
    "priceList",
    "price",
    "shippingRate",
    "inventoryItem",
  ],
  SANDBOX: ["theme", "page", "product", "variant", "category", "collection"],
  CHILD_BRANCH: [
    "asset",
    "theme",
    "page",
    "product",
    "variant",
    "category",
    "collection",
    "priceList",
    "price",
    "shippingRate",
  ],
} as const satisfies Record<string, readonly CloneEntityKind[]>;

export type CloneProfileName = keyof typeof CLONE_PROFILES;

export function profileAllows(
  profile: CloneProfileName,
  kind: CloneEntityKind,
): boolean {
  return (CLONE_PROFILES[profile] as readonly CloneEntityKind[]).includes(kind);
}

/** Structural guard: a profile can never sneak in a forbidden kind. */
export function assertNoForbiddenKinds(kinds: readonly string[]): void {
  for (const kind of kinds) {
    if ((FORBIDDEN_KINDS as readonly string[]).includes(kind)) {
      throw new DomainError(
        "CLONE_PROFILE_FORBIDDEN_KIND",
        `kind ${kind} may never be cloned`,
      );
    }
  }
}

export function isCloneProfileName(name: string): name is CloneProfileName {
  return name in CLONE_PROFILES;
}
