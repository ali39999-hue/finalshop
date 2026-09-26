import Link from "next/link";
import { notFound } from "next/navigation";
import { getDemoOrgId, getRepos, getShopperContext } from "../../../lib/kernel";
import { getOrder } from "@finalshop/application";
import { confirmOrderPaymentDemo } from "../../actions";

export const dynamic = "force-dynamic";

function formatMoney(minor: bigint, currency: string): string {
  return `${(Number(minor) / 100).toFixed(2)} ${currency}`;
}

export default async function OrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const orgId = await getDemoOrgId();
  const repos = getRepos();
  const ctx = await getShopperContext();

  const byNumber = await repos.orders.findByNumber(orgId, orderNumber);
  if (!byNumber) notFound();
  const view = await getOrder(repos, ctx, { orgId, orderId: byNumber.id });
  const { order, lines } = view;

  return (
    <>
      <h1>Order {order.orderNumber}</h1>
      <p>
        Status: <strong>{order.status}</strong>
      </p>
      <ul>
        {lines.map((line) => (
          <li key={line.id}>
            {line.quantity}× {line.title}{" "}
            <span className="muted">({line.sku})</span> —{" "}
            {formatMoney(line.lineTotalMinor, order.currency)}
          </li>
        ))}
      </ul>
      <p>
        Total: <strong>{formatMoney(order.totalMinor, order.currency)}</strong>
      </p>

      {order.status === "PENDING_PAYMENT" && (
        <form action={confirmOrderPaymentDemo}>
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="orderNumber" value={order.orderNumber} />
          <p>
            <button type="submit">Confirm payment (demo gateway)</button>
          </p>
          <p className="muted">
            In production the Stripe adapter + webhook inbox confirm the payment
            (W5); this button simulates the gateway callback.
          </p>
        </form>
      )}

      <Link href="/">← Continue shopping</Link>
    </>
  );
}
