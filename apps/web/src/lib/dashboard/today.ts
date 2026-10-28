/**
 * Today (v3-strategy.md 4.1): what each trade puts in the four standard cards, from data the dashboard already loads.
 * Pure, so it is unit-tested; the components in components/dashboard/home only draw. Nothing here calls the API.
 *
 *   Needs you      rows with a dot that says who must act (`points` = the shop, now; `info` = waiting on a customer;
 *                  `warning` = due soon; `muted` = for your information). Max 5 shown, every row opens what it names.
 *   Today's numbers  four numbers with real comparisons.
 *   Up next        what happens next today.
 *   Quick actions  four things to start.
 */
import type { appointmentsApi, barberApi, classesApi, commerceApi, merchantApi, reportsApi, restaurantApi, serviceApi, MessageKey, Vars } from "@ll/shared";
import type { StatItem } from "@/components/dashboard/kit";
import { STUDIO_VERTICALS, hasRestaurantFeature, navVisible, type ShopNavContext } from "@/lib/dashboard/nav";
import type { FeatureKey } from "@ll/shared";

export const SHOP_TZ = "America/Toronto";

/** A short place for the header: the street without its type, or the building before the first comma ("Ridgeway Plaza"). */
export function placeLabel(address: string | null | undefined): string {
  const first = (address ?? "").split(",")[0] ?? "";
  return first.replace(/\s+(Ave|Avenue|St|Street|Rd|Road|Blvd|Dr|Drive)\.?$/i, "").trim();
}

/** Who must act. The dot colour in the row. */
export type Tone = "points" | "info" | "warning" | "muted";

export interface NeedsRow {
  key: string;
  tone: Tone;
  title: string;
  sub?: string;
  /** "6 min", "2 d": how long it has waited. */
  age?: string;
  /** Path under the shop base, e.g. "/orders". */
  href: string;
}
export interface UpRow {
  key: string;
  time: string;
  title: string;
  sub?: string;
  href?: string;
}
export interface QuickAction {
  key: string;
  label: string;
  href: string;
  /** Lucide icon name; the card maps it to the component. */
  icon: "user" | "megaphone" | "qr" | "clock" | "calendar" | "users" | "mail" | "scan" | "card" | "phone" | "chef" | "upload" | "wrench" | "file" | "chart";
}

/** What the builders need from the locale: words and formats. */
export interface Fmt {
  t: (key: MessageKey, vars?: Vars) => string;
  number: (n: number) => string;
  money: (cents: number) => string;
  /** Clock time in the shop's timezone. */
  time: (d: Date | string | number) => string;
  /** Keeps a signed number ("−6", "+12%") in one piece inside right-to-left text. Identity in left-to-right languages. */
  isolate?: (s: string) => string;
  /** Weekday name ("Wednesday") for a date. */
  weekday: (d: Date | string | number) => string;
  /** Short weekday and day ("Sat 24"). */
  dayShort: (d: Date | string | number) => string;
  /** A wall-clock time ("14:00" as a string of hours and minutes) written for the active language. */
  clock: (hhmm: string) => string;
}

/** Trades share four layouts of data; the rest of the trades use the loyalty one. */
export type TodayFamily = "restaurant" | "studio" | "appointments" | "service" | "loyalty";

export function todayFamily(vertical: string | undefined, enabled: Set<FeatureKey>, shop?: ShopNavContext): TodayFamily {
  if (hasRestaurantFeature(enabled)) return "restaurant";
  if (vertical && STUDIO_VERTICALS.includes(vertical) && enabled.has("booking.classes")) return "studio";
  if (navVisible("calendar", enabled, shop) && enabled.has("booking.appointments")) return "appointments";
  if (enabled.has("booking.walkin_queue")) return "appointments";
  if (navVisible("tickets", enabled, shop) && enabled.has("service.tickets")) return "service";
  return "loyalty";
}

// ---------------------------------------------------------------------------
// Small formats
// ---------------------------------------------------------------------------

/** "now", "6 min", "3 h", "2 d", "6 wk". */
export function ageLabel(fromMs: number, nowMs: number, t: Fmt["t"]): string {
  const min = Math.max(0, Math.round((nowMs - fromMs) / 60_000));
  if (min < 1) return t("shell.age.now");
  if (min < 60) return t("shell.age.min", { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t("shell.age.hour", { n: h });
  const d = Math.round(h / 24);
  if (d < 14) return t("shell.age.day", { n: d });
  return t("shell.age.week", { n: Math.round(d / 7) });
}

/**
 * A real comparison against the same weekday, or null when there is nothing to compare with. On a small base a percentage
 * swings wildly, so under 8 typical it says the difference in counts ("+2 vs last Wed").
 */
export function deltaVs(cur: number, typical: number | null | undefined, weekday: string, f: Pick<Fmt, "t" | "number" | "isolate">): StatItem["delta"] {
  const iso = f.isolate ?? ((s: string) => s);
  if (typical == null || (typical <= 0 && cur <= 0)) return null;
  const good = cur > typical ? true : cur < typical ? false : null;
  if (cur === typical) return { text: f.t("shell.today.sameAs", { weekday }), good: null };
  if (typical < 8) {
    const diff = cur - typical;
    return { text: f.t("shell.today.diffVs", { diff: iso(`${diff > 0 ? "+" : "−"}${f.number(Math.abs(diff))}`), weekday }), good };
  }
  const pct = Math.round(((cur - typical) / typical) * 100);
  return { text: f.t("shell.today.pctVs", { pct: iso(`${pct > 0 ? "+" : "−"}${f.number(Math.abs(pct))}%`), weekday }), good };
}

/** Hour of the day (0 to 23) in the shop's clock. */
export function shopHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-CA", { hour: "numeric", hourCycle: "h23", timeZone: SHOP_TZ }).format(now)) % 24;
}

/** "Good morning, Sana": the message key and whether it takes a name. */
export function greetingKey(hour: number, named: boolean): MessageKey {
  const part = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  return `shell.today.good${part}${named ? "" : "Plain"}` as MessageKey;
}

/** "38 visits so far, busier than a usual Wednesday": today so far against the same weekdays up to this hour. Null when there is no report yet. */
export function compareSentence(d: reportsApi.TodayReportDto["today"] | undefined, weekday: string, f: Pick<Fmt, "t">): string | null {
  if (!d) return null;
  const typical = d.typicalVisitsSoFar;
  if (!(typical > 0) || d.visits === 0) return f.t("shell.today.cmpPlain", { n: d.visits });
  const diff = d.visits - typical;
  const band = Math.max(1, Math.round(typical * 0.1));
  const key = Math.abs(diff) <= band ? "shell.today.cmpSame" : diff > 0 ? "shell.today.cmpBusier" : "shell.today.cmpQuieter";
  return f.t(key, { n: d.visits, weekday });
}

/** "Rewards" noun for the numbers (stamps, points, stars). */
const termKey = (terminology: string | null | undefined): MessageKey =>
  terminology === "stars" ? "shell.today.starsGiven" : terminology === "points" ? "shell.today.pointsGiven" : "shell.today.stampsGiven";

// ---------------------------------------------------------------------------
// Loyalty (cafés, retail, grocers, pharmacies, pet shops and everything without its own layout)
// ---------------------------------------------------------------------------

export interface LoyaltyInput {
  today: reportsApi.TodayReportDto | null;
  /** Open orders, when the shop takes order-ahead. */
  orders: commerceApi.OrderDto[] | null;
  onboarding: merchantApi.OnboardingChecklist | null;
  canMessage: boolean;
  terminology: string;
}

const dayStart = (iso: string) => new Date(iso).getTime();

export function loyaltyNumbers(i: LoyaltyInput, f: Fmt, now: Date): StatItem[] {
  const d = i.today?.today;
  const wd = f.weekday(now);
  const visits = d ? deltaVs(d.visits, d.typicalVisitsSoFar, wd, f) : null;
  return [
    { label: f.t("shell.today.visits"), value: d ? f.number(d.visits) : "–", delta: visits, caption: d && !visits ? f.t("shell.today.noTypical") : undefined },
    { label: f.t(termKey(i.terminology)), value: d ? f.number(d.stampsGiven) : "–" },
    { label: f.t("shell.today.redeemed"), value: d ? f.number(d.redemptions) : "–", caption: i.today && i.today.rewardsWaiting.count > 0 ? f.t("shell.today.waitingN", { n: f.number(i.today.rewardsWaiting.count) }) : undefined },
    { label: f.t("shell.today.newMembers"), value: d ? f.number(d.newMembers) : "–", caption: d && d.newMembers === 0 ? f.t("shell.today.nobodyJoined") : undefined },
  ];
}

export function loyaltyNeeds(i: LoyaltyInput, f: Fmt, nowMs: number): NeedsRow[] {
  const rows: NeedsRow[] = [];
  const pending = (i.orders ?? []).filter((o) => o.status === "pending");
  if (pending.length) {
    const oldest = [...pending].sort((a, b) => dayStart(a.createdAt) - dayStart(b.createdAt))[0]!;
    rows.push({
      key: "orders",
      tone: "points",
      title: f.t("shell.today.newOrders", { n: pending.length }),
      sub: oldest.customer?.name ? f.t("shell.today.oldestIs", { name: oldest.customer.name, time: oldest.pickupAt ? f.time(oldest.pickupAt) : "" }) : undefined,
      age: ageLabel(dayStart(oldest.createdAt), nowMs, f.t),
      href: "/orders",
    });
  }
  const w = i.today?.rewardsWaiting;
  if (w && w.count > 0) rows.push({ key: "rewards", tone: "info", title: f.t("shell.today.rewardsWaiting", { n: w.count }), sub: f.t("shell.today.rewardsWaitingSub"), href: "/customers?segment=reward" });
  const s = i.today?.slipping;
  if (s && s.count > 0) {
    rows.push({
      key: "slipping",
      tone: "warning",
      title: f.t("shell.today.slipping", { n: s.count }),
      sub: i.canMessage && s.canText > 0 ? f.t("shell.today.slippingCanText", { n: s.canText }) : f.t("shell.today.slippingSub"),
      href: i.canMessage && s.canText > 0 ? "/messages/new?segment=slipping" : "/customers?segment=slipping",
    });
  }
  const steps = i.onboarding?.steps ?? [];
  const next = steps.find((x) => !x.done);
  if (i.onboarding && next) rows.push({ key: "setup", tone: "muted", title: next.label, sub: f.t("shell.today.setupStep", { done: steps.filter((x) => x.done).length + 1, total: steps.length }), href: setupPath(next.key) });
  return rows;
}

/** Where a setup step is done (the same paths the setup checklist uses). */
export function setupPath(key: merchantApi.OnboardingStepKey): string {
  const paths: Record<merchantApi.OnboardingStepKey, string> = {
    program: "/program",
    first_stamp: "/setup?step=first_stamp",
    qr_kit: "/locations/kit",
    staff: "/setup?step=staff",
    first_members: "/counter",
    profile: "/settings",
    pharmacy_rules: "/pharmacy",
    pos: "/integrations",
    trade_setup: "/setup?step=trade_setup",
  };
  return paths[key];
}

const itemsLine = (o: commerceApi.OrderDto) => o.items.slice(0, 2).map((x) => (x.quantity > 1 ? `${x.quantity} ${x.name}` : x.name)).join(", ");

/** Pickups: open orders with a pickup time, soonest first. */
export function pickupRows(orders: commerceApi.OrderDto[] | null, f: Fmt, max = 4): UpRow[] {
  return (orders ?? [])
    .filter((o) => o.pickupAt && o.status !== "picked_up" && o.status !== "cancelled" && o.status !== "refunded")
    .sort((a, b) => dayStart(a.pickupAt!) - dayStart(b.pickupAt!))
    .slice(0, max)
    .map((o) => ({
      key: o.id,
      time: f.time(o.pickupAt!),
      title: [o.customer?.name, itemsLine(o)].filter(Boolean).join(" · ") || `#${o.number}`,
      sub: f.t("shell.today.orderNo", { n: o.number }),
      href: "/orders",
    }));
}

/** A promo running today, as one Up next row (loyalty shops with no pickups). */
export function promoRow(p: reportsApi.TodayReportDto["promoWindow"] | undefined, f: Fmt): UpRow | null {
  if (!p) return null;
  return { key: "promo", time: p.startTime ? f.clock(p.startTime) : f.t("shell.today.allDay"), title: p.title, sub: f.t("shell.today.promoToday"), href: `/promos/${p.promoId}` };
}

// ---------------------------------------------------------------------------
// Restaurant
// ---------------------------------------------------------------------------

export function restaurantNumbers(d: restaurantApi.RestaurantHomeResponse | null, f: Fmt): StatItem[] {
  const wd = d ? f.weekday(`${d.today}T12:00:00Z`) : "";
  const sales = d && d.salesVsLastSameWeekdayPct != null ? d.salesVsLastSameWeekdayPct : null;
  return [
    {
      label: f.t("shell.today.openOrders"),
      value: d ? f.number(d.orders.open) : "–",
      caption: d ? (d.orders.open ? f.t("shell.today.orderSplit", { new: d.orders.new, cooking: d.orders.preparing, ready: d.orders.ready }) : f.t("shell.today.nothingOpen")) : undefined,
    },
    { label: f.t("shell.today.avgWait"), value: d ? (d.avgWaitMin == null ? "–" : f.t("shell.age.min", { n: d.avgWaitMin })) : "–", caption: d ? f.t("shell.today.quoted", { n: d.quotedWaitMin }) : undefined },
    {
      label: f.t("shell.today.sales"),
      value: d ? f.money(d.salesTodayCents) : "–",
      delta: sales == null ? null : { good: sales > 0 ? true : sales < 0 ? false : null, text: sales > 999 ? f.t("shell.today.wellUp", { weekday: wd }) : f.t("shell.today.pctVs", { pct: (f.isolate ?? ((s: string) => s))(`${sales > 0 ? "+" : sales < 0 ? "−" : ""}${f.number(Math.abs(sales))}%`), weekday: wd }) },
      caption: d && sales == null ? f.t("shell.today.ordersSoFar") : undefined,
    },
    { label: f.t("shell.today.commission"), value: d ? f.money(d.directSavings.cents) : "–", caption: d ? f.t("shell.today.estimate") : undefined },
  ];
}

const RESTAURANT_TONE: Record<restaurantApi.NeedsYouRow["tone"], Tone> = { accent: "points", negative: "points", info: "info" };

export function restaurantNeeds(d: restaurantApi.RestaurantHomeResponse | null): NeedsRow[] {
  return (d?.needsYou ?? []).map((r) => ({ key: r.kind, tone: RESTAURANT_TONE[r.tone], title: r.text, href: r.href }));
}

export function restaurantUp(d: restaurantApi.RestaurantHomeResponse | null, f: Fmt, max = 4): UpRow[] {
  return (d?.comingUp ?? []).slice(0, max).map((r, i) => ({ key: `${r.kind}-${r.date}-${i}`, time: f.dayShort(`${r.date}T12:00:00Z`), title: r.title, sub: r.sub, href: r.href }));
}

// ---------------------------------------------------------------------------
// Appointments (salons, barbers, spas, groomers)
// ---------------------------------------------------------------------------

export interface AppointmentsInput {
  appointments: appointmentsApi.AppointmentDto[] | null;
  board: barberApi.QueueBoardResponse | null;
  today: reportsApi.TodayReportDto | null;
}

const live = (a: appointmentsApi.AppointmentDto) => a.status === "booked" || a.status === "arrived" || a.status === "in_service";

export function appointmentNumbers(i: AppointmentsInput, f: Fmt, nowMs: number): StatItem[] {
  const list = i.appointments?.filter((a) => a.status !== "cancelled") ?? null;
  const left = list ? list.filter((a) => a.status === "booked" && dayStart(a.startsAt) > nowMs).length : 0;
  const d = i.today?.today;
  return [
    { label: f.t("shell.today.appointments"), value: list ? f.number(list.length) : "–", caption: list ? f.t("shell.today.stillToCome", { n: left }) : undefined },
    ...(i.board
      ? [{ label: f.t("shell.today.walkIns"), value: f.number(i.board.stats.servedToday + i.board.stats.waiting), caption: f.t("shell.today.walkInsWaiting", { n: i.board.stats.waiting }) }]
      : [{ label: f.t("shell.today.visits"), value: d ? f.number(d.visits) : "–" }]),
    { label: f.t("shell.today.newMembers"), value: d ? f.number(d.newMembers) : "–" },
    { label: f.t("shell.today.redeemed"), value: d ? f.number(d.redemptions) : "–" },
  ];
}

export function appointmentNeeds(i: AppointmentsInput, f: Fmt, nowMs: number): NeedsRow[] {
  const rows: NeedsRow[] = [];
  const next = i.board?.waiting[0];
  if (i.board && next) {
    rows.push({
      key: "queue",
      tone: "points",
      title: f.t("shell.today.nextInLine", { name: next.name }),
      sub: i.board.stats.estimateMin != null ? f.t("shell.today.lineSub", { n: i.board.stats.waiting, min: i.board.stats.estimateMin }) : f.t("shell.today.lineSubNoEstimate", { n: i.board.stats.waiting }),
      age: next.waitedMin >= 1 ? f.t("shell.age.min", { n: next.waitedMin }) : f.t("shell.age.now"),
      href: "/queue",
    });
  }
  const arrived = (i.appointments ?? []).filter((a) => a.status === "arrived");
  if (arrived.length) rows.push({ key: "arrived", tone: "points", title: f.t("shell.today.arrived", { n: arrived.length }), sub: arrived.slice(0, 2).map((a) => a.customer.name).join(", "), age: ageLabel(dayStart(arrived[0]!.arrivedAt ?? arrived[0]!.startsAt), nowMs, f.t), href: "/calendar" });
  const late = (i.appointments ?? []).filter((a) => a.status === "booked" && dayStart(a.startsAt) < nowMs - 10 * 60_000);
  if (late.length) rows.push({ key: "late", tone: "warning", title: f.t("shell.today.notArrived", { n: late.length }), sub: late.slice(0, 2).map((a) => `${a.customer.name} ${f.time(a.startsAt)}`).join(" · "), age: ageLabel(dayStart(late[0]!.startsAt), nowMs, f.t), href: "/calendar" });
  return rows;
}

export function appointmentUp(i: AppointmentsInput, f: Fmt, nowMs: number, max = 4): UpRow[] {
  return (i.appointments ?? [])
    // A booking more than ten minutes late is a "has not arrived" row under Needs you, not what is next.
    .filter((a) => live(a) && dayStart(a.endsAt) > nowMs && (a.status !== "booked" || dayStart(a.startsAt) > nowMs - 10 * 60_000))
    .sort((a, b) => dayStart(a.startsAt) - dayStart(b.startsAt))
    .slice(0, max)
    .map((a) => ({
      key: a.id,
      time: f.time(a.startsAt),
      title: [a.customer.name, a.items[0]?.name].filter(Boolean).join(" · "),
      sub: [a.staffName ? f.t("shell.today.withStaff", { name: a.staffName }) : null, f.t("shell.today.minutes", { n: Math.round((dayStart(a.endsAt) - dayStart(a.startsAt)) / 60_000) })].filter(Boolean).join(" · "),
      href: "/calendar",
    }));
}

// ---------------------------------------------------------------------------
// Studio (classes)
// ---------------------------------------------------------------------------

export function studioNumbers(sessions: classesApi.ClassSessionDto[] | null, today: reportsApi.TodayReportDto | null, f: Fmt): StatItem[] {
  const list = sessions?.filter((s) => s.status === "scheduled") ?? null;
  const booked = list?.reduce((n, s) => n + s.booked, 0) ?? 0;
  const cap = list?.reduce((n, s) => n + s.capacity, 0) ?? 0;
  const wait = list?.reduce((n, s) => n + s.waitlisted, 0) ?? 0;
  const d = today?.today;
  return [
    { label: f.t("shell.today.classes"), value: list ? f.number(list.length) : "–" },
    { label: f.t("shell.today.classFill"), value: list ? (cap ? `${f.number(Math.round((booked / cap) * 100))}%` : "–") : "–", caption: list ? f.t("shell.today.spotsBooked", { booked, cap }) : undefined },
    { label: f.t("shell.today.waitlisted"), value: list ? f.number(wait) : "–" },
    { label: f.t("shell.today.checkIns"), value: d ? f.number(d.visits) : "–" },
  ];
}

export function studioNeeds(sessions: classesApi.ClassSessionDto[] | null, f: Fmt, nowMs: number): NeedsRow[] {
  const rows: NeedsRow[] = [];
  for (const s of (sessions ?? []).filter((x) => x.status === "scheduled" && dayStart(x.endsAt) > nowMs).sort((a, b) => dayStart(a.startsAt) - dayStart(b.startsAt))) {
    if (s.capacity > 0 && s.booked >= s.capacity && s.waitlisted > 0)
      rows.push({ key: `full-${s.id}`, tone: "points", title: f.t("shell.today.classFull", { time: f.time(s.startsAt), name: s.name }), sub: f.t("shell.today.onWaitlist", { n: s.waitlisted }), age: dayStart(s.startsAt) <= nowMs ? f.t("shell.age.now") : undefined, href: `/classes/${s.id}` });
    else if (s.booked === 0 && dayStart(s.startsAt) - nowMs < 2 * 3_600_000 && dayStart(s.startsAt) > nowMs) rows.push({ key: `empty-${s.id}`, tone: "warning", title: f.t("shell.today.classEmpty", { time: f.time(s.startsAt), name: s.name }), sub: f.t("shell.today.classEmptySub"), href: `/classes/${s.id}` });
  }
  return rows;
}

export function studioUp(sessions: classesApi.ClassSessionDto[] | null, f: Fmt, nowMs: number, max = 4): UpRow[] {
  return (sessions ?? [])
    .filter((s) => s.status === "scheduled" && dayStart(s.endsAt) > nowMs)
    .sort((a, b) => dayStart(a.startsAt) - dayStart(b.startsAt))
    .slice(0, max)
    .map((s) => ({
      key: s.id,
      time: f.time(s.startsAt),
      title: s.instructorName ? `${s.name} · ${s.instructorName}` : s.name,
      sub: s.booked >= s.capacity ? f.t("shell.today.bookedFull", { booked: s.booked, cap: s.capacity }) : f.t("shell.today.bookedOf", { booked: s.booked, cap: s.capacity }),
      href: `/classes/${s.id}`,
    }));
}

// ---------------------------------------------------------------------------
// Service (repair shops, garages, dry cleaners)
// ---------------------------------------------------------------------------

export function serviceNumbers(s: serviceApi.TicketSummaryResponse | null, f: Fmt): StatItem[] {
  return [
    { label: f.t("shell.today.needsYouNow"), value: s ? f.number(s.needsYou) : "–" },
    { label: f.t("shell.today.dueToday"), value: s ? f.number(s.dueToday) : "–" },
    { label: f.t("shell.today.overdue"), value: s ? f.number(s.overdue) : "–" },
    { label: f.t("shell.today.readyToCollect"), value: s ? f.number(s.readyUncollected) : "–", caption: s && s.readyUncollected ? f.t("shell.today.oldestDays", { n: s.oldestReadyDays }) : undefined },
  ];
}

export function serviceNeeds(s: serviceApi.TicketSummaryResponse | null, f: Fmt): NeedsRow[] {
  if (!s) return [];
  const rows: NeedsRow[] = [];
  if (s.needsYou > 0) rows.push({ key: "needs", tone: "points", title: f.t("shell.today.ticketsNeedYou", { n: s.needsYou }), href: "/tickets" });
  if (s.overdue > 0) rows.push({ key: "overdue", tone: "warning", title: f.t("shell.today.ticketsOverdue", { n: s.overdue }), href: "/tickets" });
  if (s.openQuoteCount > 0) rows.push({ key: "quotes", tone: "info", title: f.t("shell.today.quotesWaiting", { n: s.openQuoteCount }), sub: f.money(s.openQuoteValueCents), href: "/tickets" });
  if (s.readyUncollected > 0) rows.push({ key: "ready", tone: "info", title: f.t("shell.today.ticketsReady", { n: s.readyUncollected }), sub: f.t("shell.today.oldestDays", { n: s.oldestReadyDays }), age: f.t("shell.age.day", { n: s.oldestReadyDays }), href: "/tickets" });
  return rows;
}

// ---------------------------------------------------------------------------
// Quick actions
// ---------------------------------------------------------------------------

/** Four tiles per trade, from pages that exist; a tile for a locked page is dropped, never shown disabled. */
export function quickActions(family: TodayFamily, f: Pick<Fmt, "t">, can: { promos: boolean; messages: boolean; orders: boolean; kitchen: boolean; whatsapp: boolean; phoneOrders: boolean; walkIn: boolean; calendar: boolean; classes: boolean; tickets: boolean }): QuickAction[] {
  const t = f.t;
  const a = (key: string, label: MessageKey, href: string, icon: QuickAction["icon"]): QuickAction => ({ key, label: t(label), href, icon });
  const list: (QuickAction | false)[] =
    family === "restaurant"
      ? [
          can.kitchen && a("kitchen", "shell.today.qa.kitchen", "/restaurant/kitchen", "chef"),
          can.orders && a("phone", "shell.today.qa.phoneOrder", "/orders", "phone"),
          can.whatsapp && a("whatsapp", "shell.today.qa.whatsapp", "/restaurant/whatsapp", "mail"),
          can.promos && a("promo", "shell.today.qa.promo", "/promos/new", "megaphone"),
          a("kit", "shell.today.qa.joinLink", "/locations/kit", "qr"),
        ]
      : family === "appointments"
        ? [
            can.walkIn && a("walkin", "shell.today.qa.walkIn", "/queue", "users"),
            can.calendar && a("booking", "shell.today.qa.booking", "/calendar", "calendar"),
            a("import", "shell.today.qa.import", "/customers/import", "upload"),
            can.messages && a("text", "shell.today.qa.textClients", "/messages/new", "mail"),
            a("kit", "shell.today.qa.joinLink", "/locations/kit", "qr"),
          ]
        : family === "studio"
          ? [
              can.classes && a("door", "shell.today.qa.door", "/classes/door", "scan"),
              can.classes && a("pass", "shell.today.qa.sellPass", "/classes/offers", "card"),
              can.classes && a("class", "shell.today.qa.addClass", "/classes", "calendar"),
              can.messages && a("text", "shell.today.qa.textMembers", "/messages/new", "mail"),
              a("kit", "shell.today.qa.joinLink", "/locations/kit", "qr"),
            ]
          : family === "service"
            ? [
                can.tickets && a("ticket", "shell.today.qa.newTicket", "/tickets/new", "wrench"),
                can.tickets && a("tickets", "shell.today.qa.openTickets", "/tickets", "file"),
                can.messages && a("text", "shell.today.qa.textCustomers", "/messages/new", "mail"),
                a("kit", "shell.today.qa.joinLink", "/locations/kit", "qr"),
              ]
            : [
                a("import", "shell.today.qa.import", "/customers/import", "upload"),
                can.promos && a("promo", "shell.today.qa.promo", "/promos/new", "megaphone"),
                a("kit", "shell.today.qa.joinLink", "/locations/kit", "qr"),
                can.messages && a("text", "shell.today.qa.textCustomers", "/messages/new", "mail"),
                can.orders && a("orders", "shell.today.qa.orders", "/orders", "clock"),
                a("reports", "shell.today.qa.reports", "/reports", "chart"),
              ];
  return list.filter((x): x is QuickAction => !!x).slice(0, 4);
}

/** The secondary button beside the one black primary ("Open counter"). */
export function headerSecondary(family: TodayFamily, can: { kitchen: boolean; calendar: boolean; classes: boolean }): { label: MessageKey; href: string } {
  if (family === "restaurant" && can.kitchen) return { label: "shell.today.hdr.kitchen", href: "/restaurant/kitchen" };
  if (family === "appointments" && can.calendar) return { label: "shell.today.hdr.booking", href: "/calendar" };
  if (family === "studio" && can.classes) return { label: "shell.today.hdr.roster", href: "/classes" };
  if (family === "service") return { label: "shell.today.hdr.tickets", href: "/tickets" };
  return { label: "shell.today.hdr.qrKit", href: "/locations/kit" };
}
