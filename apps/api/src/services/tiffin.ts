/**
 * Tiffin (meal subscriptions) for Desi restaurants and home kitchens.
 * Contract: @ll/shared tiffinApi. Routes: routes/tiffin. Jobs: jobs/tiffin.ts.
 *
 * Model in short:
 *  - A plan has a cadence (weekly | monthly), service days and a per-period price.
 *  - A subscription is billed one period at a time. Each period is one
 *    tiffin_charge (unique per subscription + period start). The period only
 *    advances when that charge is paid (webhook, ll_kind "tiffin").
 *  - Skips and pauses close `cutoffHours` before the meal day starts
 *    (TIFFIN_MEAL_HOUR, America/Toronto). A skip made before cutoff earns a
 *    credit on the next charge: food price x skipped days / service days in the period.
 *  - tiffin_deliveries are generated for tomorrow by the daily job (idempotent).
 */
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { merchants, notifications, tiffinCharges, tiffinDeliveries, tiffinMenus, tiffinPlans, tiffinRoutes, tiffinSkips, tiffinSubscriptions, users, type DbOrTx } from "@ll/db";
import { tiffinApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { platformFeeFor } from "./fees.js";
import { createConnectPayment, refundConnectPayment, retrieveConnectPayment } from "./payments.js";
import { decodeCursor, encodeCursor, money, notifyCustomer } from "./commerceShared.js";
import { enabledFeaturesFor, requireFeature } from "./features.js";
import { localDate } from "./messaging.js";
import { loadPrefs, sendNotification } from "./notifications.js";

type Merchant = typeof merchants.$inferSelect;
type Plan = typeof tiffinPlans.$inferSelect;
type Route = typeof tiffinRoutes.$inferSelect;
type Sub = typeof tiffinSubscriptions.$inferSelect;
type Charge = typeof tiffinCharges.$inferSelect;
type Delivery = typeof tiffinDeliveries.$inferSelect;
type MenuRow = typeof tiffinMenus.$inferSelect;
type User = typeof users.$inferSelect;

export const TZ = "America/Toronto";
/** The menu-for-tomorrow notification goes out from this local hour. */
export const MENU_NOTIFY_HOUR = 16;
const DAY_MS = 86_400_000;
const MAX_PAUSE_DAYS = 90;
const MIN_CHARGE_CENTS = 50;

// ---------------------------------------------------------------------------
// Dates (local calendar days as YYYY-MM-DD) and the cutoff clock
// ---------------------------------------------------------------------------
export const todayOf = (ctx: AppContext) => localDate(ctx.now(), TZ);
const parseYmd = (d: string) => new Date(`${d}T12:00:00Z`);
export const addDays = (d: string, n: number) => new Date(parseYmd(d).getTime() + n * DAY_MS).toISOString().slice(0, 10);
export const dowOf = (d: string) => parseYmd(d).getUTCDay();

export function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

function tzOffsetMs(at: Date, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The UTC instant for a local wall-clock time in America/Toronto. */
export function localInstant(ymd: string, hour: number): Date {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, hour);
  let t = guess - tzOffsetMs(new Date(guess), TZ);
  t = guess - tzOffsetMs(new Date(t), TZ);
  return new Date(t);
}

/** Last moment a skip or pause can still change this meal day. */
export const cutoffAt = (plan: Pick<Plan, "cutoffHours">, date: string): Date => new Date(localInstant(date, tiffinApi.TIFFIN_MEAL_HOUR).getTime() - plan.cutoffHours * 3_600_000);

/** First calendar day that can still be skipped or paused. */
export function earliestEligible(ctx: AppContext, plan: Pick<Plan, "cutoffHours">): string {
  let d = todayOf(ctx);
  for (let i = 0; i < 400; i++, d = addDays(d, 1)) if (ctx.now().getTime() <= cutoffAt(plan, d).getTime()) return d;
  return d;
}

const isServiceDay = (plan: Pick<Plan, "daysOfWeek">, sub: Pick<Sub, "startDate">, date: string) => date >= sub.startDate && plan.daysOfWeek.includes(dowOf(date));
const serviceDates = (plan: Pick<Plan, "daysOfWeek">, sub: Pick<Sub, "startDate">, from: string, to: string) => dateRange(from, to).filter((d) => isServiceDay(plan, sub, d));
export const periodEndFor = (cadence: string, start: string) => (cadence === "weekly" ? addDays(start, 6) : addDays(addMonths(start, 1), -1));

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
export const priceFor = (plan: Pick<Plan, "priceCents" | "extraServingCents" | "deliveryFeeCents">, servings: number, fulfilment: string) =>
  plan.priceCents + plan.extraServingCents * (servings - 1) + (fulfilment === "delivery" ? plan.deliveryFeeCents : 0);

/** The meal part of a period price (the delivery fee is never credited). */
export const foodCents = (sub: Pick<Sub, "priceCents" | "fulfilment">, plan: Pick<Plan, "deliveryFeeCents">) => Math.max(0, sub.priceCents - (sub.fulfilment === "delivery" ? plan.deliveryFeeCents : 0));

/** Credit for skipped meal days: per-meal price x skipped servings (the whole household), rounded once. */
export const creditFor = (food: number, skippedDays: number, serviceDays: number) => (serviceDays > 0 ? Math.min(food, Math.round((food * skippedDays) / serviceDays)) : 0);

/** Monthly recurring revenue for one subscription (weekly x 52/12). */
export const mrrOf = (cadence: string, priceCents: number) => (cadence === "weekly" ? Math.round((priceCents * 52) / 12) : priceCents);

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function planDto(p: Plan, subscriberCount?: number): tiffinApi.PlanDto {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    translations: p.translations,
    cadence: p.cadence as tiffinApi.TiffinCadence,
    daysOfWeek: p.daysOfWeek,
    mealsPerDay: p.mealsPerDay,
    priceCents: p.priceCents,
    extraServingCents: p.extraServingCents,
    maxServings: p.maxServings,
    dietary: p.dietary,
    deliveryFeeCents: p.deliveryFeeCents,
    pickupAllowed: p.pickupAllowed,
    deliveryAllowed: p.deliveryAllowed,
    cutoffHours: p.cutoffHours,
    active: p.active,
    sortOrder: p.sortOrder,
    ...(subscriberCount !== undefined ? { subscriberCount } : {}),
  };
}

export function chargeDto(c: Charge): tiffinApi.ChargeDto {
  return {
    id: c.id,
    periodStart: c.periodStart,
    periodEnd: c.periodEnd,
    amountCents: c.amountCents,
    creditCents: c.creditCents,
    platformFeeCents: c.platformFeeCents,
    status: c.status as tiffinApi.ChargeDto["status"],
    paidAt: iso(c.paidAt),
    createdAt: c.createdAt.toISOString(),
  };
}

export function subDto(s: Sub, plan: Plan, route: Pick<Route, "name"> | null): tiffinApi.SubscriptionDto {
  return {
    id: s.id,
    status: s.status as tiffinApi.TiffinSubStatus,
    plan: { id: plan.id, name: plan.name, cadence: plan.cadence as tiffinApi.TiffinCadence, daysOfWeek: plan.daysOfWeek, cutoffHours: plan.cutoffHours },
    servings: s.servings,
    fulfilment: s.fulfilment as tiffinApi.TiffinFulfilment,
    address: s.address,
    addressNotes: s.addressNotes,
    postalCode: s.postalCode,
    dietaryNotes: s.dietaryNotes,
    routeId: s.routeId,
    routeName: route?.name ?? null,
    stopOrder: s.stopOrder,
    startDate: s.startDate,
    pausedUntil: s.pausedUntil,
    currentPeriodStart: s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd,
    nextBillingDate: s.nextBillingDate,
    priceCents: s.priceCents,
    paymentMethod: s.paymentMethod as tiffinApi.TiffinPaymentMethod,
    cancelledAt: iso(s.cancelledAt),
    cancelReason: s.cancelReason,
    createdAt: s.createdAt.toISOString(),
  };
}

interface SubRow {
  sub: Sub;
  plan: Plan;
  route: Route | null;
}

async function loadSubRow(db: DbOrTx, subId: string): Promise<SubRow | null> {
  const [r] = await db
    .select({ sub: tiffinSubscriptions, plan: tiffinPlans, route: tiffinRoutes })
    .from(tiffinSubscriptions)
    .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
    .leftJoin(tiffinRoutes, eq(tiffinRoutes.id, tiffinSubscriptions.routeId))
    .where(eq(tiffinSubscriptions.id, subId))
    .limit(1);
  return r ?? null;
}

async function merchantSubRow(db: DbOrTx, merchantId: string, subId: string): Promise<SubRow> {
  const r = await loadSubRow(db, subId);
  if (!r || r.sub.merchantId !== merchantId) throw notFound("Subscription");
  return r;
}

async function mySubRow(db: DbOrTx, userId: string, subId: string): Promise<SubRow> {
  const r = await loadSubRow(db, subId);
  if (!r || r.sub.userId !== userId) throw notFound("Subscription");
  return r;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export async function listPlans(db: DbOrTx, merchantId: string): Promise<tiffinApi.PlansResponse> {
  const plans = await db.select().from(tiffinPlans).where(eq(tiffinPlans.merchantId, merchantId)).orderBy(asc(tiffinPlans.sortOrder), asc(tiffinPlans.createdAt));
  const counts = await db
    .select({ planId: tiffinSubscriptions.planId, n: sql<number>`count(*)::int` })
    .from(tiffinSubscriptions)
    .where(and(eq(tiffinSubscriptions.merchantId, merchantId), ne(tiffinSubscriptions.status, "cancelled")))
    .groupBy(tiffinSubscriptions.planId);
  const byPlan = new Map(counts.map((c) => [c.planId, Number(c.n)]));
  return { items: plans.map((p) => planDto(p, byPlan.get(p.id) ?? 0)) };
}

function checkPlanRules(p: Pick<Plan, "pickupAllowed" | "deliveryAllowed" | "daysOfWeek" | "maxServings">) {
  if (!p.pickupAllowed && !p.deliveryAllowed) throw badRequest("A plan needs delivery, pickup or both");
  if (new Set(p.daysOfWeek).size !== p.daysOfWeek.length) throw badRequest("Days of the week can't repeat");
}

export async function createPlan(db: DbOrTx, merchantId: string, body: z.output<typeof tiffinApi.createPlanBody>): Promise<tiffinApi.PlanDto> {
  checkPlanRules(body);
  const [p] = await db.insert(tiffinPlans).values({ ...body, daysOfWeek: [...body.daysOfWeek].sort(), merchantId }).returning();
  return planDto(p!, 0);
}

async function loadPlan(db: DbOrTx, merchantId: string, planId: string): Promise<Plan> {
  const [p] = await db.select().from(tiffinPlans).where(and(eq(tiffinPlans.id, planId), eq(tiffinPlans.merchantId, merchantId))).limit(1);
  if (!p) throw notFound("Plan");
  return p;
}

/** Price and day changes apply to new sign-ups; existing subscribers keep the price they signed up at. */
export async function updatePlan(db: DbOrTx, merchantId: string, planId: string, body: z.output<typeof tiffinApi.updatePlanBody>): Promise<tiffinApi.PlanDto> {
  const cur = await loadPlan(db, merchantId, planId);
  const next = { ...cur, ...body };
  checkPlanRules(next);
  const patch = { ...body, ...(body.daysOfWeek ? { daysOfWeek: [...body.daysOfWeek].sort() } : {}) };
  const [p] = await db.update(tiffinPlans).set(patch).where(eq(tiffinPlans.id, planId)).returning();
  return planDto(p!);
}

export async function deletePlan(db: DbOrTx, merchantId: string, planId: string): Promise<tiffinApi.DeletePlanResponse> {
  await loadPlan(db, merchantId, planId);
  const [used] = await db.select({ id: tiffinSubscriptions.id }).from(tiffinSubscriptions).where(eq(tiffinSubscriptions.planId, planId)).limit(1);
  if (used) {
    await db.update(tiffinPlans).set({ active: false }).where(eq(tiffinPlans.id, planId));
    return { deleted: false, archived: true };
  }
  await db.delete(tiffinPlans).where(eq(tiffinPlans.id, planId));
  return { deleted: true, archived: false };
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------
const menuDto = (m: MenuRow): tiffinApi.MenuDto => ({ id: m.id, planId: m.planId, date: m.date, items: m.items, notes: m.notes });

export async function putMenus(db: DbOrTx, merchantId: string, body: z.output<typeof tiffinApi.putMenusBody>): Promise<tiffinApi.MenusResponse> {
  const planIds = [...new Set(body.menus.map((m) => m.planId).filter((x): x is string => !!x))];
  if (planIds.length) {
    const found = await db.select({ id: tiffinPlans.id }).from(tiffinPlans).where(and(eq(tiffinPlans.merchantId, merchantId), inArray(tiffinPlans.id, planIds)));
    if (found.length !== planIds.length) throw notFound("Plan");
  }
  const out: MenuRow[] = [];
  for (const m of body.menus) {
    // The unique index treats NULL plan ids as distinct, so upsert by hand.
    const where = and(eq(tiffinMenus.merchantId, merchantId), eq(tiffinMenus.date, m.date), m.planId ? eq(tiffinMenus.planId, m.planId) : isNull(tiffinMenus.planId));
    const [cur] = await db.select().from(tiffinMenus).where(where).limit(1);
    if (cur) {
      const [u] = await db.update(tiffinMenus).set({ items: m.items, notes: m.notes ?? null }).where(eq(tiffinMenus.id, cur.id)).returning();
      out.push(u!);
    } else {
      const [i] = await db.insert(tiffinMenus).values({ merchantId, planId: m.planId, date: m.date, items: m.items, notes: m.notes ?? null }).returning();
      out.push(i!);
    }
  }
  return { items: out.map(menuDto) };
}

export async function listMenus(db: DbOrTx, merchantId: string, q: z.output<typeof tiffinApi.listMenusQuery>): Promise<tiffinApi.MenusResponse> {
  const conds = [eq(tiffinMenus.merchantId, merchantId)];
  if (q.from) conds.push(gte(tiffinMenus.date, q.from));
  if (q.to) conds.push(lte(tiffinMenus.date, q.to));
  if (q.planId) conds.push(or(eq(tiffinMenus.planId, q.planId), isNull(tiffinMenus.planId))!);
  const rows = await db.select().from(tiffinMenus).where(and(...conds)).orderBy(asc(tiffinMenus.date)).limit(400);
  return { items: rows.map(menuDto) };
}

export async function deleteMenu(db: DbOrTx, merchantId: string, menuId: string): Promise<{ deleted: true }> {
  const rows = await db.delete(tiffinMenus).where(and(eq(tiffinMenus.id, menuId), eq(tiffinMenus.merchantId, merchantId))).returning({ id: tiffinMenus.id });
  if (!rows.length) throw notFound("Menu");
  return { deleted: true };
}

/** The menu a plan serves on a date: its own, else the shop-wide one. */
function menuFor(menus: MenuRow[], planId: string, date: string): MenuRow | null {
  return menus.find((m) => m.date === date && m.planId === planId) ?? menus.find((m) => m.date === date && m.planId === null) ?? null;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const normalPostal = (p: string | null | undefined) => (p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The route whose postal prefix best (longest) matches; ties go to the lower sort order. */
export function matchRoute(routes: Pick<Route, "id" | "areas" | "sortOrder">[], postalCode: string | null | undefined): string | null {
  const postal = normalPostal(postalCode);
  if (!postal) return null;
  let best: { id: string; len: number; sort: number } | null = null;
  for (const r of routes) {
    for (const a of r.areas) {
      const area = normalPostal(a);
      if (area && postal.startsWith(area) && (!best || area.length > best.len || (area.length === best.len && r.sortOrder < best.sort))) best = { id: r.id, len: area.length, sort: r.sortOrder };
    }
  }
  return best?.id ?? null;
}

async function nextStop(db: DbOrTx, routeId: string): Promise<number> {
  const [r] = await db.select({ m: sql<number>`coalesce(max(${tiffinSubscriptions.stopOrder}), 0)::int` }).from(tiffinSubscriptions).where(eq(tiffinSubscriptions.routeId, routeId));
  return Number(r?.m ?? 0) + 1;
}

async function autoAssignRoute(db: DbOrTx, sub: Sub): Promise<Sub> {
  if (sub.fulfilment !== "delivery") return sub;
  const routes = await db.select().from(tiffinRoutes).where(eq(tiffinRoutes.merchantId, sub.merchantId));
  const routeId = matchRoute(routes, sub.postalCode);
  if (!routeId) return sub;
  const [u] = await db.update(tiffinSubscriptions).set({ routeId, stopOrder: await nextStop(db, routeId) }).where(eq(tiffinSubscriptions.id, sub.id)).returning();
  return u!;
}

const routeDto = (r: Route, stops: number): tiffinApi.RouteDto => ({ id: r.id, name: r.name, driverName: r.driverName, driverPhone: r.driverPhone, areas: r.areas, sortOrder: r.sortOrder, stops });

export async function listRoutes(db: DbOrTx, merchantId: string): Promise<tiffinApi.RoutesResponse> {
  const routes = await db.select().from(tiffinRoutes).where(eq(tiffinRoutes.merchantId, merchantId)).orderBy(asc(tiffinRoutes.sortOrder), asc(tiffinRoutes.createdAt));
  const counts = await db
    .select({ routeId: tiffinSubscriptions.routeId, n: sql<number>`count(*)::int` })
    .from(tiffinSubscriptions)
    .where(and(eq(tiffinSubscriptions.merchantId, merchantId), inArray(tiffinSubscriptions.status, ["active", "paused", "past_due", "pending"])))
    .groupBy(tiffinSubscriptions.routeId);
  const by = new Map(counts.map((c) => [c.routeId, Number(c.n)]));
  return { items: routes.map((r) => routeDto(r, by.get(r.id) ?? 0)) };
}

async function loadRoute(db: DbOrTx, merchantId: string, routeId: string): Promise<Route> {
  const [r] = await db.select().from(tiffinRoutes).where(and(eq(tiffinRoutes.id, routeId), eq(tiffinRoutes.merchantId, merchantId))).limit(1);
  if (!r) throw notFound("Route");
  return r;
}

export async function createRoute(db: DbOrTx, merchantId: string, body: z.output<typeof tiffinApi.createRouteBody>): Promise<tiffinApi.RouteDto> {
  const [r] = await db.insert(tiffinRoutes).values({ ...body, areas: [...new Set(body.areas)], merchantId }).returning();
  return routeDto(r!, 0);
}

export async function updateRoute(db: DbOrTx, merchantId: string, routeId: string, body: z.output<typeof tiffinApi.updateRouteBody>): Promise<tiffinApi.RouteDto> {
  await loadRoute(db, merchantId, routeId);
  const [r] = await db.update(tiffinRoutes).set({ ...body, ...(body.areas ? { areas: [...new Set(body.areas)] } : {}) }).where(eq(tiffinRoutes.id, routeId)).returning();
  return routeDto(r!, (await listRoutes(db, merchantId)).items.find((x) => x.id === routeId)?.stops ?? 0);
}

export async function deleteRoute(db: DbOrTx, merchantId: string, routeId: string): Promise<{ deleted: true; unassigned: number }> {
  await loadRoute(db, merchantId, routeId);
  const subs = await db.update(tiffinSubscriptions).set({ routeId: null, stopOrder: null }).where(eq(tiffinSubscriptions.routeId, routeId)).returning({ id: tiffinSubscriptions.id });
  await db.update(tiffinDeliveries).set({ routeId: null, stopOrder: null }).where(and(eq(tiffinDeliveries.routeId, routeId), eq(tiffinDeliveries.status, "scheduled")));
  await db.update(tiffinDeliveries).set({ routeId: null }).where(eq(tiffinDeliveries.routeId, routeId));
  await db.delete(tiffinRoutes).where(eq(tiffinRoutes.id, routeId));
  return { deleted: true, unassigned: subs.length };
}

export async function reorderStops(db: DbOrTx, merchantId: string, routeId: string, body: z.output<typeof tiffinApi.reorderStopsBody>): Promise<tiffinApi.RouteDto> {
  const route = await loadRoute(db, merchantId, routeId);
  const subs = await db.select({ id: tiffinSubscriptions.id }).from(tiffinSubscriptions).where(and(eq(tiffinSubscriptions.routeId, routeId), eq(tiffinSubscriptions.merchantId, merchantId)));
  const onRoute = new Set(subs.map((s) => s.id));
  for (const id of body.subscriptionIds) if (!onRoute.has(id)) throw badRequest("A subscriber in the list is not on this route", { subscriptionId: id });
  for (const [i, id] of body.subscriptionIds.entries()) await db.update(tiffinSubscriptions).set({ stopOrder: i + 1 }).where(eq(tiffinSubscriptions.id, id));
  // Subscribers left out of the list go after the ordered ones, in their current order.
  const rest = subs.filter((s) => !body.subscriptionIds.includes(s.id));
  for (const [i, s] of rest.entries()) await db.update(tiffinSubscriptions).set({ stopOrder: body.subscriptionIds.length + i + 1 }).where(eq(tiffinSubscriptions.id, s.id));
  return routeDto(route, subs.length);
}

/** Assign routes by postal prefix (new routes or changed areas). */
export async function autoAssignRoutes(db: DbOrTx, merchantId: string, body: z.output<typeof tiffinApi.assignRoutesBody>): Promise<{ assigned: number }> {
  const routes = await db.select().from(tiffinRoutes).where(eq(tiffinRoutes.merchantId, merchantId));
  const conds = [eq(tiffinSubscriptions.merchantId, merchantId), eq(tiffinSubscriptions.fulfilment, "delivery"), inArray(tiffinSubscriptions.status, ["active", "paused", "past_due", "pending"])];
  if (body.onlyUnassigned) conds.push(isNull(tiffinSubscriptions.routeId));
  const subs = await db.select().from(tiffinSubscriptions).where(and(...conds)).orderBy(asc(tiffinSubscriptions.createdAt));
  let assigned = 0;
  for (const s of subs) {
    const routeId = matchRoute(routes, s.postalCode);
    if (!routeId || routeId === s.routeId) continue;
    await db.update(tiffinSubscriptions).set({ routeId, stopOrder: await nextStop(db, routeId) }).where(eq(tiffinSubscriptions.id, s.id));
    assigned++;
  }
  return { assigned };
}

// ---------------------------------------------------------------------------
// Notifications (never throw)
// ---------------------------------------------------------------------------
async function notify(ctx: AppContext, userId: string, merchantId: string, type: "tiffin_update" | "tiffin_menu", title: string, body: string, data: Record<string, unknown>) {
  try {
    return await sendNotification(ctx, { userId, merchantId, type, title, body, data });
  } catch (err) {
    if (ctx.config.env !== "test") console.error("[tiffin notify]", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Skips, pauses, resume, cancel (shared by customer and merchant)
// ---------------------------------------------------------------------------
const cutoffError = (date: string, plan: Plan) =>
  new HttpError(409, "cutoff_passed", `${date} can no longer be changed: skips close ${plan.cutoffHours} hours before the meal day starts.`, { date, cutoffAt: cutoffAt(plan, date).toISOString() });

async function setDeliveriesSkipped(db: DbOrTx, subId: string, dates: string[]) {
  if (dates.length) await db.update(tiffinDeliveries).set({ status: "skipped" }).where(and(eq(tiffinDeliveries.subscriptionId, subId), inArray(tiffinDeliveries.date, dates), eq(tiffinDeliveries.status, "scheduled")));
}

async function ensureDelivery(db: DbOrTx, sub: Sub, date: string) {
  await db
    .insert(tiffinDeliveries)
    .values({ merchantId: sub.merchantId, subscriptionId: sub.id, routeId: sub.fulfilment === "delivery" ? sub.routeId : null, date, servings: sub.servings, stopOrder: sub.fulfilment === "delivery" ? sub.stopOrder : null })
    .onConflictDoNothing();
}

/** Skip meal days. enforce = customer rules (cutoff); merchants may skip on behalf past cutoff (no credit then). */
export async function skipDates(ctx: AppContext, row: SubRow, dates: string[], reason: string | undefined, enforce: boolean): Promise<{ skipped: string[]; creditCents: number }> {
  const { sub, plan } = row;
  if (sub.status !== "active") throw conflict(`A ${sub.status} subscription can't skip days`);
  const today = todayOf(ctx);
  const unique = [...new Set(dates)].sort();
  for (const d of unique) {
    if (d < today) throw badRequest(`${d} is in the past`);
    if (!isServiceDay(plan, sub, d)) throw badRequest(`${d} isn't a meal day on this plan`);
    if (enforce && ctx.now().getTime() > cutoffAt(plan, d).getTime()) throw cutoffError(d, plan);
  }
  const now = ctx.now();
  const inserted = await ctx.db
    .insert(tiffinSkips)
    .values(unique.map((date) => ({ subscriptionId: sub.id, date, reason: reason ?? null, createdAt: now })))
    .onConflictDoNothing()
    .returning({ date: tiffinSkips.date });
  await setDeliveriesSkipped(ctx.db, sub.id, unique);
  const before = unique.filter((d) => now.getTime() <= cutoffAt(plan, d).getTime()).length;
  const periodDays = sub.currentPeriodStart && sub.currentPeriodEnd ? serviceDates(plan, sub, sub.currentPeriodStart, sub.currentPeriodEnd).length : 0;
  return { skipped: inserted.map((i) => i.date).sort(), creditCents: creditFor(foodCents(sub, plan), before, periodDays) };
}

export async function unskipDate(ctx: AppContext, row: SubRow, date: string, enforce: boolean): Promise<void> {
  const { sub, plan } = row;
  if (sub.status !== "active") throw conflict(`A ${sub.status} subscription can't change skips`);
  if (enforce && ctx.now().getTime() > cutoffAt(plan, date).getTime()) throw cutoffError(date, plan);
  const gone = await ctx.db.delete(tiffinSkips).where(and(eq(tiffinSkips.subscriptionId, sub.id), eq(tiffinSkips.date, date))).returning({ date: tiffinSkips.date });
  if (!gone.length) throw notFound("Skip");
  await ctx.db.update(tiffinDeliveries).set({ status: "scheduled" }).where(and(eq(tiffinDeliveries.subscriptionId, sub.id), eq(tiffinDeliveries.date, date), eq(tiffinDeliveries.status, "skipped")));
}

/**
 * Pause from the first day still before cutoff until `until` (the day meals come back).
 * The paused days are written as skips (reason "pause") so credits work the same way.
 */
export async function pauseSubscription(ctx: AppContext, row: SubRow, body: z.output<typeof tiffinApi.pauseBody>, enforce: boolean): Promise<{ pausedFrom: string; resumesOn: string; skipped: string[] }> {
  const { sub, plan } = row;
  if (sub.status !== "active" && sub.status !== "paused") throw conflict(`A ${sub.status} subscription can't be paused`);
  const today = todayOf(ctx);
  const earliest = enforce ? earliestEligible(ctx, plan) : addDays(today, 1);
  const from = body.from ?? earliest;
  if (from < today) throw badRequest("The first paused day is in the past");
  if (enforce && ctx.now().getTime() > cutoffAt(plan, from).getTime()) throw cutoffError(from, plan);
  if (body.until <= from) throw badRequest("Choose a resume date after the first paused day", { from, until: body.until });
  if (parseYmd(body.until).getTime() - parseYmd(from).getTime() > MAX_PAUSE_DAYS * DAY_MS) throw badRequest(`A pause can be at most ${MAX_PAUSE_DAYS} days`);
  const dates = serviceDates(plan, sub, from, addDays(body.until, -1));
  const now = ctx.now();
  if (dates.length) await ctx.db.insert(tiffinSkips).values(dates.map((date) => ({ subscriptionId: sub.id, date, reason: "pause", createdAt: now }))).onConflictDoNothing();
  await setDeliveriesSkipped(ctx.db, sub.id, dates);
  // Meal days before the pause starts (already inside cutoff) still go out: keep their rows
  // because paused subscriptions are not picked up by the daily generator.
  for (const d of serviceDates(plan, sub, today, addDays(from, -1))) if (!(await hasSkip(ctx.db, sub.id, d))) await ensureDelivery(ctx.db, sub, d);
  await ctx.db.update(tiffinSubscriptions).set({ status: "paused", pausedUntil: body.until, updatedAt: now }).where(eq(tiffinSubscriptions.id, sub.id));
  return { pausedFrom: from, resumesOn: body.until, skipped: dates };
}

async function hasSkip(db: DbOrTx, subId: string, date: string) {
  const [r] = await db.select({ d: tiffinSkips.date }).from(tiffinSkips).where(and(eq(tiffinSkips.subscriptionId, subId), eq(tiffinSkips.date, date))).limit(1);
  return !!r;
}

/** Resume early: pause skips from the first changeable day onward are removed. */
export async function resumeSubscription(ctx: AppContext, row: SubRow, enforce: boolean): Promise<{ resumedFrom: string }> {
  const { sub, plan } = row;
  if (sub.status !== "paused") throw conflict("This subscription isn't paused");
  const from = enforce ? earliestEligible(ctx, plan) : addDays(todayOf(ctx), 1);
  const removed = await ctx.db
    .delete(tiffinSkips)
    .where(and(eq(tiffinSkips.subscriptionId, sub.id), eq(tiffinSkips.reason, "pause"), gte(tiffinSkips.date, from)))
    .returning({ date: tiffinSkips.date });
  if (removed.length) await ctx.db.update(tiffinDeliveries).set({ status: "scheduled" }).where(and(eq(tiffinDeliveries.subscriptionId, sub.id), inArray(tiffinDeliveries.date, removed.map((r) => r.date)), eq(tiffinDeliveries.status, "skipped")));
  await ctx.db.update(tiffinSubscriptions).set({ status: "active", pausedUntil: null, updatedAt: ctx.now() }).where(eq(tiffinSubscriptions.id, sub.id));
  return { resumedFrom: from };
}

export async function cancelSubscription(ctx: AppContext, row: SubRow, reason: string | undefined): Promise<void> {
  const { sub } = row;
  if (sub.status === "cancelled") throw conflict("Already cancelled");
  const now = ctx.now();
  await ctx.db.update(tiffinSubscriptions).set({ status: "cancelled", cancelledAt: now, cancelReason: reason ?? null, pausedUntil: null, updatedAt: now }).where(eq(tiffinSubscriptions.id, sub.id));
  await ctx.db.update(tiffinDeliveries).set({ status: "skipped" }).where(and(eq(tiffinDeliveries.subscriptionId, sub.id), gte(tiffinDeliveries.date, todayOf(ctx)), eq(tiffinDeliveries.status, "scheduled")));
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------
function paymentRef(pi: { id: string; clientSecret: string; amountCents: number }, sub: Pick<Sub, "paymentMethod">): tiffinApi.PaymentIntentRef {
  return { paymentIntentId: pi.id, clientSecret: pi.clientSecret, amountCents: pi.amountCents, methods: sub.paymentMethod === "pad" ? ["acss_debit"] : ["card"] };
}

/** Credit owed on a charge: skips made before cutoff for meal days in the period that just ended. */
async function creditForPeriod(db: DbOrTx, sub: Sub, plan: Plan, prevStart: string, prevEnd: string): Promise<number> {
  const rows = await db
    .select({ date: tiffinSkips.date, createdAt: tiffinSkips.createdAt })
    .from(tiffinSkips)
    .where(and(eq(tiffinSkips.subscriptionId, sub.id), gte(tiffinSkips.date, prevStart), lte(tiffinSkips.date, prevEnd)));
  const days = serviceDates(plan, sub, prevStart, prevEnd);
  const earned = rows.filter((r) => days.includes(r.date) && r.createdAt.getTime() <= cutoffAt(plan, r.date).getTime()).length;
  return creditFor(foodCents(sub, plan), earned, days.length);
}

/** Create (or find) the charge for a period. Never creates a second one for the same period start. */
async function ensureCharge(ctx: AppContext, sub: Sub, plan: Plan, periodStart: string, first: boolean): Promise<{ charge: Charge; created: boolean }> {
  const [existing] = await ctx.db.select().from(tiffinCharges).where(and(eq(tiffinCharges.subscriptionId, sub.id), eq(tiffinCharges.periodStart, periodStart))).limit(1);
  if (existing) return { charge: existing, created: false };
  const credit = !first && sub.currentPeriodStart && sub.currentPeriodEnd ? await creditForPeriod(ctx.db, sub, plan, sub.currentPeriodStart, sub.currentPeriodEnd) : 0;
  const amount = Math.max(0, sub.priceCents - credit);
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, sub.merchantId)).limit(1);
  const [c] = await ctx.db
    .insert(tiffinCharges)
    .values({
      merchantId: sub.merchantId,
      subscriptionId: sub.id,
      periodStart,
      periodEnd: periodEndFor(plan.cadence, periodStart),
      amountCents: amount,
      creditCents: credit,
      platformFeeCents: merchant ? platformFeeFor("tiffin", amount, merchant) : 0,
      createdAt: ctx.now(),
    })
    .onConflictDoNothing()
    .returning();
  if (c) return { charge: c, created: true };
  const [again] = await ctx.db.select().from(tiffinCharges).where(and(eq(tiffinCharges.subscriptionId, sub.id), eq(tiffinCharges.periodStart, periodStart))).limit(1);
  return { charge: again!, created: false };
}

/**
 * Start collecting a charge: a PaymentIntent on the merchant's Connect account
 * with the tiffin platform fee. Amounts under 50 cents (a fully credited
 * period) are settled without a payment. PAD goes through as the payment method type.
 */
async function startPayment(ctx: AppContext, merchant: Merchant, sub: Sub, charge: Charge, attempt = 0): Promise<tiffinApi.PaymentIntentRef | null> {
  if (charge.status === "paid") return null;
  if (charge.amountCents < MIN_CHARGE_CENTS) {
    await settleCharge(ctx, charge.id, null);
    return null;
  }
  if (!merchant.stripeAccountId) throw conflict("This kitchen can't take payments yet");
  const pi = await createConnectPayment(ctx, merchant, {
    amountCents: charge.amountCents,
    connectedAccountId: merchant.stripeAccountId,
    applicationFeeCents: charge.platformFeeCents,
    description: `${merchant.name} tiffin ${charge.periodStart} to ${charge.periodEnd}`,
    metadata: { ll_kind: "tiffin", ll_id: charge.id, merchant_id: merchant.id, subscription_id: sub.id },
    idempotencyKey: `tiffin:${charge.id}:pi${attempt ? `:${attempt}` : ""}`,
    ...(sub.paymentMethod === "pad" ? { paymentMethodTypes: ["acss_debit"] } : {}),
  });
  await ctx.db.update(tiffinCharges).set({ stripePaymentIntentId: pi.id, status: "pending" }).where(eq(tiffinCharges.id, charge.id));
  return paymentRef(pi, sub);
}

/** Mark a charge paid and move the subscription into that period. Idempotent. */
async function settleCharge(ctx: AppContext, chargeId: string, paymentIntentId: string | null): Promise<void> {
  const [charge] = await ctx.db.select().from(tiffinCharges).where(eq(tiffinCharges.id, chargeId)).limit(1);
  if (!charge || charge.status === "paid" || charge.status === "refunded") return;
  const [sub] = await ctx.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, charge.subscriptionId)).limit(1);
  const now = ctx.now();
  await ctx.db.update(tiffinCharges).set({ status: "paid", paidAt: now, ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}) }).where(eq(tiffinCharges.id, chargeId));
  if (!sub) return;
  if (sub.status === "cancelled") {
    // Paid after cancelling (payment raced the cancel): refund it.
    if (paymentIntentId) {
      const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, charge.merchantId)).limit(1);
      if (m) await refundConnectPayment(ctx, m, { paymentIntentId, idempotencyKey: `tiffin:${charge.id}:refund`, reason: "Subscription was cancelled" });
      await ctx.db.update(tiffinCharges).set({ status: "refunded" }).where(eq(tiffinCharges.id, chargeId));
    }
    return;
  }
  const advance = !sub.currentPeriodStart || charge.periodStart >= sub.currentPeriodStart;
  await ctx.db
    .update(tiffinSubscriptions)
    .set({
      ...(sub.status === "pending" || sub.status === "past_due" ? { status: "active" } : {}),
      ...(advance ? { currentPeriodStart: charge.periodStart, currentPeriodEnd: charge.periodEnd, nextBillingDate: addDays(charge.periodEnd, 1) } : {}),
      updatedAt: now,
    })
    .where(eq(tiffinSubscriptions.id, sub.id));
}

/** Webhook entry (payment_intent.* with ll_kind "tiffin"). */
export async function onTiffinPayment(ctx: AppContext, chargeId: string, paymentIntentId: string, outcome: "succeeded" | "failed"): Promise<void> {
  const [charge] = await ctx.db.select().from(tiffinCharges).where(eq(tiffinCharges.id, chargeId)).limit(1);
  if (!charge) return;
  if (outcome === "succeeded") return settleCharge(ctx, chargeId, paymentIntentId);
  if (charge.status === "paid" || charge.status === "refunded") return;
  if (charge.stripePaymentIntentId && charge.stripePaymentIntentId !== paymentIntentId) return; // an older attempt
  await ctx.db.update(tiffinCharges).set({ status: "failed" }).where(eq(tiffinCharges.id, chargeId));
  const row = await loadSubRow(ctx.db, charge.subscriptionId);
  if (!row || row.sub.status === "cancelled") return;
  if (row.sub.status === "active") await ctx.db.update(tiffinSubscriptions).set({ status: "past_due", updatedAt: ctx.now() }).where(eq(tiffinSubscriptions.id, row.sub.id));
  const [merchant] = await ctx.db.select({ name: merchants.name }).from(merchants).where(eq(merchants.id, row.sub.merchantId)).limit(1);
  await notify(ctx, row.sub.userId, row.sub.merchantId, "tiffin_update", "Your tiffin payment didn't go through", `${merchant?.name ?? "Your kitchen"} couldn't collect ${money(charge.amountCents)} for ${row.plan.name}. Update your payment to keep your meals coming.`, {
    subscriptionId: row.sub.id,
    chargeId,
    event: "payment_failed",
  });
}

/** Customer retries a failed or unpaid charge (past due, or a first payment that bounced). */
export async function retryPayment(ctx: AppContext, userId: string, subId: string): Promise<tiffinApi.RetryPaymentResponse> {
  const row = await mySubRow(ctx.db, userId, subId);
  if (row.sub.status !== "past_due" && row.sub.status !== "pending" && row.sub.status !== "active") throw conflict(`A ${row.sub.status} subscription has nothing to pay`);
  const [charge] = await ctx.db.select().from(tiffinCharges).where(and(eq(tiffinCharges.subscriptionId, subId), inArray(tiffinCharges.status, ["failed", "pending"]))).orderBy(desc(tiffinCharges.periodStart)).limit(1);
  if (!charge) throw conflict("Nothing is due");
  const merchant = (await ctx.db.select().from(merchants).where(eq(merchants.id, row.sub.merchantId)).limit(1))[0]!;
  // A pending charge that already has an intent is reused; a failed one gets a fresh attempt.
  let payment: tiffinApi.PaymentIntentRef | null;
  if (charge.status === "pending" && charge.stripePaymentIntentId) {
    const pi = await retrieveConnectPayment(ctx, merchant, charge.stripePaymentIntentId);
    payment = paymentRef(pi, row.sub);
  } else {
    payment = await startPayment(ctx, merchant, row.sub, charge, ctx.now().getTime());
  }
  const [fresh] = await ctx.db.select().from(tiffinCharges).where(eq(tiffinCharges.id, charge.id)).limit(1);
  return { charge: chargeDto(fresh!), payment };
}

/** Billing roll: charge each subscription whose next period starts today or earlier. Idempotent. */
export async function rollBilling(ctx: AppContext): Promise<{ charged: number; settled: number; errors: number }> {
  const today = todayOf(ctx);
  const rows = await ctx.db
    .select({ sub: tiffinSubscriptions, plan: tiffinPlans, merchant: merchants })
    .from(tiffinSubscriptions)
    .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
    .innerJoin(merchants, eq(merchants.id, tiffinSubscriptions.merchantId))
    .where(and(inArray(tiffinSubscriptions.status, ["active", "paused"]), lte(tiffinSubscriptions.nextBillingDate, today)));
  let charged = 0;
  let settled = 0;
  let errors = 0;
  for (const { sub, plan, merchant } of rows) {
    try {
      const { charge, created } = await ensureCharge(ctx, sub, plan, sub.nextBillingDate!, false);
      if (charge.status === "paid" || charge.status === "refunded") continue;
      if (charge.stripePaymentIntentId || charge.status === "failed") continue; // already out for payment
      const ref = await startPayment(ctx, merchant, sub, charge);
      if (!ref) {
        settled++;
        continue;
      }
      charged++;
      if (created || !charge.stripePaymentIntentId) {
        await notify(ctx, sub.userId, sub.merchantId, "tiffin_update", "Your tiffin renewal is ready", `${money(charge.amountCents)} for ${plan.name} from ${charge.periodStart}${charge.creditCents ? `, after ${money(charge.creditCents)} credit for skipped days` : ""}.`, {
          subscriptionId: sub.id,
          chargeId: charge.id,
          event: "renewal_due",
        });
      }
    } catch (err) {
      errors++;
      if (ctx.config.env !== "test") console.error("[tiffin roll]", sub.id, err);
    }
  }
  return { charged, settled, errors };
}

/** Paused subscriptions whose resume date has arrived go back to active. */
export async function autoResume(ctx: AppContext): Promise<number> {
  const rows = await ctx.db
    .update(tiffinSubscriptions)
    .set({ status: "active", pausedUntil: null, updatedAt: ctx.now() })
    .where(and(eq(tiffinSubscriptions.status, "paused"), lte(tiffinSubscriptions.pausedUntil, todayOf(ctx))))
    .returning({ id: tiffinSubscriptions.id });
  return rows.length;
}

// ---------------------------------------------------------------------------
// Delivery generation
// ---------------------------------------------------------------------------
/** Create the day's deliveries for active subscriptions (never for skipped, paused, past-due or pending). Idempotent. */
export async function generateDeliveries(ctx: AppContext, date: string, opts: { merchantId?: string } = {}): Promise<{ created: number }> {
  const conds = [eq(tiffinSubscriptions.status, "active"), lte(tiffinSubscriptions.startDate, date)];
  if (opts.merchantId) conds.push(eq(tiffinSubscriptions.merchantId, opts.merchantId));
  const rows = await ctx.db
    .select({ sub: tiffinSubscriptions, plan: tiffinPlans, merchant: merchants })
    .from(tiffinSubscriptions)
    .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
    .innerJoin(merchants, eq(merchants.id, tiffinSubscriptions.merchantId))
    .where(and(...conds));
  const dow = dowOf(date);
  let candidates = rows.filter((r) => r.plan.daysOfWeek.includes(dow));
  if (!opts.merchantId && candidates.length) {
    const ms = [...new Map(candidates.map((r) => [r.merchant.id, r.merchant])).values()];
    const on = await enabledFeaturesFor(ctx.db, ms, ["restaurant.tiffin"]);
    candidates = candidates.filter((r) => on.get(r.merchant.id)?.has("restaurant.tiffin"));
  }
  if (!candidates.length) return { created: 0 };
  const skips = await ctx.db.select({ id: tiffinSkips.subscriptionId }).from(tiffinSkips).where(and(eq(tiffinSkips.date, date), inArray(tiffinSkips.subscriptionId, candidates.map((c) => c.sub.id))));
  const skipped = new Set(skips.map((s) => s.id));
  const values = candidates
    .filter((c) => !skipped.has(c.sub.id))
    .map(({ sub }) => ({
      merchantId: sub.merchantId,
      subscriptionId: sub.id,
      routeId: sub.fulfilment === "delivery" ? sub.routeId : null,
      date,
      servings: sub.servings,
      stopOrder: sub.fulfilment === "delivery" ? sub.stopOrder : null,
      createdAt: ctx.now(),
    }));
  if (!values.length) return { created: 0 };
  const made = await ctx.db.insert(tiffinDeliveries).values(values).onConflictDoNothing().returning({ id: tiffinDeliveries.id });
  return { created: made.length };
}

/** "Tomorrow's menu" for customers who opted in (tiffin_menu), once per meal day, from MENU_NOTIFY_HOUR local. */
export async function sendMenuNotifications(ctx: AppContext, date: string): Promise<number> {
  const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(ctx.now()));
  if (hour < MENU_NOTIFY_HOUR) return 0;
  const rows = await ctx.db
    .select({ d: tiffinDeliveries, sub: tiffinSubscriptions, plan: tiffinPlans, merchant: merchants })
    .from(tiffinDeliveries)
    .innerJoin(tiffinSubscriptions, eq(tiffinSubscriptions.id, tiffinDeliveries.subscriptionId))
    .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
    .innerJoin(merchants, eq(merchants.id, tiffinDeliveries.merchantId))
    .where(and(eq(tiffinDeliveries.date, date), eq(tiffinDeliveries.status, "scheduled")));
  if (!rows.length) return 0;
  const menus = await ctx.db.select().from(tiffinMenus).where(and(inArray(tiffinMenus.merchantId, [...new Set(rows.map((r) => r.merchant.id))]), eq(tiffinMenus.date, date)));
  let sent = 0;
  for (const { sub, plan, merchant } of rows) {
    const menu = menuFor(menus.filter((m) => m.merchantId === merchant.id), plan.id, date);
    if (!menu || !menu.items.length) continue;
    const prefs = (await loadPrefs(ctx, sub.userId)).tiffin_menu;
    if (!prefs.push && !prefs.sms && !prefs.email) continue; // opt-in only
    const [dupe] = await ctx.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, sub.userId), eq(notifications.type, "tiffin_menu"), sql`${notifications.data}->>'subscriptionId' = ${sub.id}`, sql`${notifications.data}->>'date' = ${date}`))
      .limit(1);
    if (dupe) continue;
    const names = menu.items.map((i) => i.name).join(", ");
    const r = await notify(ctx, sub.userId, merchant.id, "tiffin_menu", `Tomorrow at ${merchant.name}`, `${plan.name}: ${names}.`, { subscriptionId: sub.id, date, event: "menu" });
    if (r?.notificationId) sent++;
  }
  return sent;
}

/** The whole daily pass: resume paused, roll billing, generate tomorrow, send menus. Safe to run any number of times. */
export async function runDaily(ctx: AppContext): Promise<{ resumed: number; billing: Awaited<ReturnType<typeof rollBilling>>; deliveries: number; menus: number }> {
  const resumed = await autoResume(ctx);
  const billing = await rollBilling(ctx);
  const tomorrow = addDays(todayOf(ctx), 1);
  const { created } = await generateDeliveries(ctx, tomorrow);
  const menus = await sendMenuNotifications(ctx, tomorrow);
  return { resumed, billing, deliveries: created, menus };
}

// ---------------------------------------------------------------------------
// Merchant: subscribers
// ---------------------------------------------------------------------------
function subscriberDto(r: { sub: Sub; plan: Plan; route: Route | null; user: Pick<User, "id" | "name" | "phone" | "email"> }): tiffinApi.SubscriberDto {
  return { ...subDto(r.sub, r.plan, r.route), customer: { id: r.user.id, name: r.user.name, phone: r.user.phone, email: r.user.email } };
}

export async function listSubscribers(db: DbOrTx, merchantId: string, q: z.output<typeof tiffinApi.listSubscribersQuery>): Promise<tiffinApi.SubscribersResponse> {
  const conds = [eq(tiffinSubscriptions.merchantId, merchantId)];
  if (q.status) {
    const st = q.status.split(",").map((s) => s.trim());
    for (const s of st) if (!(tiffinApi.TIFFIN_SUB_STATUSES as readonly string[]).includes(s)) throw badRequest(`Unknown status "${s}"`);
    conds.push(inArray(tiffinSubscriptions.status, st));
  }
  if (q.planId) conds.push(eq(tiffinSubscriptions.planId, q.planId));
  if (q.routeId) conds.push(eq(tiffinSubscriptions.routeId, q.routeId));
  if (q.unrouted === "true") conds.push(isNull(tiffinSubscriptions.routeId), eq(tiffinSubscriptions.fulfilment, "delivery"));
  if (q.fulfilment) conds.push(eq(tiffinSubscriptions.fulfilment, q.fulfilment));
  if (q.q) {
    const like = `%${q.q.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(or(sql`${users.name} ilike ${like}`, sql`${users.phone} ilike ${like}`, sql`${users.email} ilike ${like}`, sql`${tiffinSubscriptions.address} ilike ${like}`, sql`${tiffinSubscriptions.postalCode} ilike ${like}`)!);
  }
  const cur = decodeCursor(q.cursor);
  if (cur) conds.push(or(lt(tiffinSubscriptions.createdAt, cur.createdAt), and(eq(tiffinSubscriptions.createdAt, cur.createdAt), lt(tiffinSubscriptions.id, cur.id)))!);
  const rows = await db
    .select({ sub: tiffinSubscriptions, plan: tiffinPlans, route: tiffinRoutes, user: { id: users.id, name: users.name, phone: users.phone, email: users.email } })
    .from(tiffinSubscriptions)
    .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
    .innerJoin(users, eq(users.id, tiffinSubscriptions.userId))
    .leftJoin(tiffinRoutes, eq(tiffinRoutes.id, tiffinSubscriptions.routeId))
    .where(and(...conds))
    .orderBy(desc(tiffinSubscriptions.createdAt), desc(tiffinSubscriptions.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  return { items: page.map(subscriberDto), nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!.sub) : null };
}

async function subscriberById(db: DbOrTx, merchantId: string, subId: string): Promise<tiffinApi.SubscriberDto> {
  const [r] = await db
    .select({ sub: tiffinSubscriptions, plan: tiffinPlans, route: tiffinRoutes, user: { id: users.id, name: users.name, phone: users.phone, email: users.email } })
    .from(tiffinSubscriptions)
    .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
    .innerJoin(users, eq(users.id, tiffinSubscriptions.userId))
    .leftJoin(tiffinRoutes, eq(tiffinRoutes.id, tiffinSubscriptions.routeId))
    .where(and(eq(tiffinSubscriptions.id, subId), eq(tiffinSubscriptions.merchantId, merchantId)))
    .limit(1);
  if (!r) throw notFound("Subscription");
  return subscriberDto(r);
}

export const getSubscriber = subscriberById;

export async function updateSubscriber(db: DbOrTx, merchantId: string, subId: string, body: z.output<typeof tiffinApi.updateSubscriberBody>): Promise<tiffinApi.SubscriberDto> {
  const row = await merchantSubRow(db, merchantId, subId);
  const patch: Partial<typeof tiffinSubscriptions.$inferInsert> = { updatedAt: new Date() };
  if (body.addressNotes !== undefined) patch.addressNotes = body.addressNotes;
  if (body.routeId !== undefined) {
    if (body.routeId) {
      await loadRoute(db, merchantId, body.routeId);
      patch.routeId = body.routeId;
      patch.stopOrder = body.stopOrder ?? (body.routeId === row.sub.routeId ? row.sub.stopOrder : await nextStop(db, body.routeId));
    } else {
      patch.routeId = null;
      patch.stopOrder = null;
    }
  } else if (body.stopOrder !== undefined) patch.stopOrder = body.stopOrder;
  await db.update(tiffinSubscriptions).set(patch).where(eq(tiffinSubscriptions.id, subId));
  return subscriberById(db, merchantId, subId);
}

export async function merchantPause(ctx: AppContext, merchantId: string, subId: string, body: z.output<typeof tiffinApi.pauseBody>) {
  const row = await merchantSubRow(ctx.db, merchantId, subId);
  const r = await pauseSubscription(ctx, row, body, false);
  return { subscriber: await subscriberById(ctx.db, merchantId, subId), ...r };
}

export async function merchantResume(ctx: AppContext, merchantId: string, subId: string) {
  const row = await merchantSubRow(ctx.db, merchantId, subId);
  const r = await resumeSubscription(ctx, row, false);
  return { subscriber: await subscriberById(ctx.db, merchantId, subId), ...r };
}

export async function merchantCancel(ctx: AppContext, merchantId: string, subId: string, body: z.output<typeof tiffinApi.cancelBody>) {
  const row = await merchantSubRow(ctx.db, merchantId, subId);
  await cancelSubscription(ctx, row, body.reason ?? "Cancelled by the kitchen");
  return subscriberById(ctx.db, merchantId, subId);
}

export async function merchantSkip(ctx: AppContext, merchantId: string, subId: string, body: z.output<typeof tiffinApi.skipBody>) {
  const row = await merchantSubRow(ctx.db, merchantId, subId);
  const r = await skipDates(ctx, row, body.dates, body.reason, false);
  return { subscriber: await subscriberById(ctx.db, merchantId, subId), ...r };
}

// ---------------------------------------------------------------------------
// Merchant: kitchen count, manifest, delivery status
// ---------------------------------------------------------------------------
/** Servings to cook on a date, per plan, after skips and pauses. Uses the day's delivery rows once they exist, otherwise the same rules the generator uses. */
export async function kitchen(ctx: AppContext, merchantId: string, date: string): Promise<tiffinApi.KitchenResponse> {
  const subs = await ctx.db
    .select({ sub: tiffinSubscriptions, plan: tiffinPlans, user: { name: users.name } })
    .from(tiffinSubscriptions)
    .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
    .innerJoin(users, eq(users.id, tiffinSubscriptions.userId))
    .where(and(eq(tiffinSubscriptions.merchantId, merchantId), inArray(tiffinSubscriptions.status, ["active", "paused", "cancelled"]), lte(tiffinSubscriptions.startDate, date)));
  const dow = dowOf(date);
  const day = subs.filter((s) => s.plan.daysOfWeek.includes(dow));
  const ids = day.map((s) => s.sub.id);
  const [dels, skips, menus, plans] = await Promise.all([
    ids.length ? ctx.db.select().from(tiffinDeliveries).where(and(eq(tiffinDeliveries.date, date), inArray(tiffinDeliveries.subscriptionId, ids))) : Promise.resolve([] as Delivery[]),
    ids.length ? ctx.db.select({ id: tiffinSkips.subscriptionId }).from(tiffinSkips).where(and(eq(tiffinSkips.date, date), inArray(tiffinSkips.subscriptionId, ids))) : Promise.resolve([]),
    ctx.db.select().from(tiffinMenus).where(and(eq(tiffinMenus.merchantId, merchantId), eq(tiffinMenus.date, date))),
    ctx.db.select().from(tiffinPlans).where(eq(tiffinPlans.merchantId, merchantId)).orderBy(asc(tiffinPlans.sortOrder), asc(tiffinPlans.createdAt)),
  ]);
  const delBy = new Map(dels.map((d) => [d.subscriptionId, d]));
  const skipSet = new Set(skips.map((s) => s.id));
  const today = todayOf(ctx);
  const rows = new Map<string, tiffinApi.KitchenPlanRow>();
  const rowFor = (p: Plan) => {
    let r = rows.get(p.id);
    if (!r) {
      const m = menuFor(menus, p.id, date);
      r = { planId: p.id, planName: p.name, servings: 0, subscribers: 0, deliveryServings: 0, pickupServings: 0, skippedServings: 0, menu: m?.items ?? [], menuNotes: m?.notes ?? null, dietaryNotes: [] };
      rows.set(p.id, r);
    }
    return r;
  };
  for (const { sub, plan, user } of day) {
    const d = delBy.get(sub.id);
    let cooking: boolean;
    let skipped = false;
    if (d) {
      cooking = d.status !== "skipped";
      skipped = !cooking && sub.status !== "cancelled";
    } else if (date < today || sub.status === "cancelled") {
      continue; // nothing was made for them
    } else {
      cooking = sub.status === "active" && !skipSet.has(sub.id);
      skipped = !cooking;
    }
    if (!cooking && !skipped) continue;
    const r = rowFor(plan);
    if (cooking) {
      r.servings += sub.servings;
      r.subscribers += 1;
      if (sub.fulfilment === "delivery") r.deliveryServings += sub.servings;
      else r.pickupServings += sub.servings;
      if (sub.dietaryNotes) r.dietaryNotes.push({ subscriptionId: sub.id, customer: user.name, servings: sub.servings, note: sub.dietaryNotes });
    } else r.skippedServings += sub.servings;
  }
  for (const p of plans) if (p.active && !rows.has(p.id)) rowFor(p);
  const list = plans.map((p) => rows.get(p.id)).filter((r): r is tiffinApi.KitchenPlanRow => !!r && (r.servings > 0 || r.skippedServings > 0 || plans.find((p) => p.id === r.planId)?.active === true));
  const sum = (k: "servings" | "subscribers" | "deliveryServings" | "pickupServings" | "skippedServings") => list.reduce((a, r) => a + r[k], 0);
  return { date, plans: list, totals: { servings: sum("servings"), subscribers: sum("subscribers"), deliveryServings: sum("deliveryServings"), pickupServings: sum("pickupServings"), skippedServings: sum("skippedServings") } };
}

export async function manifest(ctx: AppContext, merchantId: string, date: string, routeId?: string): Promise<tiffinApi.ManifestResponse> {
  if (date >= todayOf(ctx)) await generateDeliveries(ctx, date, { merchantId });
  const conds = [eq(tiffinDeliveries.merchantId, merchantId), eq(tiffinDeliveries.date, date), ne(tiffinDeliveries.status, "skipped")];
  const rows = await ctx.db
    .select({ d: tiffinDeliveries, sub: tiffinSubscriptions, plan: tiffinPlans, user: { name: users.name, phone: users.phone } })
    .from(tiffinDeliveries)
    .innerJoin(tiffinSubscriptions, eq(tiffinSubscriptions.id, tiffinDeliveries.subscriptionId))
    .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
    .innerJoin(users, eq(users.id, tiffinSubscriptions.userId))
    .where(and(...conds));
  const routes = await ctx.db.select().from(tiffinRoutes).where(eq(tiffinRoutes.merchantId, merchantId)).orderBy(asc(tiffinRoutes.sortOrder), asc(tiffinRoutes.createdAt));
  // Routes can change after a row was generated: follow the subscription for meals not yet on the road.
  const stop = (r: (typeof rows)[number]): tiffinApi.ManifestStop & { routeId: string | null } => {
    const live = r.d.status === "scheduled";
    return {
      routeId: live ? r.sub.routeId : r.d.routeId,
      deliveryId: r.d.id,
      subscriptionId: r.sub.id,
      stopOrder: live ? r.sub.stopOrder : r.d.stopOrder,
      status: r.d.status as tiffinApi.TiffinDeliveryStatus,
      customerName: r.user.name,
      customerPhone: r.user.phone,
      address: r.sub.address,
      postalCode: r.sub.postalCode,
      addressNotes: r.sub.addressNotes,
      dietaryNotes: r.sub.dietaryNotes,
      servings: r.d.servings,
      planName: r.plan.name,
      note: r.d.note,
      deliveredAt: iso(r.d.deliveredAt),
    };
  };
  const byOrder = (a: tiffinApi.ManifestStop, b: tiffinApi.ManifestStop) => (a.stopOrder ?? 1e9) - (b.stopOrder ?? 1e9) || (a.postalCode ?? "").localeCompare(b.postalCode ?? "") || a.deliveryId.localeCompare(b.deliveryId);
  const strip = ({ routeId: _r, ...s }: ReturnType<typeof stop>): tiffinApi.ManifestStop => s;
  const deliveries = rows.filter((r) => r.sub.fulfilment === "delivery").map((r) => stop(r));
  const pickups = rows.filter((r) => r.sub.fulfilment === "pickup").map((r) => strip(stop(r))).sort(byOrder);
  const out: tiffinApi.ManifestRoute[] = [];
  for (const r of routes) {
    if (routeId && r.id !== routeId) continue;
    const list = deliveries.filter((s) => s.routeId === r.id).map(strip).sort(byOrder);
    if (list.length || routeId) out.push({ route: { id: r.id, name: r.name, driverName: r.driverName, driverPhone: r.driverPhone }, stops: list });
  }
  const none = deliveries.filter((s) => !s.routeId || !routes.some((r) => r.id === s.routeId)).map(strip).sort(byOrder);
  if (!routeId && none.length) out.push({ route: null, stops: none });
  return { date, routes: out, pickups: routeId ? [] : pickups };
}

const NEXT_STATUS: Record<string, readonly string[]> = {
  scheduled: ["out_for_delivery", "delivered", "picked_up", "missed"],
  out_for_delivery: ["delivered", "missed"],
  missed: ["delivered", "picked_up"],
};

export async function setDeliveryStatus(ctx: AppContext, merchantId: string, body: z.output<typeof tiffinApi.setDeliveryStatusBody>): Promise<tiffinApi.SetDeliveryStatusResponse> {
  const ids = [...new Set(body.ids)];
  const rows = await ctx.db
    .select({ d: tiffinDeliveries, sub: tiffinSubscriptions, plan: tiffinPlans })
    .from(tiffinDeliveries)
    .innerJoin(tiffinSubscriptions, eq(tiffinSubscriptions.id, tiffinDeliveries.subscriptionId))
    .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
    .where(and(eq(tiffinDeliveries.merchantId, merchantId), inArray(tiffinDeliveries.id, ids)));
  if (rows.length !== ids.length) throw notFound("Delivery");
  const ignored: string[] = [];
  let updated = 0;
  const now = ctx.now();
  const [merchant] = await ctx.db.select({ name: merchants.name }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  for (const { d, sub, plan } of rows) {
    const fulfilmentOk = body.status === "picked_up" ? sub.fulfilment === "pickup" : body.status === "delivered" || body.status === "out_for_delivery" ? sub.fulfilment === "delivery" : true;
    if (!fulfilmentOk || !NEXT_STATUS[d.status]?.includes(body.status)) {
      ignored.push(d.id);
      continue;
    }
    const final = body.status === "delivered" || body.status === "picked_up";
    await ctx.db
      .update(tiffinDeliveries)
      .set({ status: body.status, note: body.note ?? d.note, ...(final ? { deliveredAt: now } : {}) })
      .where(eq(tiffinDeliveries.id, d.id));
    updated++;
    const shop = merchant?.name ?? "Your kitchen";
    // notifyCustomer (not sendNotification) so the WhatsApp listener hears it: it expects { type: "tiffin_delivery", status }.
    const msg =
      body.status === "out_for_delivery" ? { title: "Your tiffin is out for delivery", body: `${plan.name} from ${shop} is on its way.` }
      : body.status === "delivered" ? { title: "Your tiffin was delivered", body: `${plan.name} from ${shop} has arrived. Enjoy.` }
      : body.status === "missed" ? { title: "We missed your tiffin today", body: `${shop} couldn't complete today's ${plan.name}. They'll be in touch.` }
      : null;
    if (msg) await notifyCustomer(ctx, { userId: sub.userId, merchantId, ...msg, data: { type: "tiffin_delivery", status: body.status, subscriptionId: sub.id, deliveryId: d.id, date: d.date, event: body.status } });
  }
  return { updated, ignored };
}

// ---------------------------------------------------------------------------
// Merchant: revenue
// ---------------------------------------------------------------------------
export async function revenue(ctx: AppContext, merchantId: string, month?: string): Promise<tiffinApi.RevenueResponse> {
  const m = month ?? todayOf(ctx).slice(0, 7);
  const start = `${m}-01`;
  const next = addMonths(start, 1);
  const startAt = localInstant(start, 0);
  const endAt = localInstant(next, 0);
  const rows = await ctx.db
    .select({ sub: tiffinSubscriptions, plan: tiffinPlans })
    .from(tiffinSubscriptions)
    .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
    .where(eq(tiffinSubscriptions.merchantId, merchantId));
  const billing = rows.filter((r) => r.sub.status === "active" || r.sub.status === "past_due");
  const byPlan = new Map<string, { planId: string; planName: string; activeSubscribers: number; mrrCents: number }>();
  for (const { sub, plan } of billing) {
    const e = byPlan.get(plan.id) ?? { planId: plan.id, planName: plan.name, activeSubscribers: 0, mrrCents: 0 };
    e.activeSubscribers++;
    e.mrrCents += mrrOf(plan.cadence, sub.priceCents);
    byPlan.set(plan.id, e);
  }
  const activeAtStart = rows.filter((r) => r.sub.createdAt < startAt && (!r.sub.cancelledAt || r.sub.cancelledAt >= startAt)).length;
  const churned = rows.filter((r) => r.sub.cancelledAt && r.sub.cancelledAt >= startAt && r.sub.cancelledAt < endAt).length;
  const created = rows.filter((r) => r.sub.createdAt >= startAt && r.sub.createdAt < endAt && r.sub.status !== "pending").length;
  const [skipRow] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(tiffinSkips)
    .innerJoin(tiffinSubscriptions, eq(tiffinSubscriptions.id, tiffinSkips.subscriptionId))
    .where(and(eq(tiffinSubscriptions.merchantId, merchantId), gte(tiffinSkips.date, start), lt(tiffinSkips.date, next)));
  const [delRow] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(tiffinDeliveries)
    .where(and(eq(tiffinDeliveries.merchantId, merchantId), gte(tiffinDeliveries.date, start), lt(tiffinDeliveries.date, next), ne(tiffinDeliveries.status, "skipped")));
  const skips = Number(skipRow?.n ?? 0);
  const dels = Number(delRow?.n ?? 0);
  const [paid] = await ctx.db
    .select({ amount: sql<number>`coalesce(sum(${tiffinCharges.amountCents}), 0)::int`, credit: sql<number>`coalesce(sum(${tiffinCharges.creditCents}), 0)::int`, fee: sql<number>`coalesce(sum(${tiffinCharges.platformFeeCents}), 0)::int` })
    .from(tiffinCharges)
    .where(and(eq(tiffinCharges.merchantId, merchantId), eq(tiffinCharges.status, "paid"), gte(tiffinCharges.paidAt, startAt), lt(tiffinCharges.paidAt, endAt)));
  const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
  return {
    month: m,
    mrrCents: [...byPlan.values()].reduce((a, p) => a + p.mrrCents, 0),
    activeSubscribers: rows.filter((r) => r.sub.status === "active").length,
    pausedSubscribers: rows.filter((r) => r.sub.status === "paused").length,
    pastDueSubscribers: rows.filter((r) => r.sub.status === "past_due").length,
    newThisMonth: created,
    churnedThisMonth: churned,
    churnRate: activeAtStart ? round4(churned / activeAtStart) : 0,
    skipRate: skips + dels ? round4(skips / (skips + dels)) : 0,
    collectedCents: Number(paid?.amount ?? 0),
    creditsCents: Number(paid?.credit ?? 0),
    platformFeeCents: Number(paid?.fee ?? 0),
    byPlan: [...byPlan.values()],
  };
}

// ---------------------------------------------------------------------------
// Public + customer
// ---------------------------------------------------------------------------
function localized(p: tiffinApi.PlanDto, lang?: string): tiffinApi.PlanDto {
  const t = lang ? (p.translations[lang] ?? p.translations[lang.split("-")[0]!]) : undefined;
  return t ? { ...p, name: t.name || p.name, description: t.description ?? p.description } : p;
}

export async function publicPlans(ctx: AppContext, merchant: Merchant, q: z.output<typeof tiffinApi.publicPlansQuery>): Promise<tiffinApi.PublicPlansResponse> {
  await requireFeature(ctx.db, merchant, "restaurant.tiffin");
  const plans = await ctx.db.select().from(tiffinPlans).where(and(eq(tiffinPlans.merchantId, merchant.id), eq(tiffinPlans.active, true))).orderBy(asc(tiffinPlans.sortOrder), asc(tiffinPlans.createdAt));
  const today = todayOf(ctx);
  const to = addDays(today, Math.max(q.menuDays - 1, 0));
  const menus = q.menuDays ? await ctx.db.select().from(tiffinMenus).where(and(eq(tiffinMenus.merchantId, merchant.id), gte(tiffinMenus.date, today), lte(tiffinMenus.date, to))) : [];
  return {
    shop: { id: merchant.id, name: merchant.name, slug: merchant.slug, logoUrl: merchant.logoUrl, phone: merchant.phone },
    padEnabled: !!ctx.config.tiffin?.padEnabled,
    plans: plans.map((p) => ({
      ...localized(planDto(p), q.lang),
      upcomingMenu: dateRange(today, to)
        .filter((d) => p.daysOfWeek.includes(dowOf(d)))
        .flatMap((d) => {
          const m = menuFor(menus, p.id, d);
          return m && m.items.length ? [{ date: d, items: m.items, notes: m.notes }] : [];
        }),
    })),
  };
}

export async function subscribe(ctx: AppContext, userId: string, body: z.output<typeof tiffinApi.subscribeBody>): Promise<tiffinApi.SubscribeResponse> {
  const [plan] = await ctx.db.select().from(tiffinPlans).where(eq(tiffinPlans.id, body.planId)).limit(1);
  if (!plan || !plan.active) throw notFound("Plan");
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, plan.merchantId)).limit(1);
  if (!merchant || merchant.status === "closed") throw notFound("Plan");
  await requireFeature(ctx.db, merchant, "restaurant.tiffin");
  if (body.servings > plan.maxServings) throw badRequest(`This plan serves up to ${plan.maxServings}`);
  if (body.fulfilment === "delivery" && !plan.deliveryAllowed) throw badRequest("This plan is pickup only");
  if (body.fulfilment === "pickup" && !plan.pickupAllowed) throw badRequest("This plan is delivery only");
  if (body.paymentMethod === "pad" && !ctx.config.tiffin?.padEnabled) throw badRequest("Pre-authorized debit isn't available yet. Pay by card.");
  const today = todayOf(ctx);
  if (body.startDate < today) throw badRequest("The start date is in the past");
  if (body.startDate > addDays(today, 60)) throw badRequest("Start within the next 60 days");
  if (!merchant.stripeAccountId || !merchant.stripeChargesEnabled) throw conflict("This kitchen can't take payments yet");
  const [dupe] = await ctx.db
    .select({ id: tiffinSubscriptions.id })
    .from(tiffinSubscriptions)
    .where(and(eq(tiffinSubscriptions.userId, userId), eq(tiffinSubscriptions.planId, plan.id), ne(tiffinSubscriptions.status, "cancelled")))
    .limit(1);
  if (dupe) throw conflict("You already have this plan. Manage it from your subscriptions.");

  const now = ctx.now();
  const price = priceFor(plan, body.servings, body.fulfilment);
  const periodEnd = periodEndFor(plan.cadence, body.startDate);
  let [sub] = await ctx.db
    .insert(tiffinSubscriptions)
    .values({
      merchantId: merchant.id,
      planId: plan.id,
      userId,
      status: "pending",
      servings: body.servings,
      fulfilment: body.fulfilment,
      address: body.fulfilment === "delivery" ? (body.address ?? null) : null,
      addressNotes: body.addressNotes ?? null,
      postalCode: body.postalCode ? body.postalCode.toUpperCase() : null,
      dietaryNotes: body.dietaryNotes ?? null,
      startDate: body.startDate,
      currentPeriodStart: body.startDate,
      currentPeriodEnd: periodEnd,
      nextBillingDate: addDays(periodEnd, 1),
      priceCents: price,
      paymentMethod: body.paymentMethod,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  sub = await autoAssignRoute(ctx.db, sub!);
  const { charge } = await ensureCharge(ctx, sub, plan, body.startDate, true);
  let payment: tiffinApi.PaymentIntentRef | null;
  try {
    payment = await startPayment(ctx, merchant, sub, charge);
  } catch (err) {
    await ctx.db.delete(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, sub.id));
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, "payment_error", "We couldn't start the payment. Please try again.", { cause: (err as Error).message });
  }
  const row = (await loadSubRow(ctx.db, sub.id))!;
  const [fresh] = await ctx.db.select().from(tiffinCharges).where(eq(tiffinCharges.id, charge.id)).limit(1);
  return { subscription: subDto(row.sub, row.plan, row.route), charge: chargeDto(fresh!), payment };
}

async function myDto(ctx: AppContext, row: SubRow, merchant: Pick<Merchant, "id" | "name" | "slug" | "logoUrl">): Promise<tiffinApi.MySubscriptionDto> {
  const today = todayOf(ctx);
  const [latest] = await ctx.db.select().from(tiffinCharges).where(eq(tiffinCharges.subscriptionId, row.sub.id)).orderBy(desc(tiffinCharges.periodStart)).limit(1);
  const skips = await ctx.db.select({ date: tiffinSkips.date }).from(tiffinSkips).where(and(eq(tiffinSkips.subscriptionId, row.sub.id), gte(tiffinSkips.date, today))).orderBy(asc(tiffinSkips.date));
  const upcoming = await upcomingFor(ctx, [row], 14);
  const next = upcoming.find((u) => u.status === "scheduled" || u.status === "out_for_delivery");
  return {
    ...subDto(row.sub, row.plan, row.route),
    merchant: { id: merchant.id, name: merchant.name, slug: merchant.slug, logoUrl: merchant.logoUrl },
    nextDelivery: next ? { date: next.date, status: next.status as tiffinApi.TiffinDeliveryStatus } : null,
    latestCharge: latest ? chargeDto(latest) : null,
    skips: skips.map((s) => s.date),
  };
}

async function myRows(ctx: AppContext, userId: string, extra: ReturnType<typeof and>[] = []) {
  const rows = await ctx.db
    .select({ sub: tiffinSubscriptions, plan: tiffinPlans, route: tiffinRoutes, merchant: { id: merchants.id, name: merchants.name, slug: merchants.slug, logoUrl: merchants.logoUrl } })
    .from(tiffinSubscriptions)
    .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
    .innerJoin(merchants, eq(merchants.id, tiffinSubscriptions.merchantId))
    .leftJoin(tiffinRoutes, eq(tiffinRoutes.id, tiffinSubscriptions.routeId))
    .where(and(eq(tiffinSubscriptions.userId, userId), ...extra))
    .orderBy(desc(tiffinSubscriptions.createdAt));
  return rows;
}

export async function mySubscriptions(ctx: AppContext, userId: string, q: z.output<typeof tiffinApi.mySubscriptionsQuery>): Promise<tiffinApi.MySubscriptionsResponse> {
  const statuses = q.status ? q.status.split(",").map((s) => s.trim()) : ["pending", "active", "paused", "past_due"];
  const rows = await myRows(ctx, userId, [inArray(tiffinSubscriptions.status, statuses)]);
  return { items: await Promise.all(rows.map((r) => myDto(ctx, r, r.merchant))) };
}

export async function mySubscription(ctx: AppContext, userId: string, subId: string): Promise<tiffinApi.MySubscriptionDetailResponse> {
  const [r] = (await myRows(ctx, userId, [eq(tiffinSubscriptions.id, subId)]));
  if (!r) throw notFound("Subscription");
  const charges = await ctx.db.select().from(tiffinCharges).where(eq(tiffinCharges.subscriptionId, subId)).orderBy(desc(tiffinCharges.periodStart)).limit(24);
  return { subscription: await myDto(ctx, r, r.merchant), charges: charges.map(chargeDto), upcoming: await upcomingFor(ctx, [r], 14) };
}

async function myDtoById(ctx: AppContext, userId: string, subId: string) {
  const [r] = await myRows(ctx, userId, [eq(tiffinSubscriptions.id, subId)]);
  return myDto(ctx, r!, r!.merchant);
}

/** Meal days ahead with their live status, cutoff and menu. Computed, so it works before the daily job has run. */
async function upcomingFor(ctx: AppContext, rows: (SubRow & { merchant?: { id: string; name: string; slug: string } })[], days: number): Promise<tiffinApi.UpcomingDelivery[]> {
  const live = rows.filter((r) => r.sub.status !== "cancelled");
  if (!live.length) return [];
  const today = todayOf(ctx);
  const to = addDays(today, days - 1);
  const ids = live.map((r) => r.sub.id);
  const mids = [...new Set(live.map((r) => r.sub.merchantId))];
  const [dels, skips, menus, ms] = await Promise.all([
    ctx.db.select().from(tiffinDeliveries).where(and(inArray(tiffinDeliveries.subscriptionId, ids), gte(tiffinDeliveries.date, today), lte(tiffinDeliveries.date, to))),
    ctx.db.select().from(tiffinSkips).where(and(inArray(tiffinSkips.subscriptionId, ids), gte(tiffinSkips.date, today), lte(tiffinSkips.date, to))),
    ctx.db.select().from(tiffinMenus).where(and(inArray(tiffinMenus.merchantId, mids), gte(tiffinMenus.date, today), lte(tiffinMenus.date, to))),
    ctx.db.select({ id: merchants.id, name: merchants.name, slug: merchants.slug }).from(merchants).where(inArray(merchants.id, mids)),
  ]);
  const out: tiffinApi.UpcomingDelivery[] = [];
  for (const { sub, plan } of live) {
    const m = ms.find((x) => x.id === sub.merchantId)!;
    for (const date of serviceDates(plan, sub, today, to)) {
      const d = dels.find((x) => x.subscriptionId === sub.id && x.date === date);
      const skipped = skips.some((s) => s.subscriptionId === sub.id && s.date === date);
      const cutoff = cutoffAt(plan, date);
      let status: tiffinApi.UpcomingDelivery["status"];
      if (d) status = d.status as tiffinApi.TiffinDeliveryStatus;
      else if (skipped) status = "skipped";
      else if (sub.status === "paused") status = "paused";
      else if (sub.status !== "active") status = "on_hold";
      else status = "scheduled";
      out.push({
        subscriptionId: sub.id,
        planName: plan.name,
        merchant: m,
        date,
        status,
        servings: sub.servings,
        fulfilment: sub.fulfilment as tiffinApi.TiffinFulfilment,
        cutoffAt: cutoff.toISOString(),
        canSkip: sub.status === "active" && status === "scheduled" && ctx.now().getTime() <= cutoff.getTime(),
        menu: menuFor(menus.filter((x) => x.merchantId === sub.merchantId), plan.id, date)?.items ?? [],
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.planName.localeCompare(b.planName));
}

export async function myUpcoming(ctx: AppContext, userId: string, q: z.output<typeof tiffinApi.upcomingQuery>): Promise<tiffinApi.UpcomingResponse> {
  const rows = await myRows(ctx, userId, q.subscriptionId ? [eq(tiffinSubscriptions.id, q.subscriptionId)] : []);
  return { items: await upcomingFor(ctx, rows, q.days) };
}

export async function mySkip(ctx: AppContext, userId: string, subId: string, body: z.output<typeof tiffinApi.skipBody>): Promise<tiffinApi.SkipResponse> {
  const row = await mySubRow(ctx.db, userId, subId);
  const r = await skipDates(ctx, row, body.dates, body.reason, true);
  return { subscription: await myDtoById(ctx, userId, subId), ...r };
}

export async function myUnskip(ctx: AppContext, userId: string, subId: string, date: string): Promise<tiffinApi.MySubscriptionDto> {
  await unskipDate(ctx, await mySubRow(ctx.db, userId, subId), date, true);
  return myDtoById(ctx, userId, subId);
}

export async function myPause(ctx: AppContext, userId: string, subId: string, body: z.output<typeof tiffinApi.pauseBody>): Promise<tiffinApi.PauseResponse> {
  const r = await pauseSubscription(ctx, await mySubRow(ctx.db, userId, subId), body, true);
  return { subscription: await myDtoById(ctx, userId, subId), ...r };
}

export async function myResume(ctx: AppContext, userId: string, subId: string): Promise<tiffinApi.MySubscriptionDto> {
  await resumeSubscription(ctx, await mySubRow(ctx.db, userId, subId), true);
  return myDtoById(ctx, userId, subId);
}

export async function myCancel(ctx: AppContext, userId: string, subId: string, body: z.output<typeof tiffinApi.cancelBody>): Promise<tiffinApi.MySubscriptionDto> {
  await cancelSubscription(ctx, await mySubRow(ctx.db, userId, subId), body.reason);
  return myDtoById(ctx, userId, subId);
}

export async function myUpdate(ctx: AppContext, userId: string, subId: string, body: z.output<typeof tiffinApi.updateMySubscriptionBody>): Promise<tiffinApi.MySubscriptionDto> {
  const { sub } = await mySubRow(ctx.db, userId, subId);
  if (sub.status === "cancelled") throw conflict("This subscription is cancelled");
  const patch: Partial<typeof tiffinSubscriptions.$inferInsert> = { updatedAt: ctx.now() };
  if (body.address !== undefined) {
    if (sub.fulfilment !== "delivery") throw badRequest("This is a pickup subscription");
    patch.address = body.address;
  }
  if (body.addressNotes !== undefined) patch.addressNotes = body.addressNotes;
  if (body.dietaryNotes !== undefined) patch.dietaryNotes = body.dietaryNotes;
  if (body.postalCode !== undefined) patch.postalCode = body.postalCode.toUpperCase();
  const [u] = await ctx.db.update(tiffinSubscriptions).set(patch).where(eq(tiffinSubscriptions.id, subId)).returning();
  if (body.postalCode !== undefined && normalPostal(body.postalCode) !== normalPostal(sub.postalCode)) {
    await ctx.db.update(tiffinSubscriptions).set({ routeId: null, stopOrder: null }).where(eq(tiffinSubscriptions.id, subId));
    await autoAssignRoute(ctx.db, { ...u!, routeId: null, stopOrder: null });
  }
  return myDtoById(ctx, userId, subId);
}
