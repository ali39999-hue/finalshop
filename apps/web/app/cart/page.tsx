import { cookies } from "next/headers";
import { getRepos } from "../../lib/kernel";
import { removeCartLine, updateCartQuantity } from "../actions";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const repos = getRepos();
  const store = await cookies();
  const cartId = store.get("fs_cart")?.value;
  const cart = cartId ? await repos.carts.findById(cartId) : null;

  if (!cart || cart.items.length === 0) {
    return (
      <>
        <h1>Cart</h1>
        <p className="muted">Your cart is empty.</p>
      </>
    );
  }

  const linesWithPrices = await Promise.all(
    cart.items.map(async (item) => {
      const variant = await repos.variants.findById(item.variantId);
      const product = variant ? await repos.products.findById(variant.productId) : null;
      return { item, variant, product };
    }),
  );

  return (
    <>
      <h1>Cart</h1>
      <ul className="product-grid">
        {linesWithPrices.map(({ item, variant, product }) => (
          <li key={item.id} className="product-card">
            <strong>{product?.title ?? item.variantId}</strong>
            <p className="muted">SKU: {variant?.sku}</p>
            <form action={updateCartQuantity}>
              <input type="hidden" name="variantId" value={item.variantId} />
              <label htmlFor={`qty-${item.id}`}>Quantity</label>
              <input
                id={`qty-${item.id}`}
                name="quantity"
                type="number"
                min={1}
                max={99}
                defaultValue={item.quantity}
              />
              <p>
                <button className="secondary" type="submit">
                  Update
                </button>
              </p>
            </form>
            <form action={removeCartLine}>
              <input type="hidden" name="variantId" value={item.variantId} />
              <button className="secondary" type="submit">
                Remove
              </button>
            </form>
          </li>
        ))}
      </ul>
      <p>
        <a href="/checkout">Proceed to checkout →</a>
      </p>
    </>
  );
}
