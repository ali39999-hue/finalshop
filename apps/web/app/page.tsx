import Link from "next/link";
import { getDemoOrgId, getRepos, getShopperContext } from "../lib/kernel";
import { listPublicProducts, searchCatalog } from "@finalshop/application";

export const dynamic = "force-dynamic";

function formatPrice(minor: bigint | null, currency: string | null): string {
  if (minor === null || currency === null) return "—";
  return `${(Number(minor) / 100).toFixed(2)} ${currency}`;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  try {
    const orgId = await getDemoOrgId();
    const repos = getRepos();
    const ctx = await getShopperContext();

    const results = q
      ? (await searchCatalog(repos, ctx, {
          orgId,
          text: q,
          kind: "product",
          limit: 50,
        })).map((doc) => ({
          entityId: doc.entityId,
          slug: doc.slug,
          title: doc.title,
          description: doc.body,
          priceMinor: doc.priceMinor,
          currency: doc.currency,
        }))
      : (await listPublicProducts(repos, ctx, { orgId })).map((p) => ({
          entityId: p.id,
          slug: p.slug,
          title: p.title,
          description: p.description,
          priceMinor: p.priceMinor,
          currency: p.currency,
        }));

    return (
      <>
        <h1>Shop</h1>
        <form>
          <input
            name="q"
            placeholder="Search products…"
            defaultValue={q ?? ""}
          />
          <button type="submit">Search</button>
        </form>
        {results.length === 0 ? (
          <p className="muted">
            {q ? `Nothing matches "${q}".` : "No products yet. Open /setup to seed the demo store."}
          </p>
        ) : (
          <ul className="product-grid">
            {results.map((product) => (
              <li key={product.entityId} className="product-card">
                <Link href={`/products/${product.slug}`}>{product.title}</Link>
                <p className="price">{formatPrice(product.priceMinor, product.currency)}</p>
                <p className="muted">{product.description ?? ""}</p>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("STOREFRONT_NOT_SEEDED")) {
      return (
        <div className="notice">
          The demo store is not seeded yet. Open <Link href="/setup">/setup</Link>{" "}
          to create it (requires the local database from{" "}
          <code>infra/docker</code>).
        </div>
      );
    }
    return <div className="error">{message}</div>;
  }
}
