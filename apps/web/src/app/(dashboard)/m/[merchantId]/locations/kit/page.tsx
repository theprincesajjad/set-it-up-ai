"use client";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { QrKitPrint } from "@/components/dashboard/QrKitPrint";
import { PageHeader } from "@/components/dashboard/kit";
import { prizePhrase } from "@/lib/dashboard/program";
import { useApi } from "@/lib/dashboard/useApi";
import { useNeighbourhoods } from "@/lib/dashboard/useNeighbourhoods";

/** Print-ready QR kit (merchant-dashboard.md §10). Printing ticks the "QR stand printed" setup step. */
export default function QrKitPage() {
  const { api, base, detail, role } = useMerchant();
  const params = useSearchParams();
  const kit = useApi(() => api.qrKit(), [api]);
  const hoods = useNeighbourhoods();
  const ob = useApi(role !== "staff" ? () => api.onboarding() : null, [api, role]);
  // The stand and the script talk about "every shop on the street" only when this shop is on one.
  const street = detail.merchant.neighbourhoodId ? (hoods?.find((n) => n.id === detail.merchant.neighbourhoodId)?.name ?? null) : null;
  const rewards = useApi(role !== "staff" ? () => api.rewards() : null, [api, role]);
  const first = rewards.data?.items.find((r) => r.active) ?? rewards.data?.items[0];
  // The program line with the shop's real reward ("Collect 8 stamps, get a free latte"), not "a reward".
  const programLine = (k: { program?: { headline: string } | null } | undefined) => (k?.program?.headline && first ? k.program.headline.replace(/get a reward$/, `get ${prizePhrase(first.name)}`) : (k?.program?.headline ?? null));
  const stepOpen = ob.data ? !ob.data.steps.find((s) => s.key === "qr_kit")?.done && ob.data.steps.some((s) => s.key === "qr_kit") : false;
  const setupHref = params.get("from") === "setup" || stepOpen ? `${base}/setup?step=qr_kit` : null;
  const onPrinted = useCallback(() => {
    if (role !== "staff") void api.completeStep("qr_kit").catch(() => undefined);
  }, [api, role]);
  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <PageHeader flush back={params.get("from") === "setup" ? { href: `${base}/setup?step=qr_kit`, label: "Setup" } : { href: `${base}/locations`, label: "Locations & QR kit" }} title="Print your QR stand" description="Put the stand right next to the till." />
      </div>
      <Async state={kit}>{(k) => <QrKitPrint kit={k} street={street} initialLocationId={params.get("location")} initialSize={params.get("print") === "script" ? "script" : undefined} localScript={ob.data?.playbook.tillLineLocal ?? null} tillLine={ob.data?.playbook.tillLine ?? null} programLine={programLine(k)} setupHref={setupHref} onPrinted={onPrinted} />}</Async>
    </div>
  );
}
