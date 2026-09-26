import { notFound } from "next/navigation";
import { getDemoOrgId, getRepos, getShopperContext } from "../../../lib/kernel";
import { track } from "../../../lib/analytics";
import { getPublicProductBySlug } from "@finalshop/application";
import { addToCart } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const orgId = await getDemoOrgId();
  const repos = getRepos();
  const ctx = await getShopperContext();
  const product = await getPublicProductBySlug(repos, ctx, { orgId, slug });
  if (!product) notFound();

  await track(repos, ctx, "product.viewed@1", { productId: product.id });

  function formatPrice(minor: bigint | null, currency: string | null): string {
    if (minor === null || currency === null) return "—";
    return `${(Number(minor) / 100).toFixed(2)} ${currency}`;
  }

  return (
    <>
      <h1>{product.title}</h1>
      <p className="price">{formatPrice(product.priceMinor, product.currency)}</p>
      {product.description && <p>{product.description}</p>}

      <form action={addToCart}>
        <input type="hidden" name="variantId" value={product.variants[0]?.id ?? ""} />
        <label htmlFor="quantity">Quantity</label>
        <input
          id="quantity"
          name="quantity"
          type="number"
          min={1}
          max={99}
          defaultValue={1}
        />
        <p>
          <button type="submit">Add to cart</button>
        </p>
      </form>

      <h2>Variants</h2>
      <ul>
        {product.variants.map((variant) => (
          <li key={variant.id}>
            <span className="muted">{variant.sku}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
