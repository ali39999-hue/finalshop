import { DomainError } from "../errors";
import type { AssetKind } from "./types";

export const MAX_ASSET_BYTES: Record<AssetKind, number> = {
  IMAGE: 10 * 1024 * 1024,
  VIDEO: 500 * 1024 * 1024,
  FILE: 25 * 1024 * 1024,
};

/**
 * MIME allow-list per kind. SVG is deliberately excluded: stored SVG executes
 * scripts in the storefront origin (stored XSS, threat T-05). If SVG support
 * is ever required it must pass a sanitizer pipeline first.
 */
export const ALLOWED_MIME_BY_KIND: Record<AssetKind, readonly string[]> = {
  IMAGE: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"],
  VIDEO: ["video/mp4", "video/webm"],
  FILE: ["application/pdf"],
};

export function assertAssetAllowed(input: {
  kind: AssetKind;
  mime: string;
  sizeBytes: number;
}): void {
  const allowed = ALLOWED_MIME_BY_KIND[input.kind];
  const mime = input.mime.toLowerCase();
  if (!allowed.includes(mime)) {
    throw new DomainError(
      "ASSET_MIME_NOT_ALLOWED",
      `${mime} is not allowed for ${input.kind}`,
    );
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new DomainError("ASSET_SIZE_INVALID", String(input.sizeBytes));
  }
  if (input.sizeBytes > MAX_ASSET_BYTES[input.kind]) {
    throw new DomainError(
      "ASSET_TOO_LARGE",
      `${input.sizeBytes} bytes exceeds the ${input.kind} limit`,
    );
  }
}

const KEY_SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * Builds an org-scoped object-storage key. Every asset lives under
 * `org/<orgId>/…` so cross-tenant key collision is structurally impossible,
 * and per-tenant lifecycle rules (clone/detach, GDPR deletes) stay simple.
 */
export function buildAssetStorageKey(input: {
  orgId: string;
  kind: AssetKind;
  date: Date;
  id: string;
}): string {
  if (!KEY_SEGMENT.test(input.orgId) || !KEY_SEGMENT.test(input.id)) {
    throw new DomainError("ASSET_KEY_INVALID", "orgId and id must be key-safe");
  }
  const yyyy = input.date.getUTCFullYear();
  const mm = String(input.date.getUTCMonth() + 1).padStart(2, "0");
  return `org/${input.orgId}/${input.kind.toLowerCase()}/${yyyy}/${mm}/${input.id}`;
}

/** Read-path guard: a storage key handed to a tenant must be inside its namespace. */
export function assertStorageKeyBelongsToOrg(
  storageKey: string,
  orgId: string,
): void {
  if (!storageKey.startsWith(`org/${orgId}/`)) {
    throw new DomainError(
      "CROSS_TENANT_ACCESS",
      `storage key ${storageKey} is not part of org ${orgId}`,
    );
  }
}
