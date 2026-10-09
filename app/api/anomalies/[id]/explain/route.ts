import type { NextRequest } from "next/server";

import { ExplanationRejectedError } from "@/lib/explanations/generate";
import { explainAnomaly } from "@/lib/explanations/service";
import { anomalySchema } from "@/lib/schemas";

const idSchema = anomalySchema.shape.anomaly_id;

/**
 * Generates (or returns the existing) AI explanation for one anomaly.
 * Idempotent unless `?regenerate=true`. 201 when newly generated, 200 when cached.
 */
// TODO: require an authenticated reviewer once auth exists — each call can incur Bedrock cost.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/anomalies/[id]/explain">) {
  const id = idSchema.safeParse((await ctx.params).id);
  if (!id.success) return Response.json({ error: "Invalid anomaly id" }, { status: 400 });
  const regenerate = req.nextUrl.searchParams.get("regenerate") === "true";

  try {
    const result = await explainAnomaly(id.data, { regenerate });
    if (!result) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(result, { status: result.generated ? 201 : 200 });
  } catch (err) {
    if (err instanceof ExplanationRejectedError) {
      return Response.json({ error: "Generated explanation failed verification", reasons: err.reasons }, { status: 422 });
    }
    console.error(`POST /api/anomalies/${id.data}/explain failed`, err);
    return Response.json({ error: "Explanation service unavailable" }, { status: 502 });
  }
}
