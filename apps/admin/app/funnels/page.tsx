import { getDemoOrgId, getOperatorContext, getRepos } from "../../lib/kernel";
import { funnelReport } from "@finalshop/application";
import type { FunnelResult } from "@finalshop/domain";

export const dynamic = "force-dynamic";

const DEFAULT_STEPS = ["cart.updated@1", "checkout.started@1", "order.placed@1"];

export default async function FunnelsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await searchParams;
  const daysN = Math.min(Math.max(Number(days ?? 7) || 7, 1), 90);
  const orgId = await getDemoOrgId();
  const repos = getRepos();
  const ctx = await getOperatorContext();
  const from = new Date(Date.now() - daysN * 86_400_000);
  const to = new Date();

  let funnel: FunnelResult | undefined;
  let error = "";
  try {
    funnel = await funnelReport(repos, ctx, {
      orgId,
      steps: DEFAULT_STEPS,
      from,
      to,
    });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  if (!funnel) {
    return (
      <>
        <h1>Funnels</h1>
        <div className="error">{error || "No funnel data"}</div>
      </>
    );
  }

  return (
    <>
      <h1>Funnels</h1>
      <p className="muted">
        Shopper sessions over the last {daysN} days (events collected by the
        storefront).
      </p>
      {error ? (
        <div className="error">{error}</div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Step</th>
                <th>Sessions</th>
                <th>Conversion</th>
              </tr>
            </thead>
            <tbody>
              {DEFAULT_STEPS.map((step, index) => (
                <tr key={step}>
                  <td>{step}</td>
                  <td>{funnel.counts[index]}</td>
                  <td>
                    {index === 0
                      ? "100%"
                      : `${Math.round((funnel.conversionRates[index] ?? 0) * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
