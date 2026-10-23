/**
 * Restaurant Home (any restaurant.* feature): what needs the kitchen today. Open orders, quoted and average wait, sales,
 * pots for the next two days, the next festival for the shop's community, channel mix, the needs-you list and busy mode.
 * Numbers use the same filters as GET :m/orders and GET :m/preorders so the screens agree.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { catalogItems, cateringEvents, halls, hallBookings, locations, merchants, orderItems, orders, phoneCalls, reviewRequests, users, whatsappSessions } from "@ll/db";
import { festivalOccurrences, festivalRelevance, getFestival, restaurantApi } from "@ll/shared";

const { ASSUMED_APP_FEE_BPS, DIRECT_CHANNELS, ORDER_CHANNELS } = restaurantApi;
import type { AppContext } from "../context.js";
import { busyState, quotedWaitMinutes } from "./busyMode.js";
import { getMerchantFeatures, requireFeature } from "./features.js";
import { addDaysKey, capFor, dateKeyIn, localMidnightUtc, weekdayOfKey, waitlistCounts } from "./preorderPlanning.js";

type Merchant = typeof merchants.$inferSelect;

const OPEN = ["pending", "accepted", "preparing", "ready"] as const;
const SALE_KINDS = ["pickup", "preorder"] as const;
const LATE_NO_PICKUP_MS = 20 * 60_000;
const COMING_UP_DAYS = 2;

export async function requireAnyRestaurantFeature(ctx: AppContext, merchant: Merchant): Promise<void> {
  const f = await getMerchantFeatures(ctx.db, merchant);
  if (Object.values(f).some((x) => x.key.startsWith("restaurant.") && x.enabled)) return;
  await requireFeature(ctx.db, merchant, "restaurant.dietary_tags");
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-CA", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const timeLabel = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d).replace(/ /g, " ").replace(/\./g, "").toLowerCase();
const shortHour = (d: Date, tz: string) => timeLabel(d, tz).replace(":00", "");

/** First word of a dish ("Chicken Biryani Degh (serves 15)" -> "chicken") for the one-line pot split. */
export const potWord = (name: string) => (name.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0] ?? name).toLowerCase();

/** Open orders with the same filter as the orders screen: pay-at-pickup, or paid / authorized in the app. */
const visibleOpen = (merchantId: string) =>
  and(eq(orders.merchantId, merchantId), inArray(orders.status, [...OPEN]), or(eq(orders.paymentMethod, "at_pickup"), inArray(orders.paymentStatus, ["paid", "refunded", "authorized"])));

export async function restaurantHome(ctx: AppContext, m: Merchant): Promise<restaurantApi.RestaurantHomeResponse> {
  await requireAnyRestaurantFeature(ctx, m);
  const now = ctx.now();
  const tz = m.timezone;
  const today = dateKeyIn(now, tz);
  const dayStart = localMidnightUtc(today, tz);
  const lastWeekStart = localMidnightUtc(addDaysKey(today, -7), tz);
  const lastWeekSameTime = new Date(now.getTime() - 7 * 86_400_000);
  const features = await getMerchantFeatures(ctx.db, m);

  // --- open orders
  const open = await ctx.db.select({ status: orders.status, pickupAt: orders.pickupAt, createdAt: orders.createdAt }).from(orders).where(visibleOpen(m.id));
  const late = open.filter((o) => (o.status === "pending" || o.status === "accepted" || o.status === "preparing") && (o.pickupAt ? o.pickupAt.getTime() < now.getTime() : now.getTime() - o.createdAt.getTime() > LATE_NO_PICKUP_MS)).length;
  const counts = {
    new: open.filter((o) => o.status === "pending").length,
    preparing: open.filter((o) => o.status === "accepted" || o.status === "preparing").length,
    ready: open.filter((o) => o.status === "ready").length,
    late,
    open: open.length,
  };

  // --- wait: average minutes from placed to ready for today's pickup orders, last 7 days if none yet
  const waits = async (from: Date) => {
    const rows = await ctx.db
      .select({ createdAt: orders.createdAt, readyAt: orders.readyAt })
      .from(orders)
      .where(and(eq(orders.merchantId, m.id), eq(orders.kind, "pickup"), isNotNull(orders.readyAt), gte(orders.createdAt, from)));
    return rows.length ? Math.round(rows.reduce((s, r) => s + (r.readyAt!.getTime() - r.createdAt.getTime()) / 60_000, 0) / rows.length) : null;
  };
  const avgWaitMin = (await waits(dayStart)) ?? (await waits(new Date(now.getTime() - 7 * 86_400_000)));

  // --- sales today vs the same weekday last week up to the same time of day
  const saleWhere = (from: Date, to: Date) =>
    and(eq(orders.merchantId, m.id), gte(orders.createdAt, from), lt(orders.createdAt, to), inArray(orders.kind, [...SALE_KINDS]), ne(orders.status, "cancelled"), ne(orders.status, "refunded"), or(eq(orders.paymentMethod, "at_pickup"), inArray(orders.paymentStatus, ["paid", "authorized"])));
  const [todayRow] = await ctx.db.select({ sum: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int` }).from(orders).where(saleWhere(dayStart, new Date(now.getTime() + 1)));
  const [lastRow] = await ctx.db.select({ sum: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int` }).from(orders).where(saleWhere(lastWeekStart, lastWeekSameTime));
  const today$ = todayRow?.sum ?? 0;
  const last$ = lastRow?.sum ?? 0;
  const salesVsLast = last$ > 0 ? Math.round(((today$ - last$) / last$) * 100) : null;

  // --- channels today
  const chanRows = await ctx.db
    .select({ channel: orders.channel, n: sql<number>`count(*)::int` })
    .from(orders)
    .where(saleWhere(dayStart, new Date(now.getTime() + 1)))
    .groupBy(orders.channel);
  const channels = ORDER_CHANNELS.map((channel) => ({ channel, count: chanRows.find((r) => r.channel === channel)?.n ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  // --- commission avoided: an estimate
  const periodDays = 30;
  const directRows = await ctx.db
    .select({ total: orders.totalCents })
    .from(orders)
    .where(and(saleWhere(new Date(now.getTime() - periodDays * 86_400_000), new Date(now.getTime() + 1)), inArray(orders.channel, [...DIRECT_CHANNELS])));
  const directOrders = directRows.length;
  const avgTicketCents = directOrders ? Math.round(directRows.reduce((s, r) => s + r.total, 0) / directOrders) : 0;
  const cents = Math.round((directOrders * avgTicketCents * ASSUMED_APP_FEE_BPS) / 10_000);

  // --- coming up
  const comingUp: restaurantApi.ComingUpRow[] = [];
  const preorderOn = features["restaurant.degh_preorders"].enabled;
  if (preorderOn) {
    const waiting = await waitlistCounts(ctx.db, m.id, today, addDaysKey(today, COMING_UP_DAYS));
    for (let i = 0; i <= COMING_UP_DAYS; i++) {
      const d = addDaysKey(today, i);
      const rows = await ctx.db
        .select({ o: orders, name: orderItems.name, qty: orderItems.quantity, preorderOnly: catalogItems.preorderOnly })
        .from(orders)
        .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
        .innerJoin(catalogItems, eq(catalogItems.id, orderItems.catalogItemId))
        .where(and(eq(orders.merchantId, m.id), eq(orders.kind, "preorder"), inArray(orders.status, ["pending", "accepted", "preparing", "ready", "picked_up"]), gte(orders.pickupAt, localMidnightUtc(d, tz)), lt(orders.pickupAt, localMidnightUtc(addDaysKey(d, 1), tz))));
      const pots = rows.filter((r) => r.preorderOnly).reduce((s, r) => s + r.qty, 0);
      if (i === 0 && pots === 0) continue;
      const { cap } = capFor(m, d);
      const byDish = new Map<string, number>();
      for (const r of rows.filter((x) => x.preorderOnly)) byDish.set(potWord(r.name), (byDish.get(potWord(r.name)) ?? 0) + r.qty);
      const times = rows.filter((r) => r.o.pickupAt).map((r) => r.o.pickupAt!);
      const balances = new Set(rows.filter((r) => r.o.paymentStatus !== "paid" && r.o.status !== "picked_up").map((r) => r.o.id)).size;
      const sub = pots
        ? [[...byDish.entries()].map(([w, n]) => `${n} ${w}`).join(", "), times.length ? `pickup ${shortHour(new Date(Math.min(...times.map((t) => t.getTime()))), tz)} to ${shortHour(new Date(Math.max(...times.map((t) => t.getTime()))), tz)}` : ""].filter(Boolean).join(" · ")
        : "Nothing booked yet";
      const extra = [balances ? `${plural(balances, "balance")} due at pickup` : "", cap != null && pots > 0 ? `${Math.max(0, cap - pots)} pots left` : "", waiting.get(d) ? `${waiting.get(d)} waiting` : ""].filter(Boolean).join(" · ");
      comingUp.push({ date: d, kind: "preorder", title: `Degh pre-orders: ${plural(pots, "pot")}`, sub: pots && extra ? `${sub} · ${extra}` : sub, pots, cap, href: "/restaurant/preorders" });
    }
  }
  if (features["restaurant.catering"].enabled) {
    const evs = await ctx.db
      .select({ e: cateringEvents, name: users.name })
      .from(cateringEvents)
      .innerJoin(users, eq(users.id, cateringEvents.userId))
      .where(and(eq(cateringEvents.merchantId, m.id), inArray(cateringEvents.status, ["tasting", "quoted", "confirmed"]), gte(cateringEvents.eventDate, today), lte(cateringEvents.eventDate, addDaysKey(today, 7))))
      .orderBy(asc(cateringEvents.eventDate))
      .limit(3);
    for (const { e, name } of evs) {
      const type = e.eventType.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
      comingUp.push({ date: e.eventDate, kind: "catering", title: `${type}, ${plural(e.headcount, "guest")}`, sub: `Catering${name ? ` for ${name}` : ""}${e.depositPaidAt ? ` · deposit ${money(e.depositCents)} paid` : e.depositCents ? ` · deposit ${money(e.depositCents)} due` : ""}`, tag: e.status.replace(/^./, (c) => c.toUpperCase()), href: `/restaurant/catering/${e.id}` });
    }
  }
  if (features["restaurant.banquet"].enabled) {
    const bs = await ctx.db
      .select({ b: hallBookings, hall: halls.name })
      .from(hallBookings)
      .innerJoin(halls, eq(halls.id, hallBookings.hallId))
      .where(and(eq(hallBookings.merchantId, m.id), inArray(hallBookings.status, ["hold", "confirmed"]), gte(hallBookings.startsAt, dayStart), lt(hallBookings.startsAt, localMidnightUtc(addDaysKey(today, 8), tz))))
      .orderBy(asc(hallBookings.startsAt))
      .limit(3);
    for (const { b, hall } of bs) {
      const type = b.eventType.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
      comingUp.push({ date: dateKeyIn(b.startsAt, tz), kind: "banquet", title: `${type}, ${plural(b.headcount, "guest")}`, sub: `${hall} · starts ${shortHour(b.startsAt, tz)}`, tag: b.status === "hold" ? "On hold" : "Confirmed", href: "/restaurant/banquet" });
    }
  }
  if (features["restaurant.festival_campaigns"].enabled) {
    const upcoming = festivalOccurrences(today, addDaysKey(today, 60), m.festivalOverrides).filter((o) => o.daysUntil >= 0);
    const pick = upcoming.find((o) => festivalRelevance(getFestival(o.festivalId)!, m.cuisines) === "high") ?? upcoming.find((o) => festivalRelevance(getFestival(o.festivalId)!, m.cuisines) === "some");
    if (pick) {
      const send = pick.sends.find((s) => s.date >= today) ?? pick.sends[0];
      comingUp.push({
        date: pick.startDate,
        kind: "festival",
        title: pick.name,
        sub: `${pick.approximate ? "About " : ""}${new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${pick.startDate}T12:00:00Z`))}${send ? ` · first message ${new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${send.date}T12:00:00Z`))}` : ""}`,
        tag: !pick.approximate ? "Fixed" : getFestival(pick.festivalId)?.tradition === "islamic" ? "Moon sighting" : "Approximate",
        href: "/restaurant/festivals",
        festivalId: pick.festivalId,
      });
    }
  }
  comingUp.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "preorder" ? -1 : 1));

  // --- needs you
  const needsYou: restaurantApi.NeedsYouRow[] = [];
  if (counts.new) needsYou.push({ kind: "new_orders", count: counts.new, text: `${plural(counts.new, "new order")} waiting to be accepted`, href: "/orders", tone: "accent" });
  if (counts.late) needsYou.push({ kind: "late", count: counts.late, text: `${plural(counts.late, "order")} past their pickup time`, href: "/orders", tone: "negative" });
  if (features["restaurant.phone_ai"].enabled) {
    const calls = await ctx.db.select({ phone: phoneCalls.fromPhone }).from(phoneCalls).where(and(eq(phoneCalls.merchantId, m.id), eq(phoneCalls.status, "drafted"))).orderBy(desc(phoneCalls.createdAt));
    if (calls.length) needsYou.push({ kind: "phone_review", count: calls.length, text: calls.length === 1 ? `Call from ${formatPhone(calls[0]!.phone)} needs a look` : `${calls.length} phone calls need a look`, href: "/restaurant/phone-orders", tone: "info" });
  }
  if (features["restaurant.whatsapp_notifications"].enabled) {
    const [waRow] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(whatsappSessions).where(and(eq(whatsappSessions.merchantId, m.id), eq(whatsappSessions.state, "awaiting_payment")));
    const n = waRow?.n ?? 0;
    if (n) needsYou.push({ kind: "whatsapp_payment", count: n, text: `${plural(n, "WhatsApp chat")} waiting on payment`, href: "/restaurant/whatsapp", tone: "info" });
  }
  if (features["restaurant.reviews"].enabled) {
    const rv = await ctx.db
      .select({ rating: reviewRequests.rating })
      .from(reviewRequests)
      .where(and(eq(reviewRequests.merchantId, m.id), isNotNull(reviewRequests.feedback), lte(reviewRequests.rating, 3), isNull(reviewRequests.handledAt), gte(reviewRequests.createdAt, new Date(now.getTime() - 30 * 86_400_000))));
    if (rv.length) needsYou.push({ kind: "review", count: rv.length, text: rv.length === 1 ? `1 review of ${plural(rv[0]!.rating ?? 3, "star")}, private feedback in` : `${rv.length} reviews of 3 stars or less, private feedback in`, href: "/restaurant/reviews", tone: "info" });
  }

  // --- closing time of the first location today
  const [loc] = await ctx.db.select({ hours: locations.hours }).from(locations).where(and(eq(locations.merchantId, m.id), eq(locations.active, true))).orderBy(asc(locations.createdAt)).limit(1);
  const spans = loc?.hours?.[weekdayOfKey(today)];
  let closesAt: string | null = null;
  if (spans?.length) {
    const [h, min] = spans[spans.length - 1]![1].split(":").map(Number) as [number, number];
    const hour24 = h % 24;
    const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    closesAt = `${h12}${min ? `:${String(min).padStart(2, "0")}` : ""} ${hour24 >= 12 ? "pm" : "am"}`;
  }

  return {
    asOf: now.toISOString(),
    today,
    closesAt,
    orders: counts,
    avgWaitMin,
    quotedWaitMin: quotedWaitMinutes(m, now),
    salesTodayCents: today$,
    salesVsLastSameWeekdayPct: salesVsLast,
    directSavings: { estimate: true, periodDays, directOrders, avgTicketCents, assumedFeeBps: ASSUMED_APP_FEE_BPS, cents },
    channels,
    comingUp,
    needsYou,
    busy: await busyState(ctx, m),
  };
}

/** The three sidebar counts, without building the whole Home. */
export async function restaurantBadges(ctx: AppContext, m: Merchant): Promise<restaurantApi.RestaurantBadges> {
  const features = await getMerchantFeatures(ctx.db, m);
  const count = async (q: PromiseLike<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [orderCount, phone, whatsapp] = await Promise.all([
    count(ctx.db.select({ n: sql<number>`count(*)::int` }).from(orders).where(and(visibleOpen(m.id), eq(orders.status, "pending")))),
    features["restaurant.phone_ai"].enabled ? count(ctx.db.select({ n: sql<number>`count(*)::int` }).from(phoneCalls).where(and(eq(phoneCalls.merchantId, m.id), eq(phoneCalls.status, "drafted")))) : 0,
    features["restaurant.whatsapp_notifications"].enabled ? count(ctx.db.select({ n: sql<number>`count(*)::int` }).from(whatsappSessions).where(and(eq(whatsappSessions.merchantId, m.id), eq(whatsappSessions.state, "awaiting_payment")))) : 0,
  ]);
  return { orders: orderCount, phone, whatsapp };
}

function formatPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : p;
}
