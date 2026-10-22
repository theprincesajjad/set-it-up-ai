"use client";
import { Suspense } from "react";
import { PageHeader, PageTabs } from "@/components/dashboard/kit";
import { PageSkeleton } from "@/components/dashboard/PageStates";
import { TierGate, useTabParam } from "@/components/dashboard/restaurant/common";
import { DeliveriesTab } from "@/components/dashboard/restaurant/tiffin/DeliveriesTab";
import { MenusTab } from "@/components/dashboard/restaurant/tiffin/MenusTab";
import { PlansTab } from "@/components/dashboard/restaurant/tiffin/PlansTab";
import { RevenueTab } from "@/components/dashboard/restaurant/tiffin/RevenueTab";
import { RoutesTab } from "@/components/dashboard/restaurant/tiffin/RoutesTab";
import { SubscribersTab } from "@/components/dashboard/restaurant/tiffin/SubscribersTab";
import { TodayTab } from "@/components/dashboard/restaurant/tiffin/TodayTab";

const TABS = ["today", "deliveries", "subscribers", "plans", "menus", "routes", "revenue"] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = { today: "Today", deliveries: "Deliveries", subscribers: "Subscribers", plans: "Plans", menus: "Menus", routes: "Routes", revenue: "Revenue" };
const GATE = { featureKey: "restaurant.tiffin" as const, title: "Tiffin", what: "Weekly and monthly meal plans with skips, pauses, family sizes, delivery routes and automatic billing." };

export default function TiffinPage() {
  return (
    <TierGate {...GATE}>
      <Suspense fallback={<PageSkeleton rows={2} />}>
        <Tiffin />
      </Suspense>
    </TierGate>
  );
}

function Tiffin() {
  const [tab, setTab] = useTabParam(TABS, "today");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader flush className="print:hidden" title="Tiffin" description="Today's count for the kitchen, the delivery run, and the people who subscribe." />
      <PageTabs<Tab> label="Tiffin views" value={tab} onChange={setTab} className="print:hidden" items={TABS.map((t) => ({ id: t, label: LABELS[t] }))} />
      <div role="tabpanel" aria-label={LABELS[tab]}>
        {tab === "today" ? <TodayTab goPlans={() => setTab("plans")} gate={GATE} /> : null}
        {tab === "deliveries" ? <DeliveriesTab goRoutes={() => setTab("routes")} gate={GATE} /> : null}
        {tab === "subscribers" ? <SubscribersTab goPlans={() => setTab("plans")} gate={GATE} /> : null}
        {tab === "plans" ? <PlansTab gate={GATE} /> : null}
        {tab === "menus" ? <MenusTab goPlans={() => setTab("plans")} gate={GATE} /> : null}
        {tab === "routes" ? <RoutesTab gate={GATE} /> : null}
        {tab === "revenue" ? <RevenueTab gate={GATE} /> : null}
      </div>
    </div>
  );
}
