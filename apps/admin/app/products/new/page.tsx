import Link from "next/link";
import { getDemoOrgId, getOperatorContext, getRepos } from "../../../lib/kernel";
import { createCatalogProduct } from "./actions";

export const dynamic = "force-dynamic";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const orgId = await getDemoOrgId();
  const repos = getRepos();
  await getOperatorContext();
  const priceList = (await repos.priceLists.listByOrg(orgId))[0];

  return (
    <>
      <h1>New product</h1>
      {error && <div className="error">{error}</div>}
      {priceList ? (
        <form action={createCatalogProduct}>
          <label htmlFor="title">Title</label>
          <input id="title" name="title" required maxLength={300} />
          <label htmlFor="slug">Slug (optional — auto-generated from title)</label>
          <input id="slug" name="slug" maxLength={60} />
          <label htmlFor="description">Description</label>
          <input id="description" name="description" maxLength={500} />
          <label htmlFor="sku">SKU</label>
          <input id="sku" name="sku" required maxLength={64} />
          <label htmlFor="price">Price ({priceList.currency})</label>
          <input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0"
            required
          />
          <p>
            <button type="submit">Create product</button>
          </p>
        </form>
      ) : (
        <div className="error">
          No price list exists — the storefront seed creates one; run /setup in
          the web app.
        </div>
      )}
      <p>
        <Link href="/products">← Back to products</Link>
      </p>
    </>
  );
}
