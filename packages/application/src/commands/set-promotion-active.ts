import { z } from "zod";
import { AUDIT_SUBJECTS, type TenantContext, buildAuditEvent } from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const SetPromotionActiveInput = z.object({
  orgId: z.string().min(1),
  promotionId: z.string().min(1),
  isActive: z.boolean(),
});

export type SetPromotionActiveInput = z.input<typeof SetPromotionActiveInput>;

export async function setPromotionActive(
  repos: Repositories,
  ctx: TenantContext,
  input: SetPromotionActiveInput,
) {
  const parsed = SetPromotionActiveInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "promotion.update");
  const actor = requireUserId(ctx);
  const promotion = await repos.promotions.setActive({
    id: parsed.promotionId,
    orgId: parsed.orgId,
    isActive: parsed.isActive,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: parsed.isActive ? "promotion.activated" : "promotion.deactivated",
      subjectType: AUDIT_SUBJECTS.PROMOTION,
      subjectId: promotion.id,
      before: { isActive: !parsed.isActive },
      after: { isActive: parsed.isActive },
    }),
  );
  return promotion;
}
