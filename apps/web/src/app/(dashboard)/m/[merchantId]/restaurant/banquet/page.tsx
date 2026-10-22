"use client";
import { Plus } from "lucide-react";
import { Suspense, useState } from "react";
import { PageHeader, PageTabs } from "@/components/dashboard/kit";
import { PageSkeleton } from "@/components/dashboard/PageStates";
import { Button } from "@/components/ui/Button";
import { AvailabilityTab } from "@/components/dashboard/restaurant/banquet/AvailabilityTab";
import { BookingsTab } from "@/components/dashboard/restaurant/banquet/BookingsTab";
import { HallsTab } from "@/components/dashboard/restaurant/banquet/HallsTab";
import { TierGate, useTabParam } from "@/components/dashboard/restaurant/common";

const TABS = ["bookings", "availability", "halls"] as const;
type Tab = (typeof TABS)[number];
const GATE = { featureKey: "restaurant.banquet" as const, title: "Banquet halls", what: "Hall calendar, 72-hour holds, packages and deposits for walimas, mehndis and weddings." };

export default function BanquetPage() {
  return (
    <TierGate {...GATE}>
      <Suspense fallback={<PageSkeleton rows={2} />}>
        <Banquet />
      </Suspense>
    </TierGate>
  );
}

function Banquet() {
  const [tab, setTab] = useTabParam(TABS, "bookings");
  const [holding, setHolding] = useState(false);
  const [adding, setAdding] = useState(false);
  const newHold = () => { setTab("bookings"); setHolding(true); };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader flush title="Banquet" description="Your halls, what is free, and who is holding a date." actions={<Button size="sm" iconStart={Plus} onClick={newHold}>New hold</Button>} />
      <PageTabs<Tab> label="Banquet views" value={tab} onChange={setTab} items={[{ id: "bookings", label: "Bookings" }, { id: "availability", label: "Availability" }, { id: "halls", label: "Halls" }]} />
      <div role="tabpanel" aria-label={tab}>
        {tab === "bookings" ? <BookingsTab gate={GATE} goHalls={() => { setTab("halls"); setAdding(true); }} holding={holding} onNewHold={newHold} onHoldClose={() => setHolding(false)} /> : null}
        {tab === "availability" ? <AvailabilityTab gate={GATE} goHalls={() => setTab("halls")} /> : null}
        {tab === "halls" ? <HallsTab gate={GATE} adding={adding} onAddClose={() => setAdding(false)} /> : null}
      </div>
    </div>
  );
}
