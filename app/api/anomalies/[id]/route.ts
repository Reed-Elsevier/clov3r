import type { NextRequest } from "next/server";
import { getAnomalyDetail, updateAnomalyStatus } from "@/lib/data/anomalies";
import { anomalySchema, updateAnomalyStatusSchema } from "@/lib/schemas";

const idSchema = anomalySchema.shape.anomaly_id;

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/anomalies/[id]">) {
  const id = idSchema.safeParse((await ctx.params).id);
  if (!id.success) return Response.json({ error: "Invalid anomaly id" }, { status: 400 });
  const detail = await getAnomalyDetail(id.data);
  return detail ? Response.json(detail) : Response.json({ error: "Not found" }, { status: 404 });
}

// TODO: require an authenticated reviewer once auth exists.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/anomalies/[id]">) {
  const id = idSchema.safeParse((await ctx.params).id);
  if (!id.success) return Response.json({ error: "Invalid anomaly id" }, { status: 400 });

  const body = updateAnomalyStatusSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid body", issues: body.error.issues }, { status: 400 });

  const updated = await updateAnomalyStatus(id.data, body.data.status);
  return updated ? Response.json(updated) : Response.json({ error: "Not found" }, { status: 404 });
}
