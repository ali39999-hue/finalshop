import { DomainError } from "../errors";

/**
 * Catalog revisions (CAT-004): every content change of a product writes an
 * immutable, monotonically numbered snapshot. Revisions are append-only —
 * compare/restore UI comes later, the invariant lands now.
 */
export function nextRevisionNumber(
  current: number | null | undefined,
): number {
  if (current === null || current === undefined) return 1;
  if (!Number.isInteger(current) || current < 0) {
    throw new DomainError("REVISION_INVALID", String(current));
  }
  return current + 1;
}
