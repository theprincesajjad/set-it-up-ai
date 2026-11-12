"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton, NoAccess } from "@/components/dashboard/PageStates";
import { Button } from "@/components/ui/Button";
import { BiaGate } from "@/components/dashboard/campaigns/BiaGate";
import { PrintReport } from "@/components/dashboard/bia/PrintReport";

/** Without `?n=` (a bookmark, a refreshed tab) the report is for the street selected in the console, for the default period. */
function Print({ fallbackHoodId }: { fallbackHoodId: string | null }) {
  const sp = useSearchParams();
  const hoodId = sp.get("n") ?? fallbackHoodId;
  if (!hoodId) return <NoAccess title="Pick a street first" body="Open a report from the Reports page." action={<Button href="/bia/reports">Go to Reports</Button>} />;
  return <PrintReport hoodId={hoodId} from={sp.get("from") ?? undefined} to={sp.get("to") ?? undefined} label={sp.get("label") ?? "Last 30 days"} auto={sp.get("auto") === "1"} />;
}

/** Print view of the board report: `window.print()` on this page is the PDF. Fits one Letter page. */
export default function BiaReportPrintPage() {
  return (
    <BiaGate>
      {(_hoods, hood) => (
        <Suspense fallback={<PageSkeleton />}>
          <Print fallbackHoodId={hood?.id ?? null} />
        </Suspense>
      )}
    </BiaGate>
  );
}
