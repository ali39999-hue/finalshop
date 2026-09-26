import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type TenantContext,
  buildAuditEvent,
  money,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

const MINOR_REGEX = /^\d+$/;

export const SetPriceInput = z.object({
  orgId: z.string().min(1),
  priceListId: z.string().min(1),
  variantId: z.string().min(1),
  minQuantity: z.number().int().min(1).max(1_000_000),
  /** Minor units as a decimal string (JSON-safe BigInt transport). */
  unitPriceMinor: z.string().regex(MINOR_REGEX),
});

export type SetPriceInput = z.input<typeof SetPriceInput>;

export async function setPrice(
  repos: Repositories,
  ctx: TenantContext,
  input: SetPriceInput,
) {
  const parsed = SetPriceInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "price.update");
  const actor = requireUserId(ctx);

  const priceList = await repos.priceLists.findById(parsed.priceListId);
  if (!priceList || priceList.orgId !== parsed.orgId) {
    throw new DomainError(
      "PRICE_LIST_NOT_FOUND",
      `price list ${parsed.priceListId} not found`,
    );
  }
  // Constructing Money validates the currency registry and integer-ness.
  money(priceList.currency, parsed.unitPriceMinor);
  const price = await repos.prices.setPrice({
    orgId: parsed.orgId,
    priceListId: priceList.id,
    variantId: parsed.variantId,
    minQuantity: parsed.minQuantity,
    unitPriceMinor: BigInt(parsed.unitPriceMinor),
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "price.set",
      subjectType: AUDIT_SUBJECTS.PRICE_LIST,
      subjectId: priceList.id,
      after: {
        variantId: price.variantId,
        minQuantity: price.minQuantity,
        unitPriceMinor: price.unitPriceMinor.toString(),
        currency: priceList.currency,
      },
    }),
  );
  return price;
}
