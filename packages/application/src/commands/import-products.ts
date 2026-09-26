import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  type TenantContext,
  assertValidProductOptions,
  buildAuditEvent,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";
import { SLUG_REGEX } from "./create-organization";

const ImportProductRow = z.object({
  title: z.string().min(1).max(300),
  slug: z.string().regex(SLUG_REGEX),
  description: z.string().max(50_000).optional(),
  options: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        values: z.array(z.string().min(1).max(100)).max(200),
      }),
    )
    .max(3)
    .default([]),
});

export const ImportProductsInput = z.object({
  orgId: z.string().min(1),
  products: z.array(ImportProductRow).min(1).max(1000),
});

export type ImportProductsInput = z.input<typeof ImportProductsInput>;

export interface ImportRowFailure {
  index: number;
  code: string;
  message: string;
}

/**
 * Transport-agnostic batch import (roadmap W2): rows are validated and
 * created one by one — failures are collected per row, not thrown, so a
 * single bad row does not abort the batch. File/CSV parsing happens in the
 * presentation layer; the kernel only sees typed rows.
 */
export async function importProducts(
  repos: Repositories,
  ctx: TenantContext,
  input: ImportProductsInput,
) {
  const parsed = ImportProductsInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "product.create");
  const actor = requireUserId(ctx);

  const created: string[] = [];
  const failed: ImportRowFailure[] = [];
  const seenSlugs = new Set<string>();

  for (const [index, row] of parsed.products.entries()) {
    try {
      if (seenSlugs.has(row.slug)) {
        throw Object.assign(new Error(`duplicate slug ${row.slug}`), {
          code: "PRODUCT_SLUG_TAKEN",
        });
      }
      const duplicate = await repos.products.findBySlug(parsed.orgId, row.slug);
      if (duplicate) {
        throw Object.assign(new Error(`slug ${row.slug} already in use`), {
          code: "PRODUCT_SLUG_TAKEN",
        });
      }
      const product = await repos.products.create({
        orgId: parsed.orgId,
        slug: row.slug,
        title: row.title,
        description: row.description,
        options: assertValidProductOptions(row.options),
      });
      seenSlugs.add(row.slug);
      created.push(product.id);
    } catch (err) {
      failed.push({
        index,
        code: (err as { code?: string }).code ?? "IMPORT_ROW_FAILED",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "products.imported",
      subjectType: AUDIT_SUBJECTS.PRODUCT,
      subjectId: parsed.orgId,
      after: { created: created.length, failed: failed.length },
    }),
  );
  return { created: created.length, failed };
}
