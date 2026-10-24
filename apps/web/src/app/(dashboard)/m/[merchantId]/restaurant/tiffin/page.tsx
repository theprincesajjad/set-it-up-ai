"use client";
import { Suspense } from "react";
import { PageHeader, PageTabs } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/dashboard/useApi";
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
  const { base, api } = useMerchant();
  const safety = useApi(() => api.settings.foodSafety(), [api]);
  const dte = safety.data?.daysToExpiry ?? null;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader flush className="print:hidden" title="Tiffin" description="Today's count for the kitchen, the delivery run, and the people who subscribe." actions={<Button size="sm" variant="secondary" href={`${base}/restaurant/payments`}>How you get paid</Button>} />
      {dte !== null && dte <= 60 ? (
        <Banner tone="warning" className="print:hidden" title={dte < 0 ? "Your food handler certificate has expired" : `Your food handler certificate expires in ${dte} ${dte === 1 ? "day" : "days"}`} action={<Button size="sm" variant="secondary" href={`${base}/restaurant/payments`}>Food safety</Button>}>
          A reminder only. Selling is not affected.
        </Banner>
      ) : null}
      <PageTabs<Tab> label="Tiffin views" value={tab} onChange={setTab} className="print:hidden" items={TABS.map((t) => ({ id: t, label: LABELS[t] }))} />
      <div role="tabpanel" aria-label={LABELS[tab]}>
        {tab === "today" ? (
          <TodayTab
            goPlans={() => setTab("plans")}
            gate={GATE}
            go={(to) => {
              if (to === "subscribers-awaiting") setTab("subscribers", "status=awaiting");
              else if (to === "subscribers-past-due") setTab("subscribers", "status=past_due");
              else setTab(to);
            }}
          />
        ) : null}
        {tab === "deliveries" ? <DeliveriesTab goRoutes={() => setTab("routes")} gate={GATE} /> : null}
        {tab === "subscribers" ? <SubscribersTab goPlans={() => setTab("plans")} gate={GATE} /> : null}
        {tab === "plans" ? <PlansTab gate={GATE} /> : null}
        {tab === "menus" ? <MenusTab goPlans={() => setTab("plans")} gate={GATE} /> : null}
        {tab === "routes" ? <RoutesTab gate={GATE} /> : null}
        {tab === "revenue" ? <RevenueTab gate={GATE} openAwaiting={() => setTab("subscribers", "status=awaiting")} /> : null}
      </div>
    </div>
  );
}
