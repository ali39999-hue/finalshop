import { DomainError } from "../errors";

/**
 * Ledger (FIN-001, roadmap §9): double-entry, per-currency journals with the
 * balanced invariant — Σ debits == Σ credits, no negative amounts (the
 * debit/credit columns carry direction), one currency per journal.
 * Posting rules reference a compact chart of accounts; account rows themselves
 * stay configuration, not domain entities.
 */

export type AccountKind = "ASSET" | "LIABILITY" | "INCOME" | "EXPENSE" | "EQUITY";

export interface AccountRef {
  code: string;
  kind: AccountKind;
}

export const CHART = {
  CASH_CLEARING: { code: "1010-cash-clearing", kind: "ASSET" },
  TAX_PAYABLE: { code: "2150-tax-payable", kind: "LIABILITY" },
  SALES_REVENUE: { code: "4010-sales-revenue", kind: "INCOME" },
  REFUNDS: { code: "4910-refunds", kind: "EXPENSE" },
} as const satisfies Record<string, AccountRef>;

export interface JournalLineEntry {
  accountCode: string;
  accountKind: AccountKind;
  debitMinor: bigint;
  creditMinor: bigint;
}

export interface JournalEntry {
  currency: string;
  effectiveAt: Date;
  memo: string;
  /** Traceability back to the domain event, e.g. payment.intent/<id>. */
  sourceType: string;
  sourceId: string;
  lines: JournalLineEntry[];
}

function lineIsSane(line: JournalLineEntry): boolean {
  const { debitMinor, creditMinor } = line;
  const debitOk = debitMinor >= 0n && creditMinor === 0n;
  const creditOk = creditMinor >= 0n && debitMinor === 0n;
  return (debitOk || creditOk) && (debitMinor !== 0n || creditMinor !== 0n);
}

export function assertBalancedJournal(entry: JournalEntry): void {
  if (entry.lines.length < 2) {
    throw new DomainError("JOURNAL_INVALID", "a journal needs at least two lines");
  }
  if (!entry.lines.every(lineIsSane)) {
    throw new DomainError(
      "JOURNAL_INVALID",
      "each line carries exactly one positive side (debit xor credit)",
    );
  }
  const debits = entry.lines.reduce((sum, l) => sum + l.debitMinor, 0n);
  const credits = entry.lines.reduce((sum, l) => sum + l.creditMinor, 0n);
  if (debits !== credits) {
    throw new DomainError(
      "JOURNAL_UNBALANCED",
      `debits ${debits} != credits ${credits}`,
    );
  }
}

/** Canonical posting when a payment is captured. */
export function paymentReceivedJournal(input: {
  currency: string;
  totalMinor: bigint;
  taxMinor: bigint;
  sourceId: string;
  effectiveAt: Date;
}): JournalEntry {
  const { currency, totalMinor, taxMinor, sourceId, effectiveAt } = input;
  if (taxMinor < 0n || taxMinor > totalMinor) {
    throw new DomainError("JOURNAL_INVALID", `tax ${taxMinor} out of range`);
  }
  const entry: JournalEntry = {
    currency,
    effectiveAt,
    memo: "payment captured",
    sourceType: "payment.intent",
    sourceId,
    lines: [
      {
        accountCode: CHART.CASH_CLEARING.code,
        accountKind: CHART.CASH_CLEARING.kind,
        debitMinor: totalMinor,
        creditMinor: 0n,
      },
      {
        accountCode: CHART.SALES_REVENUE.code,
        accountKind: CHART.SALES_REVENUE.kind,
        debitMinor: 0n,
        creditMinor: totalMinor - taxMinor,
      },
    ],
  };
  if (taxMinor > 0n) {
    entry.lines.push({
      accountCode: CHART.TAX_PAYABLE.code,
      accountKind: CHART.TAX_PAYABLE.kind,
      debitMinor: 0n,
      creditMinor: taxMinor,
    });
  }
  assertBalancedJournal(entry);
  return entry;
}

/** Canonical posting when a refund is executed: reverse the money. */
export function refundExecutedJournal(input: {
  currency: string;
  refundMinor: bigint;
  sourceId: string;
  effectiveAt: Date;
}): JournalEntry {
  const entry: JournalEntry = {
    currency: input.currency,
    effectiveAt: input.effectiveAt,
    memo: "refund executed",
    sourceType: "payment.refund",
    sourceId: input.sourceId,
    lines: [
      {
        accountCode: CHART.REFUNDS.code,
        accountKind: CHART.REFUNDS.kind,
        debitMinor: input.refundMinor,
        creditMinor: 0n,
      },
      {
        accountCode: CHART.CASH_CLEARING.code,
        accountKind: CHART.CASH_CLEARING.kind,
        debitMinor: 0n,
        creditMinor: input.refundMinor,
      },
    ],
  };
  assertBalancedJournal(entry);
  return entry;
}
