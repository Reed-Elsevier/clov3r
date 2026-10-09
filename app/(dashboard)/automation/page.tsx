import { Suspense } from "react";
import { EmptyState, PageSkeleton } from "@/components/dashboard/Panel";
import { PageHeader } from "@/components/dashboard/ui";
import { OpportunityList } from "@/components/automation/OpportunityList";
import { getAutomationOpportunities } from "@/lib/data/automation";

export default function AutomationPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Automation Opportunities" subtitle="Process improvements ranked by frequency, effort, impact, feasibility and confidence" />
      <Suspense fallback={<PageSkeleton />}>
        <AutomationContent />
      </Suspense>
    </div>
  );
}

async function AutomationContent() {
  const { opportunities } = await getAutomationOpportunities();
  return (
    <>
      {opportunities.length ? <OpportunityList opportunities={opportunities} /> : <EmptyState />}
    </>
  );
}
