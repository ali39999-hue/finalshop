import { DomainError } from "../errors";
import type { ProductOption } from "./types";

export const MAX_PRODUCT_OPTIONS = 3;
export const MAX_CATEGORY_DEPTH = 5;
export const SKU_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** SKU: 1–64 chars, letters/digits/dash/underscore, no whitespace. */
export function assertValidSku(sku: string): string {
  const value = sku.trim();
  if (!SKU_REGEX.test(value)) {
    throw new DomainError("SKU_INVALID", `sku ${JSON.stringify(sku)} is invalid`);
  }
  return value;
}

/** Variant weight in grams: non-negative integer, ≤ 2 tonnes. */
export function assertValidWeightGrams(
  weightGrams: number | undefined,
): number | undefined {
  if (weightGrams === undefined) return undefined;
  if (!Number.isInteger(weightGrams) || weightGrams < 0 || weightGrams > 2_000_000) {
    throw new DomainError("WEIGHT_INVALID", String(weightGrams));
  }
  return weightGrams;
}

/** ≤3 options, unique non-empty names, each with ≥1 unique non-empty value. */
export function assertValidProductOptions(
  options: ProductOption[],
): ProductOption[] {
  if (options.length > MAX_PRODUCT_OPTIONS) {
    throw new DomainError(
      "PRODUCT_OPTIONS_INVALID",
      `at most ${MAX_PRODUCT_OPTIONS} options are allowed`,
    );
  }
  const seenNames = new Set<string>();
  for (const option of options) {
    const name = option.name.trim();
    if (name.length === 0) {
      throw new DomainError("PRODUCT_OPTIONS_INVALID", "option name is required");
    }
    const key = name.toLowerCase();
    if (seenNames.has(key)) {
      throw new DomainError("PRODUCT_OPTIONS_INVALID", `duplicate option ${name}`);
    }
    seenNames.add(key);
    if (option.values.length === 0) {
      throw new DomainError("PRODUCT_OPTIONS_INVALID", `option ${name} needs values`);
    }
    const seenValues = new Set<string>();
    for (const raw of option.values) {
      const value = raw.trim();
      if (value.length === 0) {
        throw new DomainError("PRODUCT_OPTIONS_INVALID", `option ${name} has an empty value`);
      }
      if (seenValues.has(value)) {
        throw new DomainError("PRODUCT_OPTIONS_INVALID", `option ${name} has duplicate value ${value}`);
      }
      seenValues.add(value);
    }
  }
  return options;
}

/**
 * A variant must carry exactly one value per product option — no missing
 * keys, no extras (mass-assignment discipline, threat T-07). Products without
 * options take a single variant with empty optionValues.
 */
export function assertVariantMatchesOptions(
  options: ProductOption[],
  optionValues: Record<string, string>,
): Record<string, string> {
  if (options.length === 0) {
    if (Object.keys(optionValues).length > 0) {
      throw new DomainError(
        "VARIANT_OPTIONS_MISMATCH",
        "product has no options; optionValues must be empty",
      );
    }
    return optionValues;
  }
  for (const option of options) {
    const value = optionValues[option.name];
    if (value === undefined) {
      throw new DomainError(
        "VARIANT_OPTIONS_MISMATCH",
        `missing value for option ${option.name}`,
      );
    }
    if (!option.values.includes(value)) {
      throw new DomainError(
        "VARIANT_OPTIONS_MISMATCH",
        `value ${value} is not valid for option ${option.name}`,
      );
    }
  }
  for (const key of Object.keys(optionValues)) {
    if (!options.some((o) => o.name === key)) {
      throw new DomainError(
        "VARIANT_OPTIONS_MISMATCH",
        `unknown option ${key}`,
      );
    }
  }
  return optionValues;
}

/**
 * `ancestorCount` is the number of ancestors above the node being created
 * (parent included). The new node's depth is ancestorCount + 1.
 */
export function assertCategoryDepth(ancestorCount: number): void {
  if (ancestorCount + 1 > MAX_CATEGORY_DEPTH) {
    throw new DomainError(
      "CATEGORY_DEPTH_EXCEEDED",
      `categories nest at most ${MAX_CATEGORY_DEPTH} levels`,
    );
  }
}
