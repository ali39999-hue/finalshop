"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addVariant,
  createProduct,
  setPrice,
} from "@finalshop/application";
import { getDemoOrgId, getOperatorContext, getRepos } from "../../../lib/kernel";

const MINOR_REGEX = /^\d+$/;

/**
 * W10 ERP slice: catalog management. Creates the product, its default
 * variant, and its launch price in one action — the same composite flow the
 * kernel commands guard individually.
 */
export async function createCatalogProduct(formData: FormData) {
  const orgId = await getDemoOrgId();
  const repos = getRepos();
  const ctx = await getOperatorContext();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const priceMajor = String(formData.get("price") ?? "").trim();

  const slug =
    slugInput ||
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

  let failReason = "";
  try {
    if (!title || !sku) {
      throw new Error("fill in title and SKU");
    }
    // UI decimal "25.50" → kernel minor units 2550 (USD = 2 decimals).
    const major = Number(priceMajor);
    if (!Number.isFinite(major) || major < 0) {
      throw new Error("price must be a non-negative number");
    }
    const minor = Math.round(major * 100);
    if (!MINOR_REGEX.test(minor.toString())) {
      throw new Error("price rounds to an invalid amount");
    }
    if (!slug) {
      throw new Error("a slug is required (auto-slugs need ASCII titles)");
    }
    const priceList = (await repos.priceLists.listByOrg(orgId))[0];
    if (!priceList) {
      throw new Error("no price list exists yet — create one first");
    }
    const product = await createProduct(repos, ctx, {
      orgId,
      title,
      slug,
      description: description || undefined,
    });
    await addVariant(repos, ctx, {
      orgId,
      productId: product.id,
      sku,
      optionValues: {},
    });
    await setPrice(repos, ctx, {
      orgId,
      priceListId: priceList.id,
      variantId: (await repos.variants.findBySku(orgId, sku))!.id,
      minQuantity: 1,
      unitPriceMinor: minor.toString(),
    });
  } catch (error) {
    failReason = error instanceof Error ? error.message : "product could not be created";
  }
  if (failReason) {
    redirect(`/products/new?error=${encodeURIComponent(failReason)}`);
  }
  revalidatePath("/products");
  redirect("/products?created=1");
}
