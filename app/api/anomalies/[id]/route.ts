import type { NextRequest } from "next/server";
import { getAnomaly, updateAnomalyStatus } from "@/lib/data/anomalies";
import { ANOMALY_STATUSES, type AnomalyStatus } from "@/lib/types/dashboard";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/anomalies/[id]">) {
  const { id } = await ctx.params;
  const anomaly = await getAnomaly(id);
  return anomaly ? Response.json(anomaly) : Response.json({ error: "Not found" }, { status: 404 });
}

// TODO: require an authenticated reviewer once auth exists.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/anomalies/[id]">) {
  const { id } = await ctx.params;
  const body: unknown = await req.json().catch(() => null);
  const status = (body as { status?: unknown } | null)?.status;

  if (!ANOMALY_STATUSES.includes(status as AnomalyStatus)) {
    return Response.json({ error: `status must be one of: ${ANOMALY_STATUSES.join(", ")}` }, { status: 400 });
  }

  const updated = await updateAnomalyStatus(id, status as AnomalyStatus);
  return updated ? Response.json(updated) : Response.json({ error: "Not found" }, { status: 404 });
}
