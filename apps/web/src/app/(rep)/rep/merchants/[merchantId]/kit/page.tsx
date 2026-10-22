"use client";
import { ArrowLeft } from "lucide-react";
import { useParams } from "next/navigation";
import { Async } from "@/components/dashboard/PageStates";
import { QrKitPrint } from "@/components/dashboard/QrKitPrint";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Layout";
import { browserApi } from "@/lib/api/browser";
import { useApi } from "@/lib/dashboard/useApi";
import { useNeighbourhoods } from "@/lib/dashboard/useNeighbourhoods";

export default function RepKitPage() {
  const { merchantId } = useParams<{ merchantId: string }>();
  const kit = useApi(() => browserApi.rep.qrKit(merchantId), [merchantId]);
  const detail = useApi(() => browserApi.merchant(merchantId).detail(), [merchantId]);
  const hoods = useNeighbourhoods();
  const street = hoods?.find((h) => h.id === detail.data?.merchant.neighbourhoodId)?.name ?? "the street";
  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <Button variant="ghost" size="sm" iconStart={ArrowLeft} href={`/rep/merchants/${merchantId}`} className="self-start">Merchant</Button>
        <PageHeader title="QR kit" description="Print on the portable printer or save as PDF." />
      </div>
      <Async state={kit}>{(k) => <QrKitPrint kit={k} street={street} onPrinted={() => void browserApi.merchant(merchantId).completeStep("qr_kit").catch(() => undefined)} />}</Async>
    </div>
  );
}
