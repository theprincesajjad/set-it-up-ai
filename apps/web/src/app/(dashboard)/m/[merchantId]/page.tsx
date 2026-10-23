"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PLANS } from "@ll/shared";
import { NotifyLink } from "@/components/dashboard/FeatureTeaser";
import { HourlyShape } from "@/components/dashboard/home/HourlyShape";
import { PromoResult } from "@/components/dashboard/home/PromoResult";
import { RewardsWaiting } from "@/components/dashboard/home/RewardsWaiting";
import { SlippingAway } from "@/components/dashboard/home/SlippingAway";
import { StaffStamps } from "@/components/dashboard/home/StaffStamps";
import { TodayStats } from "@/components/dashboard/home/TodayStats";
import { ErrorLine, Meter, PageHeader, QuietLink, StatBlock } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { RestaurantHome } from "@/components/dashboard/restaurant/RestaurantHome";
import { Button } from "@/components/ui/Button";
import { firstName, formatNumber } from "@/lib/format";
import { dayLine, homeMode, hoursNote, shortAddress, weekdayName } from "@/lib/dashboard/home";
import { enabledSet, hasRestaurantFeature } from "@/lib/dashboard/nav";
import { greeting } from "@/lib/dashboard/time";
import { useApi, useNow } from "@/lib/dashboard/useApi";

const plural = (n: number, word: string) => `${formatNumber(n)} ${word}${n === 1 ? "" : "s"}`;

export default function HomePage() {
  const { role, features } = useMerchant();
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
  const { api, base, detail, role, me, enabled } = useMerchant();
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
  const daysLeft = Math.max(0, 30 - Math.floor((now - new Date(m.createdAt).getTime()) / 86_400_000));
  const canMessage = enabled("marketing.sms") || enabled("marketing.email");
  const upsellKeys = (["promos.basic", "marketing.email", "integrations.pos_auto_award"] as const).filter((k) => !enabled(k));
  const loc = detail.locations[0];
  const weekday = weekdayName(nowDate);
  const yesterdayWeekday = weekdayName(new Date(now - 86_400_000));
  const sub = [dayLine(nowDate), loc ? shortAddress(loc.address) : null, hoursNote(loc?.hours ?? m.hours, mode, nowDate)].filter(Boolean).join(" · ");
  const d = today.data;

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

          {ob && !ob.activatedAt ? (
            <div className="flex flex-col gap-2 border-y border-line py-3 sm:flex-row sm:items-center sm:gap-6">
              <span className="shrink-0 text-meta text-fg">Your first 25 members</span>
              <Meter className="sm:max-w-[320px]" value={ob.activeMembers} max={ob.activationTarget} label="Active members" />
              <span className="shrink-0 text-meta text-fg-muted tabular">
                {ob.activeMembers} of {ob.activationTarget}
                {daysLeft > 0 ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : ""}
              </span>
              <QuietLink href={`${base}/setup?step=first_members`} className="sm:ms-auto">
                Tips
              </QuietLink>
            </div>
          ) : null}

          {d ? <HourlyShape mode={mode} hourly={d.hourly} weekday={weekday} promo={enabled("promos.basic") ? d.promoWindow : null} /> : today.loading ? <div className="skeleton h-[270px] w-full rounded-card" /> : null}

          {mode === "close" && d?.promoWindow && enabled("promos.basic") ? <PromoResult promo={d.promoWindow} weekday={weekday} base={base} /> : null}

          <div className="flex flex-col gap-8 lg:flex-row">
            {mode === "morning" ? (
              <RewardsWaiting data={d?.rewardsWaiting ?? null} base={base} terminology={term} vertical={m.vertical} now={nowDate} loading={today.loading} />
            ) : (
              <StaffStamps staff={d?.staff ?? null} terminology={term} loading={today.loading} />
            )}
            <SlippingAway data={d?.slipping ?? null} base={base} canMessage={canMessage} loading={today.loading} />
          </div>

          {upsellKeys.length === 3 ? (
            <p className="border-t border-line pt-4 text-[13px] text-fg-muted">
              More with {PLANS.plus.name}: promos, texts and POS sync · coming soon · <NotifyLink keys={[...upsellKeys]} className="text-[13px] no-underline" />
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
