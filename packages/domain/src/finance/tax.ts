import { DomainError } from "../errors";

/**
 * Tax (W5): percentage rates in basis points, scoped to a jurisdiction
 * ("IR" or "IR:THR" — more specific wins), with effective-date windows.
 * Amounts always flow through the money kernel's HALF_UP rounding.
 */

export interface TaxRateRule {
  id: string;
  percentageBps: number;
  /** ISO country or country:region, e.g. "DE" or "DE:BY". */
  jurisdiction: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
}

export function assertTaxRateBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new DomainError("TAX_RATE_INVALID", String(bps));
  }
}

/**
 * Deterministic pick: jurisdiction specificity (longest match) first, then
 * the latest effectiveFrom, then id — so the same inputs always yield the
 * same rate.
 */
export function resolveEffectiveTaxRate(
  rules: TaxRateRule[],
  jurisdiction: string,
  at: Date,
): number | null {
  const candidates = rules.filter((rule) => {
    if (!jurisdictionMatches(rule.jurisdiction, jurisdiction)) return false;
    if (at < rule.effectiveFrom) return false;
    if (rule.effectiveTo && at > rule.effectiveTo) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const specificity = b.jurisdiction.length - a.jurisdiction.length;
    if (specificity !== 0) return specificity;
    const recency = b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
    if (recency !== 0) return recency;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return candidates[0]!.percentageBps;
}

function jurisdictionMatches(pattern: string, jurisdiction: string): boolean {
  const p = pattern.trim().toUpperCase();
  const j = jurisdiction.trim().toUpperCase();
  return j === p || j.startsWith(`${p}:`);
}
