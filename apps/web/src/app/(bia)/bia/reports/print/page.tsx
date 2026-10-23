"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton, NoAccess } from "@/components/dashboard/PageStates";
import { BiaGate } from "@/components/dashboard/campaigns/BiaGate";
import { PrintReport } from "@/components/dashboard/bia/PrintReport";

function Print() {
  const sp = useSearchParams();
  const hoodId = sp.get("n");
  if (!hoodId) return <NoAccess title="Pick a street first" body="Open a report from the Reports page." />;
  return <PrintReport hoodId={hoodId} from={sp.get("from") ?? undefined} to={sp.get("to") ?? undefined} label={sp.get("label") ?? "Last 30 days"} auto={sp.get("auto") === "1"} />;
}

/** Print view of the board report: `window.print()` on this page is the PDF. Fits one Letter page. */
export default function BiaReportPrintPage() {
  return (
    <BiaGate>
      {() => (
        <Suspense fallback={<PageSkeleton />}>
          <Print />
        </Suspense>
      )}
    </BiaGate>
  );
}
