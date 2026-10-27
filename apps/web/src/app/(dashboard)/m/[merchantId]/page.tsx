"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { PLANS } from "@ll/shared";
import { GroceryHome } from "@/components/dashboard/grocery/GroceryHome";
import { StreetCard } from "@/components/dashboard/home/StreetCard";
import { HourlyShape } from "@/components/dashboard/home/HourlyShape";
import { PromoResult } from "@/components/dashboard/home/PromoResult";
import { RewardsWaiting } from "@/components/dashboard/home/RewardsWaiting";
import { SlippingAway } from "@/components/dashboard/home/SlippingAway";
import { StaffStamps } from "@/components/dashboard/home/StaffStamps";
import { TodayStats } from "@/components/dashboard/home/TodayStats";
import { ErrorLine, PageHeader, StatBlock } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { ActivationCard } from "@/components/dashboard/onboarding/ActivationCard";
import { UpsellCard } from "@/components/dashboard/onboarding/UpsellCard";
import { RestaurantHome } from "@/components/dashboard/restaurant/RestaurantHome";
import { Button } from "@/components/ui/Button";
import { firstName, formatNumber } from "@/lib/format";
import { dayLine, homeMode, hoursNote, shortAddress, weekdayName } from "@/lib/dashboard/home";
import { enabledSet, hasGroceryFeature, hasRestaurantFeature } from "@/lib/dashboard/nav";
import { greeting } from "@/lib/dashboard/time";
import { useApi, useNow } from "@/lib/dashboard/useApi";

/** What Café & Retail switches on for a trade, in the owner's words (the Home line that sells the plan). */
const TRADE_TOOLS: Record<string, string> = {
  salon: "calendar and online booking",
  barber: "calendar, the walk-in line and payouts",
  spa: "calendar and online booking",
  fitness: "classes and memberships",
  pet: "pets, groom reminders and daycare",
  grocery: "the weekly flyer and butcher counter",
  repair_auto: "vehicles, service reminders and tire season",
  car_wash: "wash check-in and plans",
};

const plural = (n: number, word: string) => `${formatNumber(n)} ${word}${n === 1 ? "" : "s"}`;

export default function HomePage() {
  const { role, features, base } = useMerchant();
  const router = useRouter();
  const instructor = role === "instructor";
  // An instructor has no Home: their day is the class list.
  useEffect(() => {
    if (instructor) router.replace(`${base}/classes`);
  }, [instructor, router, base]);
  if (instructor) return null;
  // Restaurants land on their own Home (open orders, pots, festival, channels); staff keep the counter view below.
  if (role !== "staff" && hasRestaurantFeature(enabledSet(features.features))) return <RestaurantHome />;
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}

/**
 * Café & retail home (cafes-retail.md 7.1). Before noon (Toronto) it answers "is today normal, who is owed a
 * reward, is the counter ready"; after noon "how was today, did the promo work, who do I call back".
 * `?mode=morning|close` forces a mode for QA. Staff see the day's counter numbers only.
 */
function Home() {
  const { api, base, detail, role, me, enabled, features } = useMerchant();
  const manager = role !== "staff";
  const params = useSearchParams();
  const now = useNow();
  const nowDate = new Date(now);
  const mode = homeMode(nowDate, params.get("mode"));
  const m = detail.merchant;
  const term = detail.program?.terminology ?? "stamps";
  const today = useApi(manager ? () => api.reports.today() : null, [api, manager], { pollMs: 60_000 });
  const counter = useApi(!manager ? () => api.counter.today() : null, [api, manager], { pollMs: 30_000 });
  const onboarding = useApi(manager ? () => api.onboarding() : null, [api, manager]);

  const name = me.user.name ? firstName(me.user.name) : null;
  const ob = onboarding.data;
  const canMessage = enabled("marketing.sms") || enabled("marketing.email");
  const upsellKeys = (["promos.basic", "marketing.email", "integrations.pos_auto_award"] as const).filter((k) => !enabled(k));
  const loc = detail.locations[0];
  const weekday = weekdayName(nowDate);
  const yesterdayWeekday = weekdayName(new Date(now - 86_400_000));
  const sub = [dayLine(nowDate), loc ? shortAddress(loc.address) : null, hoursNote(loc?.hours ?? m.hours, mode, nowDate)].filter(Boolean).join(" · ");
  const d = today.data;
  // A brand-new shop has no members, stamps or visits yet: skip the empty lists and let the setup card lead.
  const brandNew = !!d && !!ob && ob.activeMembers === 0 && d.today.visits === 0 && d.rewardsWaiting.count === 0 && d.slipping.count === 0 && d.staff.length === 0;
  // The "first 30 days" meter retires once the window is over, however many members the shop has.
  const showActivation = !!ob && !ob.activatedAt && ob.activation.day <= ob.activation.windowDays;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={name ? `${greeting(nowDate)}, ${name}` : greeting(nowDate)}
        description={sub}
        actions={<Button size="md" href={`${base}/counter`} className="h-[38px] rounded-full px-4 text-[14px] font-medium">Open counter</Button>}
        flush
      />

      {manager ? (
        <>
          {today.error && !d ? <ErrorLine message={today.error} onRetry={() => void today.reload()} /> : null}
          <TodayStats mode={mode} data={d} weekday={weekday} yesterdayWeekday={yesterdayWeekday} terminology={term} vertical={m.vertical} base={base} loading={today.loading} />

          {m.vertical === "grocery" && hasGroceryFeature(enabledSet(features.features)) ? <GroceryHome /> : null}

          {ob && showActivation ? <ActivationCard c={ob} base={base} /> : null}
          <StreetCard />
          {ob && ob.activatedAt ? (
            <UpsellCard upsell={ob.upsell} base={base} activeLine={`You are an active shop: ${ob.activeMembers} members visited`} onDismiss={async () => onboarding.setData(await api.dismissUpsell())} />
          ) : null}
          {ob && !ob.activatedAt ? <UpsellCard upsell={ob.upsell} base={base} onDismiss={async () => onboarding.setData(await api.dismissUpsell())} /> : null}

          {d ? (!brandNew && (mode === "close" || d.hourly.typical.some((v) => v > 0)) ? <HourlyShape mode={mode} hourly={d.hourly} weekday={weekday} promo={enabled("promos.basic") ? d.promoWindow : null} /> : null) : today.loading ? <div className="skeleton h-[270px] w-full rounded-card" /> : null}

          {mode === "close" && d?.promoWindow && enabled("promos.basic") ? <PromoResult promo={d.promoWindow} weekday={weekday} base={base} /> : null}

          {brandNew ? null : (
          <div className="flex flex-col gap-8 lg:flex-row">
            {mode === "morning" ? (
              <RewardsWaiting data={d?.rewardsWaiting ?? null} base={base} terminology={term} vertical={m.vertical} now={nowDate} loading={today.loading} />
            ) : (
              <StaffStamps staff={d?.staff ?? null} terminology={term} loading={today.loading} />
            )}
            <SlippingAway data={d?.slipping ?? null} base={base} canMessage={canMessage} loading={today.loading} />
          </div>
          )}

          {upsellKeys.length === 3 ? (
            <p className="border-t border-line pt-4 text-[13px] text-fg-muted">
              More with {PLANS.plus.name}, ${PLANS.plus.priceCents / 100} a month: {TRADE_TOOLS[m.vertical] ? `${TRADE_TOOLS[m.vertical]}, ` : ""}promos, texts, POS sync and the tools for your trade ·{" "}
              <a href={`${base}/billing`} className="text-fg underline underline-offset-4">Subscribe</a>
            </p>
          ) : null}
        </>
      ) : (
        <StatBlock
          label="At the counter today"
          loading={counter.loading && !counter.data}
          cols={2}
          items={[
            { label: "Visits so far today", value: counter.data ? plural(counter.data.visitCount, "visit") : "–", caption: counter.data?.visitCount === 0 ? "No one at the counter yet" : undefined },
            { label: "New members", value: counter.data ? formatNumber(counter.data.newMembers) : "–" },
          ]}
        />
      )}
    </div>
  );
}
