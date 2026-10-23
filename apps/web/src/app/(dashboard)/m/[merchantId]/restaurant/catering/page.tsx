"use client";
import { Plus } from "lucide-react";
import { Suspense, useState } from "react";
import { PageHeader, PageTabs } from "@/components/dashboard/kit";
import { PageSkeleton } from "@/components/dashboard/PageStates";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { TierGate, useTabParam } from "@/components/dashboard/restaurant/common";
import { CalendarView } from "@/components/dashboard/restaurant/catering/CalendarView";
import { NewInquirySheet } from "@/components/dashboard/restaurant/catering/NewInquirySheet";
import { PipelineView } from "@/components/dashboard/restaurant/catering/PipelineView";

const TABS = ["pipeline", "calendar"] as const;
type Tab = (typeof TABS)[number];
const GATE = { featureKey: "restaurant.catering" as const, title: "Catering", what: "Walima, mehndi and office lunch inquiries with per-head or tray quotes, deposits and tastings, from first call to final invoice." };

export default function CateringPage() {
  return (
    <TierGate {...GATE}>
      <Suspense fallback={<PageSkeleton rows={2} />}>
        <Catering />
      </Suspense>
    </TierGate>
  );
}

function Catering() {
  const [tab, setTab] = useTabParam(TABS, "pipeline");
  const [adding, setAdding] = useState(false);
  const [version, setVersion] = useState(0);
  const { base } = useMerchant();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader flush title="Catering" description="Big trays and big days, from the first call to the final invoice." actions={<div className="flex gap-2"><Button size="sm" variant="secondary" href={`${base}/restaurant/payments`}>How you get paid</Button><Button size="sm" iconStart={Plus} onClick={() => setAdding(true)}>New inquiry</Button></div>} />
      <PageTabs<Tab> label="Catering views" value={tab} onChange={setTab} items={[{ id: "pipeline", label: "Pipeline" }, { id: "calendar", label: "Calendar" }]} />
      <div role="tabpanel" aria-label={tab === "pipeline" ? "Pipeline" : "Calendar"}>
        {tab === "pipeline" ? <PipelineView key={version} onNew={() => setAdding(true)} gate={GATE} /> : <CalendarView gate={GATE} />}
      </div>
      {adding ? <NewInquirySheet onClose={() => setAdding(false)} onCreated={() => setVersion((v) => v + 1)} /> : null}
    </div>
  );
}
