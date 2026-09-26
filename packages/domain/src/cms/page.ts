import { DomainError } from "../errors";

/**
 * CMS page model (W7, CMS-001..004, roadmap §10): pages are stored as a
 * JSON schema AST — never rendered HTML. A page carries immutable revisions;
 * publishing points at one revision, scheduling defers the pointer move.
 */

export const PAGE_SCHEMA_VERSION = 1;
export const MAX_PAGE_TREE_DEPTH = 10;
export const NODE_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

export type PageStatus = "DRAFT" | "PUBLISHED" | "SCHEDULED" | "ARCHIVED";

export interface PageNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: PageNode[];
}

export interface PageSeo {
  title?: string;
  description?: string;
  keywords?: string[];
}

function validateNode(node: PageNode, depth: number, ids: Set<string>): void {
  if (depth > MAX_PAGE_TREE_DEPTH) {
    throw new DomainError(
      "PAGE_SCHEMA_INVALID",
      `tree exceeds ${MAX_PAGE_TREE_DEPTH} levels`,
    );
  }
  if (!NODE_ID_REGEX.test(node.id)) {
    throw new DomainError("PAGE_SCHEMA_INVALID", `node id ${node.id} is invalid`);
  }
  if (ids.has(node.id)) {
    throw new DomainError(
      "PAGE_SCHEMA_INVALID",
      `duplicate node id ${node.id}`,
    );
  }
  ids.add(node.id);
  if (typeof node.type !== "string" || node.type.trim().length === 0) {
    throw new DomainError("PAGE_SCHEMA_INVALID", `node ${node.id} has no type`);
  }
  for (const child of node.children ?? []) {
    validateNode(child, depth + 1, ids);
  }
}

/** Structural validation: ids, types, depth, uniqueness. */
export function validatePageSchema(root: PageNode): void {
  if (!root || typeof root !== "object") {
    throw new DomainError("PAGE_SCHEMA_INVALID", "empty schema");
  }
  validateNode(root, 0, new Set());
}

/** Collects asset ids referenced by node props — the media linkage (CMS-002). */
export function collectPageAssetIds(node: PageNode): string[] {
  const ids: string[] = [];
  const walk = (current: PageNode): void => {
    const assetId = current.props?.assetId;
    if (typeof assetId === "string" && assetId.length > 0) {
      ids.push(assetId);
    }
    for (const child of current.children ?? []) walk(child);
  };
  walk(node);
  return ids;
}
