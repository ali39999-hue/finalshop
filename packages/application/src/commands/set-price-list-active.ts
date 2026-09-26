import { z } from "zod";
import { AUDIT_SUBJECTS, type TenantContext, buildAuditEvent } from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const SetPriceListActiveInput = z.object({
  orgId: z.string().min(1),
  priceListId: z.string().min(1),
  isActive: z.boolean(),
});

export type SetPriceListActiveInput = z.input<typeof SetPriceListActiveInput>;

export async function setPriceListActive(
  repos: Repositories,
  ctx: TenantContext,
  input: SetPriceListActiveInput,
) {
  const parsed = SetPriceListActiveInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "price.update");
  const actor = requireUserId(ctx);
  const priceList = await repos.priceLists.setActive({
    id: parsed.priceListId,
    orgId: parsed.orgId,
    isActive: parsed.isActive,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: parsed.isActive ? "price_list.activated" : "price_list.deactivated",
      subjectType: AUDIT_SUBJECTS.PRICE_LIST,
      subjectId: priceList.id,
      before: { isActive: !parsed.isActive },
      after: { isActive: parsed.isActive },
    }),
  );
  return priceList;
}
