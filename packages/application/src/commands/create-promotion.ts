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

const MINOR_REGEX = /^\d+$/;

export const CreatePromotionInput = z
  .object({
    orgId: z.string().min(1),
    name: z.string().min(1).max(200),
    kind: z.enum(["PERCENTAGE", "FIXED"]),
    /** PERCENTAGE: 1..10000 basis points (10000 = 100%). */
    percentageBps: z.number().int().min(1).max(10000).optional(),
    /** FIXED: minor units as decimal string. */
    amountMinor: z.string().regex(MINOR_REGEX).optional(),
    currency: z.string().min(3).max(3).optional(),
    priority: z.number().int().min(0).max(10000).default(100),
    exclusive: z.boolean().default(false),
  })
  .refine(
    (input) =>
      input.kind === "PERCENTAGE"
        ? input.percentageBps !== undefined && input.amountMinor === undefined
        : input.amountMinor !== undefined &&
          input.currency !== undefined &&
          input.percentageBps === undefined,
    { message: "promotion fields must match the selected kind" },
  );

export type CreatePromotionInput = z.input<typeof CreatePromotionInput>;

export async function createPromotion(
  repos: Repositories,
  ctx: TenantContext,
  input: CreatePromotionInput,
) {
  const parsed = CreatePromotionInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "promotion.update");
  const actor = requireUserId(ctx);

  if (parsed.kind === "FIXED" && parsed.currency) {
    if (!isSupportedCurrency(parsed.currency)) {
      throw new DomainError("CURRENCY_UNSUPPORTED", parsed.currency);
    }
  }
  const promotion = await repos.promotions.create({
    orgId: parsed.orgId,
    name: parsed.name,
    kind: parsed.kind,
    percentageBps: parsed.percentageBps,
    amountMinor: parsed.amountMinor !== undefined ? BigInt(parsed.amountMinor) : undefined,
    currency: parsed.currency?.toUpperCase(),
    priority: parsed.priority,
    exclusive: parsed.exclusive,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "promotion.created",
      subjectType: AUDIT_SUBJECTS.PROMOTION,
      subjectId: promotion.id,
      after: {
        kind: promotion.kind,
        percentageBps: promotion.percentageBps,
        amountMinor: promotion.amountMinor?.toString() ?? null,
        currency: promotion.currency,
        priority: promotion.priority,
        exclusive: promotion.exclusive,
      },
    }),
  );
  return promotion;
}
