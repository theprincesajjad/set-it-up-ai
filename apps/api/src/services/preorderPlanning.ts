/**
 * Pre-order planning (restaurant.degh_preorders): pot caps by weekday, per pickup hour and for Eid-style date overrides,
 * the capacity check used when a pre-order is placed, the day plan ("what to cook and buy" from per-pot recipes, which are
 * estimates) and the public availability for the guest's date chips. Kept free of orders.ts imports so orders.ts can call it.
 */
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { catalogItems, locations, merchants, orderItems, orders, preorderWaitlist, type DbOrTx } from "@ll/db";
import { getFestival, isQurbaniName, resolveFestivalDates, restaurantApi } from "@ll/shared";

const WEEKDAYS = restaurantApi.WEEKDAYS;
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { HttpError, badRequest, notFound } from "../lib/errors.js";
import { requireAnyFeature, PREORDER_FEATURES } from "./features.js";

type Merchant = typeof merchants.$inferSelect;
type CapFields = Pick<Merchant, "preorderDailyCap" | "preorderCapByWeekday" | "preorderOverrides" | "preorderPerHourCap">;

const BOOKED_STATUSES = ["pending", "accepted", "preparing", "ready", "picked_up"] as const;

/** YYYY-MM-DD in a time zone. */
export function dateKeyIn(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function addDaysKey(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** Local hour 0-23 of an instant. */
export function hourIn(d: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(d));
}
export function weekdayOfKey(dateKey: string): restaurantApi.Weekday {
  const dow = new Date(`${dateKey}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return WEEKDAYS[(dow + 6) % 7]!;
}
/** UTC instant of local midnight for a date key. */
export function localMidnightUtc(dateKey: string, timeZone: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  const offset = (t: number) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t));
    const get = (k: string) => Number(parts.find((p) => p.type === k)!.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - t;
  };
  const off1 = offset(guess);
  let t = guess - off1;
  const off2 = offset(t);
  if (off2 !== off1) t = guess - off2;
  return new Date(t);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
export function rulesDto(m: CapFields): restaurantApi.PreorderRulesResponse {
  return { preorderDailyCap: m.preorderDailyCap, capByWeekday: m.preorderCapByWeekday ?? {}, perHourCap: m.preorderPerHourCap, overrides: m.preorderOverrides ?? [] };
}

/** The pot cap for a local day: an Eid-style override, else the weekday cap, else the daily cap (null = no cap). */
export function capFor(m: CapFields, dateKey: string): { cap: number | null; note: string | null; leadHours: number | null } {
  const ov = (m.preorderOverrides ?? []).find((o) => o.from <= dateKey && dateKey <= o.to);
  if (ov) return { cap: ov.cap, note: ov.label, leadHours: ov.leadHours ?? null };
  const wd = (m.preorderCapByWeekday ?? {})[weekdayOfKey(dateKey)];
  return { cap: wd ?? m.preorderDailyCap ?? null, note: null, leadHours: null };
}

export async function getRules(ctx: AppContext, merchant: Merchant): Promise<restaurantApi.PreorderRulesResponse> {
  await requireAnyFeature(ctx.db, merchant, PREORDER_FEATURES);
  return rulesDto(merchant);
}

export async function saveRules(ctx: AppContext, merchant: Merchant, body: z.infer<typeof restaurantApi.preorderRulesBody>): Promise<restaurantApi.PreorderRulesResponse> {
  await requireAnyFeature(ctx.db, merchant, PREORDER_FEATURES);
  const patch: Partial<typeof merchants.$inferInsert> = {};
  if (body.preorderDailyCap !== undefined) patch.preorderDailyCap = body.preorderDailyCap;
  if (body.capByWeekday) {
    const next: Partial<Record<restaurantApi.Weekday, number>> = { ...(merchant.preorderCapByWeekday ?? {}) };
    for (const d of WEEKDAYS) {
      const v = body.capByWeekday[d];
      if (v === null) delete next[d];
      else if (v !== undefined) next[d] = v;
    }
    patch.preorderCapByWeekday = next;
  }
  if (body.perHourCap !== undefined) patch.preorderPerHourCap = body.perHourCap;
  if (body.overrides) {
    const sorted = [...body.overrides].sort((a, b) => a.from.localeCompare(b.from));
    for (let i = 1; i < sorted.length; i++) if (sorted[i]!.from <= sorted[i - 1]!.to) throw badRequest("Two date overrides overlap. Move one so each date has a single rule.");
    patch.preorderOverrides = sorted;
  }
  if (!Object.keys(patch).length) throw badRequest("Nothing to update");
  const [row] = await ctx.db.update(merchants).set({ ...patch, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id)).returning();
  return rulesDto(row!);
}

// ---------------------------------------------------------------------------
// Capacity (called when a pre-order is placed)
// ---------------------------------------------------------------------------
/** Minimum notice (hours) the shop's override sets for a pickup day; null when no override applies. */
export function overrideLeadHours(m: CapFields & Pick<Merchant, "timezone">, pickupAt: Date): number | null {
  return capFor(m, dateKeyIn(pickupAt, m.timezone)).leadHours;
}

/** The label on the one-day date rules the grocer's Eid plan writes ("Eid al-Adha day 1"). */
export const EID_PLAN_LABEL = "Eid al-Adha day";

/**
 * The shop's Eid al-Adha pick-up days that are still ahead (or today), from the date rules the Eid plan saved. They already follow
 * moon sighting (moving Eid moves the rules). Null when the shop has not set a plan or every day has passed.
 */
export function eidPlanDays(m: Pick<Merchant, "preorderOverrides" | "festivalOverrides">, today: string): { dates: string[]; start: string; moved: boolean } | null {
  const rules = (m.preorderOverrides ?? []).filter((o) => o.label.startsWith(EID_PLAN_LABEL) && o.to >= today).sort((a, b) => a.from.localeCompare(b.from));
  if (!rules.length) return null;
  const dates = rules.map((o) => o.from);
  const f = getFestival("eid_al_adha");
  const r = f ? resolveFestivalDates(f, dates[0]!.slice(0, 4), m.festivalOverrides) : null;
  return { dates, start: dates[0]!, moved: !!r?.moved };
}

/** Pots already booked, one row per order line, for a local pickup day. */
export async function potRowsOnDay(db: DbOrTx, m: Pick<Merchant, "id" | "timezone">, dateKey: string, excludeOrderId?: string) {
  const from = localMidnightUtc(dateKey, m.timezone);
  const to = localMidnightUtc(addDaysKey(dateKey, 1), m.timezone);
  const rows = await db
    .select({ orderId: orders.id, pickupAt: orders.pickupAt, quantity: orderItems.quantity })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(catalogItems, eq(catalogItems.id, orderItems.catalogItemId))
    .where(and(eq(orders.merchantId, m.id), eq(orders.kind, "preorder"), eq(catalogItems.preorderOnly, true), inArray(orders.status, [...BOOKED_STATUSES]), gte(orders.pickupAt, from), lt(orders.pickupAt, to)));
  return excludeOrderId ? rows.filter((r) => r.orderId !== excludeOrderId) : rows;
}

/**
 * Throws 409 preorder_full when booking `pots` more for `pickupAt` would pass the day's cap or the per-hour cap.
 * Call inside the order transaction: it takes the same advisory lock per shop and day as before.
 */
export async function assertPreorderCapacity(tx: DbOrTx, m: Merchant, pickupAt: Date, pots: number): Promise<void> {
  if (pots <= 0) return;
  const day = dateKeyIn(pickupAt, m.timezone);
  const { cap, note } = capFor(m, day);
  const hourCap = m.preorderPerHourCap;
  if (cap == null && hourCap == null) return;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`preorder:${m.id}:${day}`}))`);
  const rows = await potRowsOnDay(tx, m, day);
  if (cap != null) {
    const booked = rows.reduce((s, r) => s + r.quantity, 0);
    if (booked + pots > cap) {
      const remaining = Math.max(0, cap - booked);
      throw new HttpError(409, "preorder_full", remaining ? `Only ${remaining} pot${remaining === 1 ? "" : "s"} left for that day.` : `That day is fully booked${note ? ` (${note})` : ""}. Pick another day.`, { remaining, date: day });
    }
  }
  if (hourCap != null) {
    const hour = hourIn(pickupAt, m.timezone);
    const booked = rows.filter((r) => r.pickupAt && hourIn(r.pickupAt, m.timezone) === hour).reduce((s, r) => s + r.quantity, 0);
    if (booked + pots > hourCap) {
      const remaining = Math.max(0, hourCap - booked);
      throw new HttpError(409, "preorder_full", remaining ? `Only ${remaining} pot${remaining === 1 ? "" : "s"} left for that pickup hour. Pick another time.` : "That pickup hour is full. Pick another time.", { remaining, date: day, hour, scope: "hour" });
    }
  }
}

// ---------------------------------------------------------------------------
// Day plan: what to cook and what to buy (estimates from per-pot recipes)
// ---------------------------------------------------------------------------
export interface PlanInputLine {
  catalogItemId: string | null;
  name: string;
  quantity: number;
  serves: number | null;
  preorderOnly: boolean;
  cookMinutes: number;
  recipe: typeof catalogItems.$inferSelect.recipe;
  pickupAt: Date;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildPlan(lines: PlanInputLine[]): { plan: restaurantApi.PreorderPlanLine[]; shopping: restaurantApi.PreorderShopping | null } {
  const byDish = new Map<string, PlanInputLine[]>();
  for (const l of lines) {
    if (!l.preorderOnly) continue;
    const key = l.catalogItemId ?? l.name;
    byDish.set(key, [...(byDish.get(key) ?? []), l]);
  }
  const plan: restaurantApi.PreorderPlanLine[] = [];
  for (const group of byDish.values()) {
    const first = group[0]!;
    const pots = group.reduce((s, l) => s + l.quantity, 0);
    const times = group.map((l) => l.pickupAt.getTime());
    const firstPickup = new Date(Math.min(...times));
    const lastPickup = new Date(Math.max(...times));
    const r = first.recipe;
    const hasRecipe = !!r && (r.riceKg != null || r.meatKg != null || !!r.extras?.length);
    plan.push({
      catalogItemId: first.catalogItemId,
      name: first.name,
      pots,
      quantity: pots,
      serves: first.serves ? first.serves * pots : null,
      fireAt: first.cookMinutes > 0 ? new Date(firstPickup.getTime() - first.cookMinutes * 60_000).toISOString() : null,
      firstPickupAt: firstPickup.toISOString(),
      lastPickupAt: lastPickup.toISOString(),
      cookMinutes: first.cookMinutes,
      riceKg: hasRecipe && r!.riceKg != null ? round1(r!.riceKg * pots) : null,
      meatKg: hasRecipe && r!.meatKg != null ? round1(r!.meatKg * pots) : null,
      meatKind: hasRecipe ? (r!.meatKind ?? null) : null,
      extras: hasRecipe ? (r!.extras ?? []).map((e) => ({ name: e.name, qty: round1(e.qty * pots), unit: e.unit })) : [],
      hasRecipe,
    });
  }
  plan.sort((a, b) => (a.fireAt ?? a.firstPickupAt).localeCompare(b.fireAt ?? b.firstPickupAt) || a.name.localeCompare(b.name));
  return { plan, shopping: shoppingFor(plan) };
}

export function shoppingFor(plan: restaurantApi.PreorderPlanLine[]): restaurantApi.PreorderShopping | null {
  const withRecipe = plan.filter((p) => p.hasRecipe);
  if (!withRecipe.length) return null;
  const rice = withRecipe.reduce((s, p) => s + (p.riceKg ?? 0), 0);
  const meats = new Map<string, number>();
  for (const p of withRecipe) if (p.meatKg) meats.set(p.meatKind ?? "meat", (meats.get(p.meatKind ?? "meat") ?? 0) + p.meatKg);
  const extras = new Map<string, { name: string; qty: number; unit: string }>();
  for (const p of withRecipe) for (const e of p.extras) {
    const k = `${e.name}|${e.unit}`;
    extras.set(k, { name: e.name, qty: round1((extras.get(k)?.qty ?? 0) + e.qty), unit: e.unit });
  }
  const items: restaurantApi.PreorderShoppingItem[] = [];
  if (rice > 0) items.push({ name: "rice", qty: round1(rice), unit: "kg" });
  for (const [kind, kg] of [...meats.entries()].sort(([a], [b]) => a.localeCompare(b))) items.push({ name: kind, qty: round1(kg), unit: "kg" });
  items.push(...[...extras.values()].sort((a, b) => a.name.localeCompare(b.name)));
  if (!items.length) return null;
  return { estimate: true, items, text: items.map((i) => `${i.name} ${i.qty} ${i.unit}`).join(", ") };
}

/** Guests waiting, per local day, for days in [from, to]. */
export async function waitlistCounts(db: DbOrTx, merchantId: string, from: string, to: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ date: preorderWaitlist.date, n: sql<number>`count(*)::int` })
    .from(preorderWaitlist)
    .where(and(eq(preorderWaitlist.merchantId, merchantId), gte(preorderWaitlist.date, from), sql`${preorderWaitlist.date} <= ${to}`, sql`${preorderWaitlist.notifiedAt} is null`))
    .groupBy(preorderWaitlist.date);
  return new Map(rows.map((r) => [r.date, r.n]));
}

// ---------------------------------------------------------------------------
// Public availability (guest's date chips)
// ---------------------------------------------------------------------------
/**
 * Opening hours for a weekday from the shop's first active location, as [openHour, closeHour), or null when the shop is
 * closed that day (hours are set but the day has none). Falls back to 11 to 21 only when the shop never set hours.
 */
export async function openHours(db: DbOrTx, merchantId: string, dateKey: string): Promise<[number, number] | null> {
  const [loc] = await db.select({ hours: locations.hours }).from(locations).where(and(eq(locations.merchantId, merchantId), eq(locations.active, true))).orderBy(asc(locations.createdAt)).limit(1);
  const hasHours = !!loc?.hours && Object.values(loc.hours).some((v) => v && v.length);
  const spans = loc?.hours?.[weekdayOfKey(dateKey)] ?? null;
  if (hasHours && !(spans && spans.length)) return null;
  if (spans && spans.length) {
    const open = Math.min(...spans.map(([a]) => Number(a.slice(0, 2))));
    const closeRaw = Math.max(...spans.map(([, b]) => (b === "00:00" ? 24 : Number(b.slice(0, 2)) + (Number(b.slice(3, 5)) > 0 ? 1 : 0))));
    return [open, Math.max(open + 1, Math.min(24, closeRaw))];
  }
  return [11, 21];
}

export async function availability(ctx: AppContext, merchant: Merchant, q: z.infer<typeof restaurantApi.preorderAvailabilityQuery>): Promise<restaurantApi.PreorderAvailabilityResponse> {
  await requireAnyFeature(ctx.db, merchant, PREORDER_FEATURES);
  const [item] = await ctx.db.select().from(catalogItems).where(and(eq(catalogItems.id, q.itemId), eq(catalogItems.merchantId, merchant.id))).limit(1);
  if (!item || !item.available || !item.orderable) throw notFound("Dish");
  const now = ctx.now();
  const today = dateKeyIn(now, merchant.timezone);
  const from = q.from && q.from > today ? q.from : today;
  const to = q.to && q.to < addDaysKey(from, 60) ? q.to : addDaysKey(from, 29);
  if (to < from) throw badRequest("'to' is before 'from'");
  const days: restaurantApi.PreorderAvailabilityDay[] = [];
  // Qurbani is picked up on the shop's Eid plan days, not on a rolling window from today.
  const plan = isQurbaniName(item.name) ? eidPlanDays(merchant, today) : null;
  const dates: string[] = plan ? plan.dates : [];
  if (!plan) for (let d = from; d <= to; d = addDaysKey(d, 1)) dates.push(d);
  const waiting = await waitlistCounts(ctx.db, merchant.id, dates[0]!, dates.at(-1)!);
  for (const d of dates) {
    const { cap, note, leadHours: ovLead } = capFor(merchant, d);
    const lead = Math.max(item.leadTimeHours, ovLead ?? 0);
    const earliest = now.getTime() + lead * 3_600_000;
    const dayEnd = localMidnightUtc(addDaysKey(d, 1), merchant.timezone).getTime();
    const tooSoon = dayEnd <= earliest;
    const rows = cap != null || merchant.preorderPerHourCap != null ? await potRowsOnDay(ctx.db, merchant, d) : [];
    const booked = rows.reduce((s, r) => s + r.quantity, 0);
    const potsLeft = cap == null ? null : Math.max(0, cap - booked);
    const hours = await openHours(ctx.db, merchant.id, d);
    const closed = hours === null;
    const [open, close] = hours ?? [0, 0];
    const windows: restaurantApi.PreorderAvailabilityDay["windows"] = [];
    for (let h = open; h < close; h++) {
      const start = new Date(localMidnightUtc(d, merchant.timezone).getTime() + h * 3_600_000);
      const hourBooked = rows.filter((r) => r.pickupAt && hourIn(r.pickupAt, merchant.timezone) === h).reduce((s, r) => s + r.quantity, 0);
      const full = start.getTime() < earliest || (merchant.preorderPerHourCap != null && hourBooked >= merchant.preorderPerHourCap) || (potsLeft != null && potsLeft <= 0);
      windows.push({ start: `${String(h).padStart(2, "0")}:00`, end: `${String(h + 1).padStart(2, "0")}:00`, full });
    }
    days.push({ date: d, potsLeft, full: !closed && potsLeft != null && potsLeft <= 0, closed, waiting: waiting.get(d) ?? 0, tooSoon, windows, note });
    if (days.length >= 60) break;
  }
  return { itemId: item.id, leadHours: item.leadTimeHours, perHourCap: merchant.preorderPerHourCap, days, ...(plan ? { plan: { kind: "eid_al_adha" as const, start: plan.start, moved: plan.moved } } : {}) };
}
