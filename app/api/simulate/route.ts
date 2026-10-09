import type { NextRequest } from "next/server";
import { getSimulatorBaseline } from "@/lib/data/simulator";
import { projectImpact } from "@/lib/simulator/project";
import type { SimulatorAssumptions } from "@/lib/types/dashboard";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const pct = (key: keyof SimulatorAssumptions) => Math.min(100, Math.max(0, Number(sp.get(key)) || 0));

  const assumptions: SimulatorAssumptions = {
    automatedValidationPct: pct("automatedValidationPct"),
    processingTimeReductionPct: pct("processingTimeReductionPct"),
    manualReviewReductionPct: pct("manualReviewReductionPct"),
  };
  const baseline = await getSimulatorBaseline();

  return Response.json({ baseline, assumptions, projection: projectImpact(baseline, assumptions), label: "Projected / Assumption" });
}
