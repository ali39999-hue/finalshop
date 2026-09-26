import { NextResponse } from "next/server";
import { getRepos } from "../../../lib/kernel";

export const dynamic = "force-dynamic";

/** W15 health endpoint: DB reachability probe for load balancers. */
export async function GET() {
  const repos = getRepos();
  try {
    await repos.organizations.findBySlug("__healthcheck__");
    return NextResponse.json({ status: "ok", database: "up" });
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        database: "down",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 },
    );
  }
}
