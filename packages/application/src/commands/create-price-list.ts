import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type TenantContext,
  buildAuditEvent,
  isSupportedCurrency,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const CreatePriceListInput = z.object({
  orgId: z.string().min(1),
  currency: z.string().min(3).max(3),
  priority: z.number().int().min(0).max(10000),
  validFrom: z.date().optional(),
  validTo: z.date().optional(),
});

export type CreatePriceListInput = z.input<typeof CreatePriceListInput>;

export async function createPriceList(
  repos: Repositories,
  ctx: TenantContext,
  input: CreatePriceListInput,
) {
  const parsed = CreatePriceListInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "price.update");
  const actor = requireUserId(ctx);

  if (!isSupportedCurrency(parsed.currency)) {
    throw new DomainError("CURRENCY_UNSUPPORTED", parsed.currency);
  }
  if (
    parsed.validFrom &&
    parsed.validTo &&
    parsed.validFrom.getTime() >= parsed.validTo.getTime()
  ) {
    throw new DomainError(
      "PRICE_LIST_INVALID",
      "validFrom must be before validTo",
    );
  }
  const priceList = await repos.priceLists.create({
    orgId: parsed.orgId,
    currency: parsed.currency.toUpperCase(),
    priority: parsed.priority,
    validFrom: parsed.validFrom,
    validTo: parsed.validTo,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "price_list.created",
      subjectType: AUDIT_SUBJECTS.PRICE_LIST,
      subjectId: priceList.id,
      after: { currency: priceList.currency, priority: priceList.priority },
    }),
  );
  return priceList;
}
