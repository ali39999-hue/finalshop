import { cookies } from "next/headers";
import { getRepos } from "../../lib/kernel";
import { submitCheckout } from "../actions";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const repos = getRepos();
  const store = await cookies();
  const cartId = store.get("fs_cart")?.value;
  const cart = cartId ? await repos.carts.findById(cartId) : null;

  if (!cart || cart.items.length === 0) {
    return (
      <>
        <h1>Checkout</h1>
        <p className="muted">Your cart is empty.</p>
        <a href="/">← Back to shop</a>
      </>
    );
  }

  return (
    <>
      <h1>Checkout</h1>
      <p className="muted">
        Demo checkout: prices are locked from the live quote at submit time.
      </p>
      <form action={submitCheckout}>
        <label htmlFor="name">Full name</label>
        <input id="name" name="name" required maxLength={200} />
        <label htmlFor="line1">Address</label>
        <input id="line1" name="line1" required maxLength={300} />
        <label htmlFor="city">City</label>
        <input id="city" name="city" required maxLength={100} />
        <label htmlFor="country">Country (ISO 2-letter)</label>
        <input id="country" name="country" required minLength={2} maxLength={2} />
        <p>
          <button type="submit">Place order</button>
        </p>
      </form>
    </>
  );
}
