/**
 * Currency registry (PRICE-001). Only currencies registered here can back a
 * Money value; unknown currencies are rejected at construction, never at
 * settlement time.
 */
export interface Currency {
  /** ISO 4217 code. */
  code: string;
  /** Minor units per major unit (JPY=0, USD=2, BHD=3). */
  decimals: number;
}

export const CURRENCIES: Record<string, Currency> = {
  USD: { code: "USD", decimals: 2 },
  EUR: { code: "EUR", decimals: 2 },
  GBP: { code: "GBP", decimals: 2 },
  CHF: { code: "CHF", decimals: 2 },
  CAD: { code: "CAD", decimals: 2 },
  AUD: { code: "AUD", decimals: 2 },
  AED: { code: "AED", decimals: 2 },
  SAR: { code: "SAR", decimals: 2 },
  TRY: { code: "TRY", decimals: 2 },
  BHD: { code: "BHD", decimals: 3 },
  JPY: { code: "JPY", decimals: 0 },
  KRW: { code: "KRW", decimals: 0 },
  IRR: { code: "IRR", decimals: 0 },
};

export function getCurrency(code: string): Currency {
  const currency = CURRENCIES[code.toUpperCase()];
  if (!currency) {
    throw new Error(`unsupported currency: ${code}`);
  }
  return currency;
}

export function isSupportedCurrency(code: string): boolean {
  return code.toUpperCase() in CURRENCIES;
}
