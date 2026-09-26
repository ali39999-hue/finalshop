import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  assertBalancedJournal,
  type TenantContext,
  assertSettlementInvariants,
  buildAuditEvent,
  isSupportedCurrency,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

const MINOR_REGEX = /^-?\d+$/;

/** FIN-001: posts a pre-validated balanced journal (system or manual). */
export async function postJournal(
  repos: Repositories,
  ctx: TenantContext,
  input: {
    orgId: string;
    currency: string;
    effectiveAt: Date;
    memo: string;
    sourceType: string;
    sourceId: string;
    lines: Array<{
      accountCode: string;
      accountKind: "ASSET" | "LIABILITY" | "INCOME" | "EXPENSE" | "EQUITY";
      debitMinor: string;
      creditMinor: string;
    }>;
  },
) {
  const parsed = z
    .object({
      orgId: z.string().min(1),
      currency: z.string().min(3).max(3),
      effectiveAt: z.date(),
      memo: z.string().min(1).max(500),
      sourceType: z.string().min(1).max(100),
      sourceId: z.string().min(1).max(200),
      lines: z
        .array(
          z.object({
            accountCode: z.string().min(1).max(100),
            accountKind: z.enum(["ASSET", "LIABILITY", "INCOME", "EXPENSE", "EQUITY"]),
            debitMinor: z.string().regex(MINOR_REGEX),
            creditMinor: z.string().regex(MINOR_REGEX),
          }),
        )
        .min(2),
    })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "finance.post");
  if (!isSupportedCurrency(parsed.currency)) {
    throw new DomainError("CURRENCY_UNSUPPORTED", parsed.currency);
  }
  const journal = {
    currency: parsed.currency.toUpperCase(),
    effectiveAt: parsed.effectiveAt,
    memo: parsed.memo,
    sourceType: parsed.sourceType,
    sourceId: parsed.sourceId,
    lines: parsed.lines.map((l) => ({
      accountCode: l.accountCode,
      accountKind: l.accountKind,
      debitMinor: BigInt(l.debitMinor),
      creditMinor: BigInt(l.creditMinor),
    })),
  };
  assertBalancedJournal(journal);
  if (await repos.journals.existsForSource(parsed.orgId, parsed.sourceType, parsed.sourceId)) {
    throw new DomainError(
      "JOURNAL_DUPLICATE",
      `a journal for ${parsed.sourceType}/${parsed.sourceId} already exists`,
    );
  }
  const created = await repos.journals.create({ orgId: parsed.orgId, ...journal });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: requireUserId(ctx),
      action: "finance.journal_posted",
      subjectType: AUDIT_SUBJECTS.JOURNAL,
      subjectId: created.id,
      after: { sourceType: parsed.sourceType, sourceId: parsed.sourceId },
    }),
  );
  return created;
}

export const CreateTaxRateInput = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1).max(200),
  percentageBps: z.number().int().min(0).max(10000),
  jurisdiction: z.string().min(2).max(20),
  effectiveFrom: z.date(),
  effectiveTo: z.date().optional(),
});

export async function createTaxRate(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof CreateTaxRateInput>,
) {
  const parsed = CreateTaxRateInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "finance.post");
  requireUserId(ctx);
  if (
    parsed.effectiveTo &&
    parsed.effectiveFrom.getTime() >= parsed.effectiveTo.getTime()
  ) {
    throw new DomainError("TAX_RATE_INVALID", "effectiveFrom must precede effectiveTo");
  }
  const rate = await repos.taxRates.create({
    orgId: parsed.orgId,
    name: parsed.name,
    percentageBps: parsed.percentageBps,
    jurisdiction: parsed.jurisdiction.toUpperCase(),
    effectiveFrom: parsed.effectiveFrom,
    ...(parsed.effectiveTo !== undefined && { effectiveTo: parsed.effectiveTo }),
  });
  return rate;
}

/** FIN-002: records a provider settlement batch. */
export async function recordSettlement(
  repos: Repositories,
  ctx: TenantContext,
  input: {
    orgId: string;
    provider: string;
    currency: string;
    grossMinor: string;
    feeMinor: string;
    netMinor: string;
    periodStart: Date;
    periodEnd: Date;
  },
) {
  const parsed = z
    .object({
      orgId: z.string().min(1),
      provider: z.string().min(1).max(50),
      currency: z.string().min(3).max(3),
      grossMinor: z.string().regex(/^\d+$/),
      feeMinor: z.string().regex(/^\d+$/),
      netMinor: z.string().regex(/^-?\d+$/),
      periodStart: z.date(),
      periodEnd: z.date(),
    })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "finance.post");
  const settlement = {
    orgId: parsed.orgId,
    provider: parsed.provider,
    currency: parsed.currency.toUpperCase(),
    grossMinor: BigInt(parsed.grossMinor),
    feeMinor: BigInt(parsed.feeMinor),
    netMinor: BigInt(parsed.netMinor),
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd,
  };
  assertSettlementInvariants(settlement);
  return repos.settlements.create(settlement);
}
