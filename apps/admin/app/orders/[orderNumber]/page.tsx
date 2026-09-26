import Link from "next/link";
import { notFound } from "next/navigation";
import { getDemoOrgId, getOperatorContext, getRepos } from "../../../lib/kernel";
import { getOrder } from "@finalshop/application";
import { cancelOrderAction } from "./actions";

export const dynamic = "force-dynamic";

function formatMoney(minor: bigint, currency: string): string {
  return `${(Number(minor) / 100).toFixed(2)} ${currency}`;
}

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const orgId = await getDemoOrgId();
  const repos = getRepos();
  const ctx = await getOperatorContext();

  const byNumber = await repos.orders.findByNumber(orgId, orderNumber);
  if (!byNumber) notFound();
  const view = await getOrder(repos, ctx, { orgId, orderId: byNumber.id });
  const { order, lines } = view;
  const fulfillments = await repos.fulfillments.listByOrder(orgId, order.id);

  return (
    <>
      <h1>
        Order {order.orderNumber}{" "}
        <span className={`badge ${order.status === "CANCELLED" ? "danger" : "ok"}`}>
          {order.status}
        </span>
      </h1>
      <p className="muted">
        Placed {order.placedAt.toISOString().slice(0, 16)}Z · total{" "}
        {formatMoney(order.totalMinor, order.currency)}
      </p>

      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Title</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Line total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td>{line.sku}</td>
              <td>{line.title}</td>
              <td>{line.quantity}</td>
              <td>{formatMoney(line.unitPriceMinor, order.currency)}</td>
              <td>{formatMoney(line.lineTotalMinor, order.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {fulfillments.length > 0 && (
        <>
          <h2>Fulfillments</h2>
          <ul>
            {fulfillments.map((f) => (
              <li key={f.id}>
                {f.kind} — {f.status}
                {f.trackingNumber ? ` · tracking ${f.trackingNumber}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}

      {(order.status === "PENDING_PAYMENT" || order.status === "CONFIRMED") && (
        <form action={cancelOrderAction}>
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="orderNumber" value={order.orderNumber} />
          <p>
            <button className="secondary" type="submit">
              Cancel order
            </button>
          </p>
        </form>
      )}

      <Link href="/orders">← Back to orders</Link>
    </>
  );
}
