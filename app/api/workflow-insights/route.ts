import { getWorkflowInsights } from "@/lib/data/workflow";

export async function GET() {
  return Response.json(await getWorkflowInsights());
}
