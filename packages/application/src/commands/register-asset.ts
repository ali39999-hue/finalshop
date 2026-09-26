import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  type AssetKind,
  type TenantContext,
  assertAssetAllowed,
  buildAssetStorageKey,
  buildAuditEvent,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const RegisterAssetInput = z.object({
  orgId: z.string().min(1),
  kind: z.enum(["IMAGE", "VIDEO", "FILE"]),
  mime: z.string().min(3).max(100),
  sizeBytes: z.number().int(),
  checksum: z.string().min(8).max(128).optional(),
});

export type RegisterAssetInput = z.input<typeof RegisterAssetInput>;

/**
 * Registers an asset after policy validation and assigns its org-scoped
 * storage key (CAT-003). The actual byte upload happens out-of-band (direct
 * to object storage, presigned flows come with the storefront); the kernel
 * owns the record and the invariants.
 */
export async function registerAsset(
  repos: Repositories,
  ctx: TenantContext,
  input: RegisterAssetInput,
) {
  const parsed = RegisterAssetInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "asset.upload");
  const actor = requireUserId(ctx);
  const kind = parsed.kind as AssetKind;
  assertAssetAllowed({ kind, mime: parsed.mime, sizeBytes: parsed.sizeBytes });

  const id = randomUUID();
  const storageKey = buildAssetStorageKey({
    orgId: parsed.orgId,
    kind,
    date: new Date(),
    id,
  });
  const asset = await repos.assets.create({
    orgId: parsed.orgId,
    kind,
    storageKey,
    mime: parsed.mime.toLowerCase(),
    sizeBytes: parsed.sizeBytes,
    checksum: parsed.checksum,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "asset.registered",
      subjectType: AUDIT_SUBJECTS.ASSET,
      subjectId: asset.id,
      after: { kind, mime: asset.mime, sizeBytes: asset.sizeBytes, storageKey },
    }),
  );
  return asset;
}
