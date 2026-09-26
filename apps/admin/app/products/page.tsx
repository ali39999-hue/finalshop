import Link from "next/link";
import { getDemoOrgId, getOperatorContext, getRepos } from "../../lib/kernel";
import { listPublicProducts } from "@finalshop/application";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; created?: string }>;
}) {
  const { q, created } = await searchParams;
  const orgId = await getDemoOrgId();
  const repos = getRepos();
  const ctx = await getOperatorContext();
  const all = await listPublicProducts(repos, ctx, { orgId, limit: 200 });
  const filtered = q
    ? all.filter((p) =>
        `${p.title} ${p.slug}`.toLowerCase().includes(q.toLowerCase()),
      )
    : all;

  return (
    <>
      <h1>Products</h1>
      {created && <div className="notice">Product created.</div>}
      <p>
        <Link href="/products/new">+ New product</Link>
      </p>
      <form>
        <input
          name="q"
          placeholder="Filter by title or slug…"
          defaultValue={q ?? ""}
        />
        <button type="submit">Filter</button>
      </form>
      {filtered.length === 0 ? (
        <p className="muted">No products match.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Slug</th>
              <th>Variants</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((product) => (
              <tr key={product.id}>
                <td>{product.title}</td>
                <td className="muted">{product.slug}</td>
                <td>{product.variants.length}</td>
                <td>
                  {product.priceMinor === null
                    ? "—"
                    : `${(Number(product.priceMinor) / 100).toFixed(2)} ${
                        product.currency ?? ""
                      }`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
