import { Suspense } from "react";
import { PageSkeleton } from "@/components/dashboard/Panel";
import { PageHeader, Tag } from "@/components/dashboard/ui";
import { ImpactSimulator } from "@/components/simulator/ImpactSimulator";
import { getSimulatorBaseline } from "@/lib/data/simulator";

export default function SimulatorPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Impact Simulator"
        subtitle="Explore hypothetical scenarios against current baseline metrics"
        action={<Tag tone="projected">All outputs are projections</Tag>}
      />
      <Suspense fallback={<PageSkeleton blocks={2} />}>
        <SimulatorContent />
      </Suspense>
    </div>
  );
}

async function SimulatorContent() {
  const baseline = await getSimulatorBaseline();
  return <ImpactSimulator baseline={baseline} />;
}
