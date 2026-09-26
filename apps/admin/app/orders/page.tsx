import Link from "next/link";
import { getDemoOrgId, getOperatorContext, getRepos } from "../../lib/kernel";

export const dynamic = "force-dynamic";

function formatMoney(minor: bigint, currency: string): string {
  return `${(Number(minor) / 100).toFixed(2)} ${currency}`;
}

const STATUS_FILTERS = ["PENDING_PAYMENT", "CONFIRMED", "CANCELLED"] as const;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const orgId = await getDemoOrgId();
  const repos = getRepos();
  await getOperatorContext();

  const statusFilter =
    status && (STATUS_FILTERS as readonly string[]).includes(status)
      ? status
      : undefined;
  const all = (
    await Promise.all(
      STATUS_FILTERS.map((s) => repos.orders.listByStatus(orgId, s)),
    )
  )
    .flat()
    .sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());
  const filtered = statusFilter
    ? all.filter((o) => o.status === statusFilter)
    : all;

  return (
    <>
      <h1>Orders</h1>
      <p className="muted">
        Filter:{" "}
        <Link href="/orders">all</Link>
        {" · "}
        <Link href="/orders?status=PENDING_PAYMENT">pending</Link>
        {" · "}
        <Link href="/orders?status=CONFIRMED">confirmed</Link>
        {" · "}
        <Link href="/orders?status=CANCELLED">cancelled</Link>
        {statusFilter ? ` (showing ${statusFilter})` : ""}
      </p>
      {filtered.length === 0 ? (
        <p className="muted">No orders yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Status</th>
              <th>Total</th>
              <th>Placed</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/orders/${order.orderNumber}`}>{order.orderNumber}</Link>
                </td>
                <td>
                  <span className={`badge ${order.status === "CANCELLED" ? "danger" : "ok"}`}>
                    {order.status}
                  </span>
                </td>
                <td>{formatMoney(order.totalMinor, order.currency)}</td>
                <td className="muted">{order.placedAt.toISOString().slice(0, 16)}Z</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
