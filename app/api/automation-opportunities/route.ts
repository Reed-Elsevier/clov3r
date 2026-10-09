import { getAutomationOpportunities } from "@/lib/data/automation";

export async function GET() {
  return Response.json(await getAutomationOpportunities());
}
