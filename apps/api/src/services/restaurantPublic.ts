/**
 * Public restaurant read for the customer web pages (desi1): the shop page summary (GET /public/shops/:slug/restaurant).
 * Pots left per day come from the pre-order planning service (services/preorderPlanning.ts availability, desi2), so the
 * shop page, the degh page and the booking check all use the same caps. No login. Halal claims are the shop's own.
 */
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { catalogItems, merchants, orderItems, orders } from "@ll/db";
import { restaurantApi, restaurantWebApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { addDays } from "./bookings.js";
import { isAnyFeatureOn, isFeatureOn, PREORDER_FEATURES } from "./features.js";
import { publicCertification } from "./halal.js";
import { availability } from "./preorderPlanning.js";

type Merchant = typeof merchants.$inferSelect;

const localDay = (d: Date, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const dowOf = (date: string) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** The wait we quote: the base wait plus the busy-mode minutes while busy mode is on. */
export function quotedWaitMinutes(m: Pick<Merchant, "busyAddMinutes" | "busyUntil">, now: Date): number {
  return restaurantApi.BASE_QUOTED_WAIT_MIN + (m.busyUntil && m.busyUntil > now ? m.busyAddMinutes : 0);
}

/** The Saturday and Sunday this weekend: today counts when it is one. */
export function weekendDates(today: string): string[] {
  const dow = dowOf(today);
  const sat = dow === 0 ? addDays(today, -1) : addDays(today, (6 - dow + 7) % 7);
  const sun = addDays(sat, 1);
  return [sat, sun].filter((d) => d >= today);
}

export async function publicRestaurant(ctx: AppContext, merchant: Merchant): Promise<restaurantWebApi.PublicRestaurantResponse> {
  const now = ctx.now();
  const pickup = await isFeatureOn(ctx.db, merchant, "orders.order_ahead");
  const deghOn = pickup && (await isAnyFeatureOn(ctx.db, merchant, PREORDER_FEATURES));
  const dietOn = await isFeatureOn(ctx.db, merchant, "restaurant.dietary_tags");
  const items = pickup ? await ctx.db.select().from(catalogItems).where(and(eq(catalogItems.merchantId, merchant.id), eq(catalogItems.available, true), eq(catalogItems.orderable, true))).orderBy(asc(catalogItems.sortOrder), asc(catalogItems.name)) : [];
  const preorderItems = deghOn ? items.filter((i) => i.preorderOnly) : [];
  const regular = items.filter((i) => !i.preorderOnly);

  let weekend: restaurantWebApi.PublicRestaurantResponse["weekend"] = [];
  if (preorderItems.length) {
    const today = localDay(now, merchant.timezone);
    const dates = weekendDates(today);
    const a = await availability(ctx, merchant, { itemId: preorderItems[0]!.id, from: dates[0]!, to: dates[dates.length - 1]! });
    weekend = a.days.filter((d) => dates.includes(d.date)).map((d) => ({ date: d.date, potsLeft: d.potsLeft, full: d.full, closed: d.closed }));
  }

  let popular: string[] = [];
  if (regular.length) {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const rows = await ctx.db
      .select({ id: orderItems.catalogItemId, n: sql<number>`sum(${orderItems.quantity})::int` })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orders.merchantId, merchant.id), gte(orders.createdAt, since), inArray(orders.status, ["pending", "accepted", "preparing", "ready", "picked_up"])))
      .groupBy(orderItems.catalogItemId)
      .orderBy(desc(sql`sum(${orderItems.quantity})`));
    const ok = new Set(regular.map((i) => i.id));
    popular = rows.map((r) => r.id).filter((id): id is string => !!id && ok.has(id)).slice(0, 6);
    for (const i of regular) if (popular.length < 3 && !popular.includes(i.id)) popular.push(i.id);
  }

  return {
    halalCertification: dietOn ? publicCertification(merchant.halalCertification, merchant, now) : null,
    weekend,
    popular,
    acceptingOrders: pickup && merchant.status !== "paused" && merchant.status !== "closed",
    quotedWaitMin: pickup ? quotedWaitMinutes(merchant, now) : null,
    whatsappNumber: merchant.whatsappNumber,
    preorderItems: preorderItems.map((i) => ({ id: i.id, name: i.name, serves: i.serves, priceCents: i.priceCents, leadTimeHours: i.leadTimeHours, depositBps: i.depositBps })),
    cancelCutoffHours: merchant.preorderCancelCutoffHours,
    features: { pickup, preorder: preorderItems.length > 0 },
  };
}
