import { z } from "zod";
import {
  DomainError,
  reconcileSettlement,
  type TenantContext,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant } from "@finalshop/auth";
import type { Repositories } from "../ports";

export const ReconcileSettlementInput = z.object({
  orgId: z.string().min(1),
  settlementId: z.string().min(1),
});

/**
 * FIN-002: reconciles a provider settlement against the cash-clearing
 * movement the ledger recorded inside the settlement's period window.
 */
export async function reconcileSettlementById(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof ReconcileSettlementInput>,
) {
  const parsed = ReconcileSettlementInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "finance.read");
  const settlement = await repos.settlements.findById(parsed.settlementId);
  if (!settlement || settlement.orgId !== parsed.orgId) {
    throw new DomainError(
      "SETTLEMENT_NOT_FOUND",
      `settlement ${parsed.settlementId} not found`,
    );
  }

  const journals = await repos.journals.listByPeriod(
    parsed.orgId,
    settlement.periodStart,
    settlement.periodEnd,
  );
  // Net cash movement for the settlement currency: debits − credits on the
  // cash clearing account (captures in, refunds out).
  let ledgerNetMinor = 0n;
  for (const journal of journals) {
    if (journal.currency !== settlement.currency) continue;
    for (const line of journal.lines) {
      if (line.accountCode !== "1010-cash-clearing") continue;
      ledgerNetMinor += line.debitMinor - line.creditMinor;
    }
  }
  const result = reconcileSettlement(
    {
      provider: settlement.provider,
      currency: settlement.currency,
      grossMinor: settlement.grossMinor,
      feeMinor: settlement.feeMinor,
      netMinor: settlement.netMinor,
      periodStart: settlement.periodStart,
      periodEnd: settlement.periodEnd,
    },
    ledgerNetMinor,
  );
  return { settlement, ...result };
}
