/**
 * Tire season and storage (docs/research/auto-care.md 2.3): the fall and spring swap windows with a capacity plan per day,
 * customers and staff booking a swap (refused on a full day), and the tire hotel: a stored set with rack, season and tread
 * and a pickup text before the window opens. Capacity is bays x hours x 60 / minutes a swap, set by the shop.
 */
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { merchantMembers, merchants as merchantsTable, tireSets, tireSwaps, users, vehicles, autoSettings } from "@ll/db";
import {
  type TireSettings,
  type TireWindowName,
  addDaysStr,
  autoApi,
  currentOrNextWindow,
  dayPlan,
  normalizeLocale,
  pickupRemindOn,
  setForWindow,
  swapsPerDay,
  tireWindowOn,
  translator,
  treadStatus,
} from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { AuthUser, StaffContext } from "../lib/auth.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { isFeatureOn } from "./features.js";
import { getSettingsRow, sendShopText, vehicleLabel, DEFAULT_TZ } from "./auto-vehicles.js";
import { localDate } from "./messaging.js";

type Merchant = typeof merchantsTable.$inferSelect;
type SetRow = typeof tireSets.$inferSelect;
const todayFor = (ctx: AppContext, tz: string) => localDate(ctx.now(), tz);

export const tireSettingsOf = (s: typeof autoSettings.$inferSelect): TireSettings => ({
  bays: s.bays,
  hoursPerDay: s.hoursPerDay,
  minutesPerSwap: s.minutesPerSwap,
  fallStart: s.fallStart,
  fallEnd: s.fallEnd,
  springStart: s.springStart,
  springEnd: s.springEnd,
  pickupLeadDays: s.pickupLeadDays,
});

/** The next window (open now or still to come) in which this season's set is wanted: winter in fall, summer in spring. */
export function windowForSeason(today: string, ts: TireSettings, season: string): { name: TireWindowName; start: string; end: string; open: boolean } | null {
  if (season === "all_weather") return null;
  const first = currentOrNextWindow(today, ts);
  if (setForWindow(first.name) === season) return first;
  const second = currentOrNextWindow(addDaysStr(first.end, 1), ts);
  return setForWindow(second.name) === season ? second : null;
}

export async function tireSetDtos(ctx: AppContext, merchant: Merchant, rows: SetRow[]): Promise<autoApi.TireSetDto[]> {
  if (!rows.length) return [];
  const st = await getSettingsRow(ctx, merchant.id);
  const ts = tireSettingsOf(st);
  const today = todayFor(ctx, merchant.timezone);
  const owners = await ctx.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.userId))]));
  const vids = rows.map((r) => r.vehicleId).filter((x): x is string => !!x);
  const vs = vids.length ? await ctx.db.select().from(vehicles).where(inArray(vehicles.id, vids)) : [];
  return rows.map((r) => {
    const w = r.status === "stored" ? windowForSeason(today, ts, r.season) : null;
    const v = vs.find((x) => x.id === r.vehicleId);
    return {
      id: r.id,
      rack: r.rack,
      season: r.season as autoApi.TireSetDto["season"],
      label: r.label,
      vehicleId: r.vehicleId,
      vehicleLabel: v ? vehicleLabel(v) : null,
      ownerId: r.userId,
      ownerName: owners.find((o) => o.id === r.userId)?.name ?? null,
      treadMm: r.treadTenthsMm == null ? null : r.treadTenthsMm / 10,
      treadStatus: treadStatus(r.treadTenthsMm),
      storedOn: r.storedOn,
      status: r.status as "stored" | "picked_up",
      pickedUpOn: r.pickedUpOn,
      note: r.note,
      pickupWindow: w ? { name: w.name, start: w.start } : null,
      pickupTextOn: w ? pickupRemindOn(w.start, ts.pickupLeadDays) : null,
      pickupTexted: !!w && r.pickupNudgedFor === w.start,
    };
  });
}

export async function listSets(ctx: AppContext, merchant: Merchant, status: "stored" | "picked_up" = "stored"): Promise<autoApi.TireSetsResponse> {
  const rows = await ctx.db.select().from(tireSets).where(and(eq(tireSets.merchantId, merchant.id), eq(tireSets.status, status))).orderBy(asc(tireSets.rack), asc(tireSets.storedOn)).limit(500);
  const items = await tireSetDtos(ctx, merchant, rows);
  return { items, counts: { stored: items.length, racks: new Set(items.map((i) => i.rack)).size, replaceSoon: items.filter((i) => i.treadStatus === "replace_soon" || i.treadStatus === "wear_bar").length } };
}

async function memberOf(ctx: AppContext, merchant: Merchant, memberId: string) {
  const [m] = await ctx.db.select().from(merchantMembers).where(and(eq(merchantMembers.id, memberId), eq(merchantMembers.merchantId, merchant.id))).limit(1);
  if (!m) throw notFound("Customer");
  return m;
}

async function checkVehicleOf(ctx: AppContext, userId: string, vehicleId: string | null | undefined): Promise<string | null> {
  if (!vehicleId) return null;
  const [v] = await ctx.db.select({ id: vehicles.id }).from(vehicles).where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, userId))).limit(1);
  if (!v) throw badRequest("That vehicle does not belong to this customer.");
  return v.id;
}

const tenths = (mm: number | null | undefined) => (mm == null ? null : Math.round(mm * 10));

export async function createSet(ctx: AppContext, staff: StaffContext, body: z.output<typeof autoApi.tireSetBody>): Promise<autoApi.TireSetDto> {
  const merchant = staff.merchant;
  const m = await memberOf(ctx, merchant, body.memberId);
  const vehicleId = await checkVehicleOf(ctx, m.userId, body.vehicleId);
  const [row] = await ctx.db
    .insert(tireSets)
    .values({ merchantId: merchant.id, userId: m.userId, vehicleId, rack: body.rack.trim().toUpperCase(), season: body.season, label: body.label?.trim() || null, treadTenthsMm: tenths(body.treadMm), storedOn: body.storedOn ?? todayFor(ctx, merchant.timezone), note: body.note?.trim() || null })
    .returning();
  return (await tireSetDtos(ctx, merchant, [row!]))[0]!;
}

async function shopSet(ctx: AppContext, merchant: Merchant, id: string): Promise<SetRow> {
  const [r] = await ctx.db.select().from(tireSets).where(and(eq(tireSets.id, id), eq(tireSets.merchantId, merchant.id))).limit(1);
  if (!r) throw notFound("Tire set");
  return r;
}

export async function updateSet(ctx: AppContext, staff: StaffContext, id: string, body: z.output<typeof autoApi.updateTireSetBody>): Promise<autoApi.TireSetDto> {
  const merchant = staff.merchant;
  const cur = await shopSet(ctx, merchant, id);
  if (cur.status !== "stored") throw conflict("That set has been picked up.");
  const patch: Partial<typeof tireSets.$inferInsert> = { updatedAt: ctx.now() };
  if (body.vehicleId !== undefined) patch.vehicleId = await checkVehicleOf(ctx, cur.userId, body.vehicleId);
  if (body.rack !== undefined) patch.rack = body.rack.trim().toUpperCase();
  if (body.season !== undefined) patch.season = body.season;
  if (body.label !== undefined) patch.label = body.label?.trim() || null;
  if (body.treadMm !== undefined) patch.treadTenthsMm = tenths(body.treadMm);
  if (body.storedOn !== undefined) patch.storedOn = body.storedOn;
  if (body.note !== undefined) patch.note = body.note?.trim() || null;
  const [row] = await ctx.db.update(tireSets).set(patch).where(eq(tireSets.id, id)).returning();
  return (await tireSetDtos(ctx, merchant, [row!]))[0]!;
}

/** The customer collected the set. A set cannot be picked up twice. */
export async function pickupSet(ctx: AppContext, staff: StaffContext, id: string): Promise<autoApi.TireSetDto> {
  const merchant = staff.merchant;
  const cur = await shopSet(ctx, merchant, id);
  const [row] = await ctx.db
    .update(tireSets)
    .set({ status: "picked_up", pickedUpOn: todayFor(ctx, merchant.timezone), updatedAt: ctx.now() })
    .where(and(eq(tireSets.id, cur.id), eq(tireSets.status, "stored")))
    .returning();
  if (!row) throw conflict("That set was already picked up.");
  return (await tireSetDtos(ctx, merchant, [row]))[0]!;
}

// ---------------------------------------------------------------------------
// Capacity plan and swaps
// ---------------------------------------------------------------------------
async function bookedByDay(ctx: AppContext, merchantId: string, from: string, to: string): Promise<Map<string, number>> {
  const rows = await ctx.db
    .select({ day: tireSwaps.day, n: sql<number>`count(*)::int` })
    .from(tireSwaps)
    .where(and(eq(tireSwaps.merchantId, merchantId), gte(tireSwaps.day, from), lte(tireSwaps.day, to), inArray(tireSwaps.status, ["booked", "done"])))
    .groupBy(tireSwaps.day);
  return new Map(rows.map((r) => [r.day, Number(r.n)]));
}

function dayDto(day: string, booked: number, ts: TireSettings): autoApi.TireDayDto {
  const p = dayPlan(day, booked, ts);
  return { day, capacity: p.capacity, booked: p.booked, free: p.free, full: p.full, window: tireWindowOn(day, ts) };
}

function swapDtos(rows: (typeof tireSwaps.$inferSelect)[], owners: Map<string, string | null>, vlabels: Map<string, string>, racks: Map<string, string>): autoApi.TireSwapDto[] {
  return rows.map((s) => ({ id: s.id, day: s.day, status: s.status as autoApi.TireSwapDto["status"], source: s.source as "customer" | "staff", ownerId: s.userId, ownerName: owners.get(s.userId) ?? null, vehicleId: s.vehicleId, vehicleLabel: s.vehicleId ? (vlabels.get(s.vehicleId) ?? null) : null, tireSetRack: s.tireSetId ? (racks.get(s.tireSetId) ?? null) : null, note: s.note }));
}

export async function plan(ctx: AppContext, merchant: Merchant, q: z.output<typeof autoApi.tirePlanQuery>): Promise<autoApi.TirePlanResponse> {
  const st = await getSettingsRow(ctx, merchant.id);
  const ts = tireSettingsOf(st);
  const today = todayFor(ctx, merchant.timezone);
  const from = q.from ?? today;
  const to = addDaysStr(from, q.days - 1);
  const booked = await bookedByDay(ctx, merchant.id, from, to);
  const days: autoApi.TireDayDto[] = [];
  for (let i = 0; i < q.days; i++) {
    const d = addDaysStr(from, i);
    days.push(dayDto(d, booked.get(d) ?? 0, ts));
  }
  const rows = await ctx.db.select().from(tireSwaps).where(and(eq(tireSwaps.merchantId, merchant.id), gte(tireSwaps.day, from), lte(tireSwaps.day, to), inArray(tireSwaps.status, ["booked", "done", "no_show"]))).orderBy(asc(tireSwaps.day), asc(tireSwaps.createdAt));
  const owners = new Map((rows.length ? await ctx.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.userId))])) : []).map((u) => [u.id, u.name]));
  const vids = rows.map((r) => r.vehicleId).filter((x): x is string => !!x);
  const vlabels = new Map((vids.length ? await ctx.db.select().from(vehicles).where(inArray(vehicles.id, vids)) : []).map((v) => [v.id, vehicleLabel(v)]));
  const sids = rows.map((r) => r.tireSetId).filter((x): x is string => !!x);
  const racks = new Map((sids.length ? await ctx.db.select({ id: tireSets.id, rack: tireSets.rack }).from(tireSets).where(inArray(tireSets.id, sids)) : []).map((s) => [s.id, s.rack]));
  const w = currentOrNextWindow(today, ts);
  return { settings: (await import("./auto-vehicles.js")).settingsDto(st), window: w, days, swaps: swapDtos(rows, owners, vlabels, racks) };
}

/** Books a swap. The day's capacity is checked under a lock so two bookings cannot both take the last place. */
async function bookSwap(ctx: AppContext, merchant: Merchant, a: { userId: string; vehicleId: string | null; day: string; source: "customer" | "staff"; note?: string | null; windowOnly: boolean }): Promise<typeof tireSwaps.$inferSelect> {
  const st = await getSettingsRow(ctx, merchant.id);
  const ts = tireSettingsOf(st);
  const today = todayFor(ctx, merchant.timezone);
  if (a.day < today) throw badRequest("That day has passed.");
  if (a.windowOnly && !tireWindowOn(a.day, ts)) throw badRequest("Swaps are booked inside the fall and spring windows.");
  if (swapsPerDay(ts) <= 0) throw new HttpError(409, "day_full", "That day is full.");
  return ctx.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`tire:${merchant.id}:${a.day}`}, 0))`);
    const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(tireSwaps).where(and(eq(tireSwaps.merchantId, merchant.id), eq(tireSwaps.day, a.day), inArray(tireSwaps.status, ["booked", "done"])));
    if (dayPlan(a.day, Number(n?.n ?? 0), ts).full) throw new HttpError(409, "day_full", "That day is full. Pick another day.");
    const [mine] = await tx.select({ id: tireSwaps.id }).from(tireSwaps).where(and(eq(tireSwaps.merchantId, merchant.id), eq(tireSwaps.userId, a.userId), eq(tireSwaps.day, a.day), eq(tireSwaps.status, "booked"))).limit(1);
    if (mine) throw conflict("There is already a swap booked for that customer on that day.");
    const [stored] = await tx.select({ id: tireSets.id }).from(tireSets).where(and(eq(tireSets.merchantId, merchant.id), eq(tireSets.userId, a.userId), eq(tireSets.status, "stored"), a.vehicleId ? eq(tireSets.vehicleId, a.vehicleId) : sql`true`)).orderBy(asc(tireSets.rack)).limit(1);
    const [row] = await tx.insert(tireSwaps).values({ merchantId: merchant.id, userId: a.userId, vehicleId: a.vehicleId, day: a.day, source: a.source, note: a.note?.trim() || null, tireSetId: stored?.id ?? null }).returning();
    return row!;
  });
}

export async function staffBookSwap(ctx: AppContext, staff: StaffContext, body: z.output<typeof autoApi.swapBody>): Promise<autoApi.TirePlanResponse> {
  const merchant = staff.merchant;
  const m = await memberOf(ctx, merchant, body.memberId);
  const vehicleId = await checkVehicleOf(ctx, m.userId, body.vehicleId);
  await bookSwap(ctx, merchant, { userId: m.userId, vehicleId, day: body.day, source: "staff", note: body.note, windowOnly: false });
  return plan(ctx, merchant, { from: body.day, days: 1 });
}

export async function setSwapStatus(ctx: AppContext, staff: StaffContext, id: string, body: z.output<typeof autoApi.swapStatusBody>): Promise<{ ok: true }> {
  const [s] = await ctx.db.select().from(tireSwaps).where(and(eq(tireSwaps.id, id), eq(tireSwaps.merchantId, staff.merchant.id))).limit(1);
  if (!s) throw notFound("Swap");
  if (s.status !== "booked") throw conflict(`That swap is already ${s.status.replace("_", " ")}.`);
  await ctx.db.update(tireSwaps).set({ status: body.status }).where(eq(tireSwaps.id, id));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The owner's side
// ---------------------------------------------------------------------------
export async function myTireShops(ctx: AppContext, user: AuthUser): Promise<autoApi.MyTireShopDto[]> {
  const rows = await ctx.db
    .select({ m: merchantsTable })
    .from(merchantMembers)
    .innerJoin(merchantsTable, eq(merchantsTable.id, merchantMembers.merchantId))
    .where(and(eq(merchantMembers.userId, user.id), inArray(merchantsTable.status, ["onboarding", "active"])));
  const out: autoApi.MyTireShopDto[] = [];
  for (const { m } of rows) {
    if (!(await isFeatureOn(ctx.db, m, "auto.tires"))) continue;
    const st = await getSettingsRow(ctx, m.id);
    const ts = tireSettingsOf(st);
    const today = todayFor(ctx, m.timezone);
    const w = currentOrNextWindow(today, ts);
    const sets = await ctx.db.select().from(tireSets).where(and(eq(tireSets.merchantId, m.id), eq(tireSets.userId, user.id), eq(tireSets.status, "stored")));
    const swaps = await ctx.db.select().from(tireSwaps).where(and(eq(tireSwaps.merchantId, m.id), eq(tireSwaps.userId, user.id), eq(tireSwaps.status, "booked"), gte(tireSwaps.day, today))).orderBy(asc(tireSwaps.day));
    // Days to offer: the open window from today, or the next window's first two weeks.
    const start = w.open ? today : w.start;
    const from = start < today ? today : start;
    const booked = await bookedByDay(ctx, m.id, from, addDaysStr(from, 30));
    const days: autoApi.TireDayDto[] = [];
    for (let i = 0; i <= 30; i++) {
      const d = addDaysStr(from, i);
      if (d > w.end) break;
      days.push(dayDto(d, booked.get(d) ?? 0, ts));
    }
    const vs = await ctx.db.select().from(vehicles).where(eq(vehicles.userId, user.id));
    const vl = (id: string | null) => { const v = vs.find((x) => x.id === id); return v ? vehicleLabel(v) : null; };
    out.push({
      merchantId: m.id,
      shopName: m.name,
      slug: m.slug,
      window: w,
      days,
      sets: sets.map((s) => ({ id: s.id, rack: s.rack, season: s.season, label: s.label, treadMm: s.treadTenthsMm == null ? null : s.treadTenthsMm / 10, treadStatus: treadStatus(s.treadTenthsMm), vehicleLabel: vl(s.vehicleId) })),
      swaps: swaps.map((s) => ({ id: s.id, day: s.day, vehicleLabel: vl(s.vehicleId) })),
    });
  }
  return out;
}

export async function bookMySwap(ctx: AppContext, user: AuthUser, body: z.output<typeof autoApi.customerSwapBody>): Promise<{ id: string; day: string }> {
  const [r] = await ctx.db
    .select({ m: merchantsTable })
    .from(merchantMembers)
    .innerJoin(merchantsTable, eq(merchantsTable.id, merchantMembers.merchantId))
    .where(and(eq(merchantMembers.userId, user.id), eq(merchantMembers.merchantId, body.merchantId)))
    .limit(1);
  if (!r) throw notFound("Shop");
  if (!(await isFeatureOn(ctx.db, r.m, "auto.tires"))) throw notFound("Shop");
  const vehicleId = await checkVehicleOf(ctx, user.id, body.vehicleId);
  const row = await bookSwap(ctx, r.m, { userId: user.id, vehicleId, day: body.day, source: "customer", windowOnly: true });
  return { id: row.id, day: row.day };
}

export async function cancelMySwap(ctx: AppContext, user: AuthUser, id: string): Promise<{ ok: true }> {
  const [s] = await ctx.db.update(tireSwaps).set({ status: "cancelled" }).where(and(eq(tireSwaps.id, id), eq(tireSwaps.userId, user.id), eq(tireSwaps.status, "booked"))).returning({ id: tireSwaps.id });
  if (!s) throw notFound("Swap");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Pickup texts for stored sets
// ---------------------------------------------------------------------------
/** Job, hourly: at 10:00 shop time, text owners whose stored set is wanted in the next window, once per window, from the lead day on. */
export async function runTirePickupReminders(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const shops = await ctx.db.select({ m: merchantsTable }).from(autoSettings).innerJoin(merchantsTable, eq(merchantsTable.id, autoSettings.merchantId)).where(inArray(merchantsTable.status, ["onboarding", "active"]));
  let sent = 0;
  for (const { m } of shops) {
    const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: m.timezone, hour: "2-digit", hourCycle: "h23" }).format(now));
    if (hour !== 10) continue;
    if (!(await isFeatureOn(ctx.db, m, "auto.tires"))) continue;
    sent += await sendPickupTexts(ctx, m);
  }
  return sent;
}

export async function sendPickupTexts(ctx: AppContext, merchant: Merchant): Promise<number> {
  const st = await getSettingsRow(ctx, merchant.id);
  const ts = tireSettingsOf(st);
  const today = todayFor(ctx, merchant.timezone);
  const rows = await ctx.db
    .select({ s: tireSets, name: users.name, phone: users.phone, locale: users.locale, member: merchantMembers })
    .from(tireSets)
    .innerJoin(users, eq(users.id, tireSets.userId))
    .innerJoin(merchantMembers, and(eq(merchantMembers.userId, tireSets.userId), eq(merchantMembers.merchantId, merchant.id)))
    .where(and(eq(tireSets.merchantId, merchant.id), eq(tireSets.status, "stored")));
  let sent = 0;
  for (const r of rows) {
    const w = windowForSeason(today, ts, r.s.season);
    if (!w || today < pickupRemindOn(w.start, ts.pickupLeadDays) || today > w.end || r.s.pickupNudgedFor === w.start) continue;
    if (!r.member.marketingConsentAt || r.member.muted || !r.phone) continue;
    const tr = translator(normalizeLocale(r.locale) ?? "en");
    const seasonLabel = tr(`auto.season.${r.s.season}` as never);
    const url = `${ctx.config.publicWebUrl.replace(/\/$/, "")}/me/vehicles`;
    const body = tr("auto.msg.tirePickup", { shop: merchant.name, season: seasonLabel, rack: r.s.rack, url });
    const res = await sendShopText(ctx, merchant, { userId: r.s.userId, phone: r.phone }, body);
    if (res === "quiet" || res === "no_credits") break;
    if (res !== "sent") continue;
    await ctx.db.update(tireSets).set({ pickupNudgedFor: w.start }).where(eq(tireSets.id, r.s.id));
    sent++;
  }
  return sent;
}

export { DEFAULT_TZ };
