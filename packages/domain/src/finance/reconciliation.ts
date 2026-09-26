import { DomainError } from "../errors";

/**
 * Settlement & reconciliation (FIN-002): a provider settlement batch must be
 * internally consistent (net = gross − fee) and its net must equal the cash
 * movement the ledger recorded for the same period.
 */

export interface ProviderSettlement {
  provider: string;
  currency: string;
  grossMinor: bigint;
  feeMinor: bigint;
  netMinor: bigint;
  periodStart: Date;
  periodEnd: Date;
}

export function assertSettlementInvariants(settlement: ProviderSettlement): void {
  const { grossMinor, feeMinor, netMinor } = settlement;
  if (grossMinor <= 0n || feeMinor < 0n) {
    throw new DomainError("SETTLEMENT_INVALID", "amounts out of range");
  }
  if (netMinor !== grossMinor - feeMinor) {
    throw new DomainError(
      "SETTLEMENT_INVALID",
      `net ${netMinor} != gross ${grossMinor} - fee ${feeMinor}`,
    );
  }
  if (settlement.periodStart >= settlement.periodEnd) {
    throw new DomainError("SETTLEMENT_INVALID", "period start must precede end");
  }
}

export interface ReconciliationResult {
  status: "MATCHED" | "MISMATCH";
  /** ledgerNet − settlement.net (0 when matched). */
  deltaMinor: bigint;
}

export function reconcileSettlement(
  settlement: ProviderSettlement,
  ledgerNetMinor: bigint,
): ReconciliationResult {
  const deltaMinor = ledgerNetMinor - settlement.netMinor;
  return {
    status: deltaMinor === 0n ? "MATCHED" : "MISMATCH",
    deltaMinor,
  };
}
