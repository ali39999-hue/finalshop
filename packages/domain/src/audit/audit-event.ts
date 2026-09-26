import { DomainError } from "../errors";

/**
 * Audit events (IAM-004). Every important mutation must produce one
 * (roadmap non-negotiables §3): who did what to which subject, before/after,
 * with request correlation metadata.
 */
export interface AuditEvent {
  readonly id?: string | undefined;
  readonly orgId: string;
  readonly actorId: string;
  readonly action: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly requestId?: string | undefined;
  readonly ip?: string | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
  readonly createdAt?: Date | undefined;
}

export const AUDIT_SUBJECTS = {
  ORGANIZATION: "organization",
  STORE: "store",
  STOREFRONT: "storefront",
  BRANCH: "branch",
  DOMAIN: "domain",
  MEMBERSHIP: "membership",
  PRODUCT: "product",
  CATEGORY: "category",
  COLLECTION: "collection",
  ASSET: "asset",
  PRICE_LIST: "price_list",
  PROMOTION: "promotion",
  INVENTORY_ITEM: "inventory_item",
  RESERVATION: "reservation",
  CART: "cart",
  CHECKOUT: "checkout",
  ORDER: "order",
  PAYMENT_INTENT: "payment_intent",
  REFUND: "refund",
  JOURNAL: "journal",
  FULFILLMENT: "fulfillment",
  RETURN: "return",
  PAGE: "page",
  BLOCK: "block",
  THEME: "theme",
  PLUGIN: "plugin",
} as const;

export function buildAuditEvent(input: AuditEvent): AuditEvent {
  const requireField = (value: string | undefined, field: string) => {
    if (typeof value !== "string" || value.length === 0) {
      throw new DomainError(
        "AUDIT_EVENT_INVALID",
        `audit event missing ${field}`,
      );
    }
  };
  requireField(input.orgId, "orgId");
  requireField(input.actorId, "actorId");
  requireField(input.action, "action");
  requireField(input.subjectType, "subjectType");
  requireField(input.subjectId, "subjectId");
  return Object.freeze({ ...input });
}
