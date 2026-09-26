import { NextResponse } from "next/server";
import { getRepos } from "../../../lib/kernel";

export const dynamic = "force-dynamic";

/** W15 health endpoint for the ERP console. */
export async function GET() {
  try {
    await getRepos().organizations.findBySlug("__healthcheck__");
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
