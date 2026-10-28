"use client";
/**
 * Today (v3-strategy.md 4.1). One page for every trade: a header (title, date and place, one secondary action, ONE black primary)
 * over four cards. DOM order is Needs you, numbers, Up next, Quick actions (urgent first, as a phone reads it); from lg the grid
 * places the numbers strip first, then Needs you beside Up next, then Quick actions. Rows come from API calls the old Home and the
 * trade pages already made, plus one daily series for the sparklines on the loyalty layout. What a trade shows is in lib/dashboard/today.ts.
 *
 * Main Street Warm: a greeting title, a sentence that compares today with a usual day, pastel stat tiles (the first in the shop's trade colour)
 * with sparklines, Needs you with icon tiles and action pills, visits by hour with Up next beside it, and pastel quick-action tiles.
 */
import { Calculator, Moon, Sun, Sunset } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { PLANS } from "@ll/shared";
import { GroceryHome } from "@/components/dashboard/grocery/GroceryHome";
import { ErrorLine, PageHeader, StatBlock } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { BusyMode } from "@/components/dashboard/restaurant/RestaurantHome";
import { ActivationCard } from "@/components/dashboard/onboarding/ActivationCard";
import { UpsellCard } from "@/components/dashboard/onboarding/UpsellCard";
import { buttonClasses } from "@/components/ui/Button";
import { enabledSet, hasGroceryFeature, navVisible } from "@/lib/dashboard/nav";
import { publishNeedsYou } from "@/lib/dashboard/needsYou";
import { startOfTorontoDay } from "@/lib/dashboard/time";
import {
  SHOP_TZ, compareSentence, greetingKey, placeLabel, shopHour, appointmentNeeds, appointmentNumbers, appointmentUp, headerSecondary, loyaltyNeeds, loyaltyNumbers, pickupRows, promoRow, quickActions, restaurantNeeds, restaurantNumbers, restaurantUp,
  serviceNeeds, serviceNumbers, studioNeeds, studioNumbers, studioUp, todayFamily, type Fmt, type NeedsRow, type UpRow,
} from "@/lib/dashboard/today";
import { useApi, useNow } from "@/lib/dashboard/useApi";
import { formatNumber } from "@/lib/format";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { HoursCard, NumbersCard, NeedsYouCard, QuickActionsCard, UpNextCard } from "./TodayCards";
import { StreetCard } from "./StreetCard";

/** What Café & Retail switches on for a trade, in the owner's words (the Today line that sells the plan). */
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

export function TodayPage() {
  const { api, base, detail, role, enabled, features, me, viewingAs: viewingAsOther } = useMerchant();
  const loc = useLocaleOrEnglish();
  const { t } = loc;
  const nowMs = useNow();
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const manager = role !== "staff";
  const m = detail.merchant;
  const set = useMemo(() => enabledSet(features.features), [features]);
  const shop = useMemo(() => ({ vertical: m.vertical, plan: features.plan }), [m.vertical, features.plan]);
  const family = todayFamily(m.vertical, set, shop);

  // One day, in the shop's clock.
  const from = useMemo(() => startOfTorontoDay(now).toISOString(), [now]);
  const to = useMemo(() => new Date(startOfTorontoDay(now).getTime() + 86_400_000).toISOString(), [now]);

  const needsReports = manager && (family === "loyalty" || family === "appointments" || family === "studio");
  const today = useApi(needsReports ? () => api.reports.today() : null, [api, needsReports], { pollMs: 60_000 });
  // Seven full days before today, for the sparklines (the loyalty layout only; today itself is partial, so it is left out).
  const trendFrom = useMemo(() => new Date(startOfTorontoDay(now).getTime() - 7 * 86_400_000).toISOString(), [now]);
  const trendTo = useMemo(() => new Date(startOfTorontoDay(now).getTime() - 60_000).toISOString(), [now]);
  const daily = useApi(manager && family === "loyalty" ? () => api.reports.daily({ from: trendFrom, to: trendTo }) : null, [api, manager, family, trendFrom, trendTo], { pollMs: 300_000 });
  const counter = useApi(!manager ? () => api.counter.today() : null, [api, manager], { pollMs: 30_000 });
  const onboarding = useApi(manager ? () => api.onboarding() : null, [api, manager]);
  const ordersOn = manager && family === "loyalty" && navVisible("orders", set, shop);
  const orders = useApi(ordersOn ? () => api.orders({}) : null, [api, ordersOn], { pollMs: 30_000 });
  const restaurant = useApi(manager && family === "restaurant" ? () => api.restaurantHome() : null, [api, manager, family], { pollMs: 30_000 });
  const apptsOn = manager && family === "appointments" && set.has("booking.appointments");
  const appts = useApi(apptsOn ? () => api.appointments.list({ from, to }) : null, [api, apptsOn, from, to], { pollMs: 60_000 });
  const boardOn = manager && family === "appointments" && set.has("booking.walkin_queue");
  const board = useApi(boardOn ? () => api.barber.board() : null, [api, boardOn], { pollMs: 30_000 });
  const sessions = useApi(manager && family === "studio" ? () => api.classes.sessions({ from, to }) : null, [api, manager, family, from, to], { pollMs: 60_000 });
  const tickets = useApi(manager && family === "service" ? () => api.serviceOps.summary() : null, [api, manager, family], { pollMs: 60_000 });

  const f = useMemo<Fmt>(
    () => ({
      t: loc.t,
      number: loc.number,
      money: loc.money,
      time: (d) => loc.time(d, SHOP_TZ),
      isolate: (s) => (loc.dir === "rtl" ? `\u2066${s}\u2069` : s),
      weekday: (d) => loc.date(d, { weekday: "long" }, SHOP_TZ),
      dayShort: (d) => loc.date(d, { weekday: "short", day: "numeric" }, "UTC"),
      clock: (hhmm) => {
        const [h = "0", mi = "0"] = hhmm.split(":");
        return loc.date(new Date(Date.UTC(2000, 0, 1, Number(h), Number(mi))), { hour: "numeric", minute: "2-digit" }, "UTC");
      },
    }),
    [loc],
  );

  const canMessage = enabled("marketing.sms") || enabled("marketing.email");
  const term = detail.program?.terminology ?? "stamps";
  const loyaltyIn = { today: today.data, orders: orders.data?.items ?? null, onboarding: onboarding.data, canMessage, terminology: term };
  const apptIn = { appointments: appts.data?.items ?? null, board: board.data, today: today.data };

  // The cards' rows and numbers, by trade.
  let needs: NeedsRow[] = [];
  let up: UpRow[] = [];
  let upLabel = t("shell.today.upNextSchedule");
  let numbers = loyaltyNumbers(loyaltyIn, f, now);
  let loading = false;
  const err = today.error ?? restaurant.error ?? appts.error ?? sessions.error ?? tickets.error;
  if (family === "restaurant") {
    needs = restaurantNeeds(restaurant.data);
    up = restaurantUp(restaurant.data, f);
    numbers = restaurantNumbers(restaurant.data, f);
    upLabel = t("shell.today.upNextComing");
    loading = restaurant.loading && !restaurant.data;
  } else if (family === "appointments") {
    needs = [...appointmentNeeds(apptIn, f, nowMs), ...loyaltyNeeds(loyaltyIn, f, nowMs).filter((r) => r.key !== "orders")];
    up = appointmentUp(apptIn, f, nowMs);
    numbers = appointmentNumbers(apptIn, f, nowMs);
    loading = (appts.loading && !appts.data) || (today.loading && !today.data);
  } else if (family === "studio") {
    needs = [...studioNeeds(sessions.data?.items ?? null, f, nowMs), ...loyaltyNeeds(loyaltyIn, f, nowMs).filter((r) => r.key !== "orders")];
    up = studioUp(sessions.data?.items ?? null, f, nowMs);
    numbers = studioNumbers(sessions.data?.items ?? null, today.data, f);
    upLabel = t("shell.today.upNextClasses");
    loading = sessions.loading && !sessions.data;
  } else if (family === "service") {
    needs = [...serviceNeeds(tickets.data, f), ...loyaltyNeeds(loyaltyIn, f, nowMs).filter((r) => r.key === "setup")];
    numbers = serviceNumbers(tickets.data, f);
    upLabel = t("shell.today.upNextDue");
    loading = tickets.loading && !tickets.data;
  } else {
    needs = loyaltyNeeds(loyaltyIn, f, nowMs);
    const pickups = pickupRows(orders.data?.items ?? null, f);
    const promo = promoRow(today.data?.promoWindow, f);
    up = pickups.length ? pickups : promo ? [promo] : [];
    upLabel = pickups.length ? t("shell.today.upNextPickups") : t("shell.today.upNextSchedule");
    loading = (today.loading && !today.data) || (ordersOn && orders.loading && !orders.data);
  }

  useEffect(() => {
    if (!manager || loading) return;
    publishNeedsYou(needs.length);
  }, [manager, loading, needs.length]);
  useEffect(() => () => publishNeedsYou(null), []);

  const can = {
    promos: navVisible("promos", set, shop),
    messages: navVisible("messages", set, shop),
    orders: navVisible("orders", set, shop),
    kitchen: set.has("restaurant.kds"),
    whatsapp: set.has("restaurant.whatsapp_notifications"),
    phoneOrders: set.has("restaurant.phone_ai"),
    walkIn: set.has("booking.walkin_queue"),
    calendar: navVisible("calendar", set, shop) && set.has("booking.appointments"),
    classes: navVisible("classes", set, shop),
    tickets: navVisible("tickets", set, shop),
  };
  const actions = quickActions(family, f, can);
  const second = headerSecondary(family, can);

  const loc0 = detail.locations[0];
  const place = placeLabel(loc0?.address);
  const compare = family === "loyalty" ? compareSentence(today.data?.today, f.weekday(now), f) : null;
  const description = (
    <>
      {loc.date(now, { weekday: "long", month: "short", day: "numeric" }, SHOP_TZ)}
      {compare ? <> · {compare}</> : place ? <> · <bdi>{place}</bdi></> : null}
    </>
  );
  // "Good morning, Sana": the first name of whoever is signed in; a support session (admin or rep) says no name.
  const first = me.user.name?.trim().split(/\s+/)[0] ?? "";
  const hour = shopHour(now);
  const named = first.length > 0 && !viewingAsOther;
  const greeting = t(greetingKey(hour, named), { name: first });
  const GreetIcon = hour < 12 ? Sun : hour < 17 ? Sunset : Moon;
  // The sparklines: the loyalty numbers are visits, stamps, rewards redeemed, new members, in that order.
  const series = daily.data?.series ?? [];
  const sparkOf = (pick: (p: (typeof series)[number]) => number) => (series.length >= 3 ? series.map(pick) : undefined);
  const sparks = family === "loyalty" ? [sparkOf((p) => p.visits), sparkOf((p) => p.pointsIssued), sparkOf((p) => p.pointsRedeemed), sparkOf((p) => p.newMembers)] : [];
  const numberItems = numbers.map((n, i) => ({ ...n, spark: sparks[i] }));
  const ob = onboarding.data;
  const showActivation = !!ob && !ob.activatedAt && ob.activation.day <= ob.activation.windowDays;
  const upsellKeys = (["promos.basic", "marketing.email", "integrations.pos_auto_award"] as const).filter((k) => !enabled(k));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title={
          <span className="inline-flex flex-wrap items-center gap-x-2.5">
            <span>{greeting}</span>
            <GreetIcon aria-hidden className="size-7 text-trade" strokeWidth={1.9} />
          </span>
        }
        description={description}
        actions={
          <>
            {manager && family === "restaurant" ? <BusyMode state={restaurant.data?.busy ?? null} onChanged={() => void restaurant.reload()} /> : null}
            {manager ? (
              <Link href={`${base}${second.href}`} className={`${buttonClasses({ variant: "secondary", size: "md" })} max-sm:hidden`}>
                {t(second.label)}
              </Link>
            ) : null}
            <Link href={`${base}/counter`} data-primary-action className={buttonClasses({ variant: "primary", size: "md" })}>
              <Calculator aria-hidden className="size-4.5 shrink-0" strokeWidth={1.75} />
              <span>{t("shell.today.openCounter")}</span>
            </Link>
          </>
        }
      />

      {err && !needs.length && !today.data && !restaurant.data ? <ErrorLine message={err} onRetry={() => { void today.reload(); void restaurant.reload(); }} /> : null}

      {manager ? (
        <div className="grid gap-6 lg:grid-cols-12">
          <NeedsYouCard rows={needs} loading={loading} base={base} className="lg:col-span-8 lg:row-start-2" />
          <NumbersCard items={numberItems} loading={loading} className="lg:col-span-12 lg:row-start-1" />
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-4 lg:row-start-2">
            {family === "loyalty" ? <HoursCard hourly={today.data?.hourly} loading={today.loading && !today.data} /> : null}
            <UpNextCard rows={up} loading={loading} base={base} label={upLabel} />
          </div>
          <QuickActionsCard actions={actions} base={base} className="lg:col-span-12 lg:row-start-3" />
        </div>
      ) : (
        <>
          <StatBlock
            label={t("shell.today.atCounter")}
            loading={counter.loading && !counter.data}
            cols={2}
            items={[
              { label: t("shell.today.visitsSoFar"), value: counter.data ? formatNumber(counter.data.visitCount) : "–", caption: counter.data?.visitCount === 0 ? t("shell.today.nobodyYet") : undefined },
              { label: t("shell.today.newMembers"), value: counter.data ? formatNumber(counter.data.newMembers) : "–" },
            ]}
          />
        </>
      )}

      {manager ? (
        <>
          {m.vertical === "grocery" && hasGroceryFeature(set) ? <GroceryHome /> : null}
          {ob && showActivation ? <ActivationCard c={ob} base={base} /> : null}
          <StreetCard />
          {ob ? <UpsellCard upsell={ob.upsell} base={base} activeLine={ob.activatedAt ? `You are an active shop: ${ob.activeMembers} members visited` : undefined} onDismiss={async () => onboarding.setData(await api.dismissUpsell())} /> : null}
          {upsellKeys.length === 3 ? (
            <p className="border-t border-border pt-4 text-meta text-muted-foreground">
              More with {PLANS.plus.name}, ${PLANS.plus.priceCents / 100} a month: {TRADE_TOOLS[m.vertical] ? `${TRADE_TOOLS[m.vertical]}, ` : ""}promos, texts, POS sync and the tools for your trade ·{" "}
              <a href={`${base}/billing`} className="text-foreground underline underline-offset-4">Subscribe</a>
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
