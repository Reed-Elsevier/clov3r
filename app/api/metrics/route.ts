import { connection } from "next/server";

import { getMetrics } from "@/lib/metrics/queries";

export async function GET() {
  // Live KPIs: opt out of build-time prerendering.
  await connection();
  try {
    return Response.json(await getMetrics());
  } catch (err) {
    console.error("GET /api/metrics failed", err);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
