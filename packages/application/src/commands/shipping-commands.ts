import { z } from "zod";
import {
  DomainError,
  type TenantContext,
  isSupportedCurrency,
  resolveShippingRates,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant } from "@finalshop/auth";
import type { Repositories } from "../ports";

const CreateShippingRateInput = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1).max(200),
  kind: z.enum(["FLAT", "PICKUP"]),
  currency: z.string().min(3).max(3),
  amountMinor: z.string().regex(/^\d+$/),
  maxWeightGrams: z.number().int().min(1).optional(),
  country: z.string().length(2).optional(),
});

export async function createShippingRate(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof CreateShippingRateInput>,
) {
  const parsed = CreateShippingRateInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "fulfillment.manage");
  if (!isSupportedCurrency(parsed.currency)) {
    throw new DomainError("CURRENCY_UNSUPPORTED", parsed.currency);
  }
  return repos.shippingRates.create({
    orgId: parsed.orgId,
    name: parsed.name,
    kind: parsed.kind,
    currency: parsed.currency.toUpperCase(),
    amountMinor: BigInt(parsed.amountMinor),
    ...(parsed.maxWeightGrams !== undefined && {
      maxWeightGrams: parsed.maxWeightGrams,
    }),
    ...(parsed.country !== undefined && { country: parsed.country.toUpperCase() }),
  });
}

/** Public checkout query: eligible rates, cheapest first. */
export async function listShippingRates(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; currency: string; country?: string; weightGrams?: number },
) {
  const parsed = z
    .object({
      orgId: z.string().min(1),
      currency: z.string().min(3).max(3),
      country: z.string().length(2).optional(),
      weightGrams: z.number().int().min(0).optional(),
    })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const records = await repos.shippingRates.listActive(
    parsed.orgId,
    parsed.currency.toUpperCase(),
  );
  const rules = records.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    currency: r.currency,
    amountMinor: r.amountMinor,
    ...(r.maxWeightGrams !== null && { maxWeightGrams: r.maxWeightGrams }),
    ...(r.country !== null && { country: r.country }),
    isActive: r.isActive,
  }));
  return resolveShippingRates(rules, {
    currency: parsed.currency.toUpperCase(),
    ...(parsed.country !== undefined && { country: parsed.country }),
    ...(parsed.weightGrams !== undefined && { weightGrams: parsed.weightGrams }),
  });
}
