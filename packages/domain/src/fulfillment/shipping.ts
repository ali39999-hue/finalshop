import { DomainError } from "../errors";

/**
 * Shipping rates (W6): flat-rate / pickup rules resolved deterministically —
 * active, currency- and country-matched, weight-window filtered, cheapest
 * first with a stable id tie-break.
 */

export type ShippingRateKind = "FLAT" | "PICKUP";

export interface ShippingRateRule {
  id: string;
  name: string;
  kind: ShippingRateKind;
  currency: string;
  amountMinor: bigint;
  /** Undefined = no weight ceiling. */
  maxWeightGrams?: number;
  /** Undefined = worldwide. "DE" or "DE:BY" style. */
  country?: string;
  isActive: boolean;
}

export interface ResolvedShippingRate {
  id: string;
  name: string;
  kind: ShippingRateKind;
  amountMinor: bigint;
}

export function resolveShippingRates(
  rules: ShippingRateRule[],
  input: { currency: string; country?: string; weightGrams?: number },
): ResolvedShippingRate[] {
  const eligible = rules.filter((rule) => {
    if (!rule.isActive) return false;
    if (rule.currency !== input.currency) return false;
    if (rule.country !== undefined && input.country !== undefined && rule.country.toUpperCase() !== input.country.toUpperCase()) {
      return false;
    }
    if (rule.maxWeightGrams !== undefined && input.weightGrams !== undefined && input.weightGrams > rule.maxWeightGrams) {
      return false;
    }
    return true;
  });
  eligible.sort(
    (a, b) =>
      (a.amountMinor < b.amountMinor ? -1 : a.amountMinor > b.amountMinor ? 1 : 0) ||
      (a.id < b.id ? -1 : 1),
  );
  return eligible.map((rule) => ({
    id: rule.id,
    name: rule.name,
    kind: rule.kind,
    amountMinor: rule.amountMinor,
  }));
}

export function assertRateAmount(amountMinor: bigint): void {
  if (amountMinor < 0n) {
    throw new DomainError("SHIPPING_RATE_INVALID", String(amountMinor));
  }
}
