"use client";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { QrKitPrint } from "@/components/dashboard/QrKitPrint";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Layout";
import { useApi } from "@/lib/dashboard/useApi";
import { useNeighbourhoods } from "@/lib/dashboard/useNeighbourhoods";

/** Print-ready QR kit (merchant-dashboard.md §10). Printing ticks the "QR stand printed" setup step. */
export default function QrKitPage() {
  const { api, base, detail, role } = useMerchant();
  const params = useSearchParams();
  const kit = useApi(() => api.qrKit(), [api]);
  const hoods = useNeighbourhoods();
  const street = hoods?.find((n) => n.id === detail.merchant.neighbourhoodId)?.name ?? "the street";
  const onPrinted = useCallback(() => {
    if (role !== "staff") void api.completeStep("qr_kit").catch(() => undefined);
  }, [api, role]);
  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <Button variant="ghost" size="sm" iconStart={ArrowLeft} href={`${base}/locations`} className="self-start">
          Locations
        </Button>
        <PageHeader title="Print your QR kit" description="Put the stand right next to the till. Customers scan it to join in 30 seconds." />
      </div>
      <Async state={kit}>{(k) => <QrKitPrint kit={k} street={street} initialLocationId={params.get("location")} onPrinted={onPrinted} />}</Async>
    </div>
  );
}
