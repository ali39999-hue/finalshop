import { DomainError } from "../errors";
import { getCurrency } from "./currency";

/**
 * Money kernel (PRICE-001): amounts are BigInt minor units — floating point
 * is banned from every financial value (roadmap §7.2). All arithmetic is
 * currency-checked; rounding is explicit (HALF_UP) and currency-aware.
 */
export interface Money {
  readonly currency: string;
  readonly minor: bigint;
}

const INT_REGEX = /^-?\d+$/;

export function money(currency: string, minor: bigint | number | string): Money {
  const c = getCurrency(currency);
  let value: bigint;
  if (typeof minor === "bigint") {
    value = minor;
  } else if (typeof minor === "number") {
    if (!Number.isInteger(minor)) {
      throw new DomainError("MONEY_INVALID", `non-integer minor amount ${minor}`);
    }
    value = BigInt(minor);
  } else {
    if (!INT_REGEX.test(minor)) {
      throw new DomainError("MONEY_INVALID", `malformed minor amount ${minor}`);
    }
    value = BigInt(minor);
  }
  return Object.freeze({ currency: c.code, minor: value });
}

/** Parses a major-unit decimal string ("99.99") exactly — no float math. */
export function moneyFromMajor(currency: string, major: string): Money {
  const c = getCurrency(currency);
  const trimmed = major.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new DomainError("MONEY_INVALID", `malformed amount ${major}`);
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ""] = unsigned.split(".");
  if (fraction.length > c.decimals) {
    throw new DomainError(
      "MONEY_INVALID",
      `${c.code} carries at most ${c.decimals} decimals`,
    );
  }
  const padded = fraction.padEnd(c.decimals, "0");
  const minor = BigInt(whole + (c.decimals > 0 ? padded : ""));
  return money(currency, negative ? -minor : minor);
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new DomainError(
      "CURRENCY_MISMATCH",
      `${a.currency} vs ${b.currency}`,
    );
  }
}

export function moneyAdd(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.currency, a.minor + b.minor);
}

export function moneySubtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.currency, a.minor - b.minor);
}

/** Quantity multiplication: quantities are integers, never floats. */
export function moneyMultiply(a: Money, quantity: number): Money {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new DomainError("MONEY_INVALID", `invalid quantity ${quantity}`);
  }
  return money(a.currency, a.minor * BigInt(quantity));
}

/**
 * Percentage in basis points (10000 bps = 100%), rounded HALF_UP on minor
 * units. Deterministic and float-free.
 */
export function moneyPercentBps(a: Money, bps: number): Money {
  if (!Number.isInteger(bps) || bps < 0) {
    throw new DomainError("MONEY_INVALID", `invalid basis points ${bps}`);
  }
  const scaled = a.minor * BigInt(bps) + 5000n;
  return money(a.currency, scaled / 10000n);
}

/**
 * Splits an amount into `parts` shares proportionally to the weights using
 * the largest-remainder method — the parts always sum back to the original.
 */
export function moneyAllocate(a: Money, weights: number[]): Money[] {
  if (weights.length === 0) {
    throw new DomainError("MONEY_INVALID", "allocation needs at least one part");
  }
  if (weights.some((w) => !Number.isInteger(w) || w < 0)) {
    throw new DomainError("MONEY_INVALID", "allocation weights must be non-negative integers");
  }
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total === 0) {
    throw new DomainError("MONEY_INVALID", "allocation weight sum must be positive");
  }
  const raw = weights.map((w) => (a.minor * BigInt(w)) / BigInt(total));
  let remainder = a.minor - raw.reduce((sum, r) => sum + r, 0n);
  // Distribute the leftover minor units to the largest fractional parts.
  const order = weights
    .map((w, i) => ({
      i,
      frac: a.minor * BigInt(w) - raw[i]! * BigInt(total),
    }))
    .sort((x, y) => (y.frac > x.frac ? 1 : y.frac < x.frac ? -1 : x.i - y.i));
  const result = [...raw];
  for (const { i } of order) {
    if (remainder === 0n) break;
    result[i] = result[i]! + 1n;
    remainder -= 1n;
  }
  return result.map((minor) => money(a.currency, minor));
}

export function moneyCompare(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function moneyMin(a: Money, b: Money): Money {
  return moneyCompare(a, b) <= 0 ? a : b;
}

export function moneyIsZero(a: Money): boolean {
  return a.minor === 0n;
}

export function moneyIsNegative(a: Money): boolean {
  return a.minor < 0n;
}
