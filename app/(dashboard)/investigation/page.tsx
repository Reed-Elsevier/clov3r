import { Suspense } from "react";
import { PageSkeleton } from "@/components/dashboard/Panel";
import { PageHeader, SampleDataBanner } from "@/components/dashboard/ui";
import { AnomalyExplorer } from "@/components/investigation/AnomalyExplorer";
import { anomaliesSource, listAnomalies } from "@/lib/data/anomalies";

export default function InvestigationPage({ searchParams }: PageProps<"/investigation">) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Anomaly Investigation" subtitle="Search detected anomalies and review the evidence behind each one" />
      <Suspense fallback={<PageSkeleton blocks={1} />}>
        <InvestigationContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function InvestigationContent({ searchParams }: { searchParams: PageProps<"/investigation">["searchParams"] }) {
  const { q } = await searchParams;
  const initialQuery = typeof q === "string" ? q.slice(0, 100) : "";
  const rows = await listAnomalies();
  return (
    <>
      <SampleDataBanner source={anomaliesSource} />
      <AnomalyExplorer key={initialQuery} initialRows={rows} initialQuery={initialQuery} />
    </>
  );
}
