import { describe, expect, it } from "vitest";
import { paymentReceivedJournal, refundExecutedJournal, assertBalancedJournal } from "./ledger";
import { assertSettlementInvariants, reconcileSettlement } from "./reconciliation";
import { assertTaxRateBps, resolveEffectiveTaxRate, type TaxRateRule } from "./tax";

describe("ledger (FIN-001)", () => {
  it("posts a balanced payment journal with tax split", () => {
    const journal = paymentReceivedJournal({
      currency: "USD",
      totalMinor: 5400n,
      taxMinor: 400n,
      sourceId: "intent-1",
      effectiveAt: new Date("2026-09-26T12:00:00Z"),
    });
    expect(journal.lines).toHaveLength(3);
    expect(() => assertBalancedJournal(journal)).not.toThrow();
  });

  it("rejects unbalanced or malformed journals", () => {
    const broken = paymentReceivedJournal({
      currency: "USD",
      totalMinor: 5400n,
      taxMinor: 0n,
      sourceId: "intent-1",
      effectiveAt: new Date(),
    });
    broken.lines[1]!.creditMinor = 1n;
    expect(() => assertBalancedJournal(broken)).toThrow(
      expect.objectContaining({ code: "JOURNAL_UNBALANCED" }),
    );
    expect(() =>
      paymentReceivedJournal({
        currency: "USD",
        totalMinor: 1000n,
        taxMinor: 2000n,
        sourceId: "x",
        effectiveAt: new Date(),
      }),
    ).toThrow(expect.objectContaining({ code: "JOURNAL_INVALID" }));
  });

  it("posts refunds as balanced reversals", () => {
    const journal = refundExecutedJournal({
      currency: "USD",
      refundMinor: 1500n,
      sourceId: "refund-1",
      effectiveAt: new Date(),
    });
    expect(() => assertBalancedJournal(journal)).not.toThrow();
  });
});

describe("tax (W5)", () => {
  const rules: TaxRateRule[] = [
    { id: "de", percentageBps: 1900, jurisdiction: "DE", effectiveFrom: new Date("2026-01-01") },
    { id: "de-by", percentageBps: 500, jurisdiction: "DE:BY", effectiveFrom: new Date("2026-01-01") },
    { id: "old-de", percentageBps: 1700, jurisdiction: "DE", effectiveFrom: new Date("2025-01-01") },
  ];

  it("picks the most specific, current rate deterministically", () => {
    const at = new Date("2026-06-01");
    expect(resolveEffectiveTaxRate(rules, "DE", at)).toBe(1900);
    expect(resolveEffectiveTaxRate(rules, "DE:BY", at)).toBe(500);
    expect(resolveEffectiveTaxRate(rules, "FR", at)).toBeNull();
    expect(resolveEffectiveTaxRate(rules, "DE", new Date("2024-06-01"))).toBeNull();
    expect(() => assertTaxRateBps(10001)).toThrow();
  });
});

describe("reconciliation (FIN-002)", () => {
  const settlement = {
    provider: "stripe",
    currency: "USD",
    grossMinor: 10000n,
    feeMinor: 300n,
    netMinor: 9700n,
    periodStart: new Date("2026-09-01"),
    periodEnd: new Date("2026-09-30"),
  };

  it("rejects internally inconsistent settlements", () => {
    expect(() => assertSettlementInvariants(settlement)).not.toThrow();
    expect(() =>
      assertSettlementInvariants({ ...settlement, netMinor: 9800n }),
    ).toThrow(expect.objectContaining({ code: "SETTLEMENT_INVALID" }));
  });

  it("reports matched and mismatched periods", () => {
    expect(reconcileSettlement(settlement, 9700n)).toEqual({
      status: "MATCHED",
      deltaMinor: 0n,
    });
    expect(reconcileSettlement(settlement, 9650n)).toEqual({
      status: "MISMATCH",
      deltaMinor: -50n,
    });
  });
});
