import { getDemoOrgId, getOperatorContext, getRepos } from "../lib/kernel";
import { listOperationsExceptions } from "@finalshop/application";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  STALE_PENDING_PAYMENT: "Awaiting payment",
  UNFULFILLED_ORDER: "Nothing shipped",
  OUT_OF_STOCK: "Out of stock",
  PENDING_REFUND: "Refund pending",
  PENDING_RETURN: "RMA pending",
};

export default async function DashboardPage() {
  try {
    const orgId = await getDemoOrgId();
    const repos = getRepos();
    const ctx = await getOperatorContext();
    const exceptions = await listOperationsExceptions(repos, ctx, {
      orgId,
      staleHours: 24,
    });

    return (
      <>
        <h1>Operations dashboard</h1>
        {exceptions.length === 0 ? (
          <div className="notice">All clear — no exceptions need attention.</div>
        ) : (
          <div className="card">
            <h2>Exceptions ({exceptions.length})</h2>
            <table>
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Reference</th>
                  <th>Detail</th>
                  <th>Age</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((exception, index) => (
                  <tr key={`${exception.kind}-${exception.ref}-${index}`}>
                    <td>
                      <span className="badge danger">
                        {KIND_LABELS[exception.kind] ?? exception.kind}
                      </span>
                    </td>
                    <td>{exception.ref}</td>
                    <td>{exception.detail}</td>
                    <td className="muted">
                      {exception.ageHours > 0 ? `${exception.ageHours}h` : "now"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("ADMIN_NOT_SEEDED")) {
      return (
        <div className="notice">
          Seed the demo store first via the web app at{" "}
          <a href="http://localhost:3000/setup">localhost:3000/setup</a>.
        </div>
      );
    }
    return <div className="error">{message}</div>;
  }
}
