"use server";

import { revalidatePath } from "next/cache";
import { getRepos } from "../../lib/kernel";
import {
  addVariant,
  createOrganization,
  createPage,
  createPriceList,
  createProduct,
  createTheme,
  publishPage,
  reindexOrg,
  savePageRevision,
  setPrice,
  transitionProductStatus,
} from "@finalshop/application";

/**
 * Idempotent demo seed: creates the demo org, an ACTIVE priced product, and
 * a published page. Safe to run repeatedly — existing slugs are detected.
 */
export async function seedDemoStore(): Promise<{ ok: boolean; message: string }> {
  const repos = getRepos();
  const slug = process.env.DEMO_ORG_SLUG ?? "demo";

  let org = await repos.organizations.findBySlug(slug);
  if (!org) {
    const owner = await repos.users.create({
      email: "owner@demo.finalshop",
      name: "Demo Owner",
    });
    const created = await createOrganization(repos, {
      name: "Demo Store",
      slug,
      ownerUserId: owner.id,
    });
    org = created.organization;
  }
  const orgId = org.id;
  const ownerCtx = { orgId, userId: "demo-owner", role: "OWNER" as const };

  // Theme (THEME-001 with a11y contrast guard satisfied).
  if ((await repos.themes.listByOrg(orgId)).length === 0) {
    await createTheme(repos, ownerCtx, {
      orgId,
      name: "Default",
      tokens: {
        colors: { background: "#ffffff", text: "#1a1a1a", primary: "#0b5fff" },
        typography: { fontFamily: "Inter", scale: { base: 16, lg: 20 } },
        spacing: { sm: 4, md: 8 },
        radius: { md: 8 },
        shadow: { card: "0 1px 2px rgba(0,0,0,.1)" },
        motion: { durationMs: 150, easing: "ease-out" },
      },
    });
  }

  const priceList =
    (await repos.priceLists.listByOrg(orgId))[0] ??
    (await createPriceList(repos, ownerCtx, {
      orgId,
      currency: "USD",
      priority: 10,
    }));

  if (!(await repos.products.findBySlug(orgId, "classic-tee"))) {
    const created = await createProduct(repos, ownerCtx, {
      orgId,
      title: "Classic Tee",
      slug: "classic-tee",
      description: "Soft cotton tee, demo catalog",
    });
    const variant = await addVariant(repos, ownerCtx, {
      orgId,
      productId: created.id,
      sku: "TEE-OS",
      optionValues: {},
      weightGrams: 200,
    });
    await setPrice(repos, ownerCtx, {
      orgId,
      priceListId: priceList.id,
      variantId: variant.id,
      minQuantity: 1,
      unitPriceMinor: "2500",
    });
    await transitionProductStatus(repos, ownerCtx, {
      orgId,
      productId: created.id,
      status: "ACTIVE",
    });
  }

  if (!(await repos.pages.findBySlug(orgId, "home", "en"))) {
    const { page } = await createPage(repos, ownerCtx, {
      orgId,
      title: "Home",
      slug: "home",
      schema: {
        id: "root",
        type: "layout.section",
        props: {},
        children: [
          {
            id: "hero",
            type: "content.text",
            props: { text: "Welcome to the demo store" },
            children: [],
          },
        ],
      },
    });
    await savePageRevision(repos, ownerCtx, {
      orgId,
      pageId: page.id,
      schema: {
        id: "root",
        type: "layout.section",
        props: {},
        children: [
          {
            id: "hero-2",
            type: "content.text",
            props: { text: "Welcome to the demo store — refreshed" },
            children: [],
          },
        ],
      },
    });
    await publishPage(repos, ownerCtx, { orgId, pageId: page.id });
  }

  await reindexOrg(repos, ownerCtx, { orgId });
  revalidatePath("/");
  return {
    ok: true,
    message: "Demo store seeded: theme, priced product (ACTIVE), published page.",
  };
}
