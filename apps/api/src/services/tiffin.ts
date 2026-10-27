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
 *  - Renewals charge the saved payment method off-session. The first payment
 *    carries setup_future_usage (card) / a mandate (PAD) and the webhook saves the
 *    method on the subscription. If the bank wants the customer (authentication
 *    required) the charge stays pending and they confirm at /pay/intent
 *    (renewal_due); a decline marks it failed and the subscription past due.
 *  - Hand-paid subscriptions (paymentMethod etransfer | cash) never touch Stripe: each period's charge
 *    is "awaiting" with a reference code, the kitchen records the money (manual_payments ledger, no
 *    platform fee), and a daily reminder job nudges the customer and, after the grace days, marks the
 *    subscription past due. Sales tax is added to a charge only when the shop says it is registered.
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { manualPayments, merchants, notifications, tiffinCharges, tiffinDeliveries, tiffinMenus, tiffinPlans, tiffinRoutes, tiffinSkips, tiffinSubscriptions, users, type DbOrTx } from "@ll/db";
import { salesTaxBps, tiffinApi, type paymentsManualApi } from "@ll/shared";
import type { StaffContext } from "../lib/auth.js";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { platformFeeFor } from "./fees.js";
import { getPayments } from "../providers/payments.js";
import { chargeConnectSavedMethod, chargeModeFor, createConnectPayment, refundConnectPayment, retrieveConnectPayment, savedMethodScope } from "./payments.js";
import { decodeCursor, encodeCursor, money, notifyCustomer } from "./commerceShared.js";
import { enabledFeaturesFor, requireFeature } from "./features.js";
import { localDate } from "./messaging.js";
import { inQuietHours, loadPrefs, sendNotification } from "./notifications.js";
import { acceptedMethods, addLedger, assertNotFuture, etransferOffer, liveLedger, manualInstructions, newReferenceCode, receiptLine, settingsOf, stripeReady, todayFor, voidLedger } from "./manual-payments.js";
import { merchantProvince } from "./tax.js";
import { findOrCreateUserByPhone } from "./channel-orders.js";
import { awardPurchase } from "./ledger.js";

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

/** A trial plan is one meal day: the subscription's start date, nothing after it. */
const isServiceDay = (plan: Pick<Plan, "daysOfWeek" | "cadence">, sub: Pick<Sub, "startDate">, date: string) => (plan.cadence === "trial" ? date === sub.startDate : date >= sub.startDate && plan.daysOfWeek.includes(dowOf(date)));
const serviceDates = (plan: Pick<Plan, "daysOfWeek" | "cadence">, sub: Pick<Sub, "startDate">, from: string, to: string) => dateRange(from, to).filter((d) => isServiceDay(plan, sub, d));
export const periodEndFor = (cadence: string, start: string) => (cadence === "trial" ? start : cadence === "weekly" ? addDays(start, 6) : addDays(addMonths(start, 1), -1));
/** How this subscriber is billed: a weekly plan can be billed monthly (the hand-paid default), otherwise the plan's own cadence. */
export const cadenceOf = (sub: Pick<Sub, "billingCadence">, plan: Pick<Plan, "cadence">): string => (plan.cadence === "weekly" && sub.billingCadence === "monthly" ? "monthly" : plan.cadence);
/** A weekly price stretched over a month (52/12 weeks). */
export const monthlyOfWeekly = (weeklyCents: number) => Math.round((weeklyCents * 52) / 12);

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
export const priceFor = (plan: Pick<Plan, "priceCents" | "extraServingCents" | "deliveryFeeCents">, servings: number, fulfilment: string) =>
  plan.priceCents + plan.extraServingCents * (servings - 1) + (fulfilment === "delivery" ? plan.deliveryFeeCents : 0);

/** The meal part of a period price (the delivery fee is never credited). */
export const foodCents = (sub: Pick<Sub, "priceCents" | "fulfilment"> & { billingCadence?: string | null }, plan: Pick<Plan, "deliveryFeeCents"> & { cadence?: string }) => {
  const fee = plan.cadence === "weekly" && sub.billingCadence === "monthly" ? monthlyOfWeekly(plan.deliveryFeeCents) : plan.deliveryFeeCents;
  return Math.max(0, sub.priceCents - (sub.fulfilment === "delivery" ? fee : 0));
};

/** Credit for skipped meal days: per-meal price x skipped servings (the whole household), rounded once. */
export const creditFor = (food: number, skippedDays: number, serviceDays: number) => (serviceDays > 0 ? Math.min(food, Math.round((food * skippedDays) / serviceDays)) : 0);

/** Monthly recurring revenue for one subscription (weekly x 52/12). */
export const mrrOf = (cadence: string, priceCents: number) => (cadence === "trial" ? 0 : cadence === "weekly" ? monthlyOfWeekly(priceCents) : priceCents);

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
/** etransfer and cash are collected by the kitchen by hand, outside Stripe. */
export const isManualMethod = (m: string) => m === "etransfer" || m === "cash";

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
    taxable: p.taxable,
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
    taxCents: c.taxCents,
    referenceCode: c.referenceCode,
    paidMethod: c.status === "paid" || c.status === "refunded" ? ((c.paymentMethod ?? null) as tiffinApi.ChargeDto["paidMethod"]) : null,
    receivedOn: c.receivedOn,
    remainingCents: c.status === "paid" || c.status === "refunded" ? 0 : Math.max(0, c.amountCents - c.paidCents),
    overpaidCents: Math.max(0, c.paidCents - c.amountCents),
    // "processing" is an internal state (PAD debit in flight); callers see a pending charge with processing: true.
    status: (c.status === "processing" ? "pending" : c.status) as tiffinApi.ChargeDto["status"],
    ...(c.status === "processing" ? { processing: true } : {}),
    paidAt: iso(c.paidAt),
    createdAt: c.createdAt.toISOString(),
  };
}

export const cardOnFileOf = (s: Pick<Sub, "paymentMethodId" | "paymentMethod" | "paymentMethodBrand" | "paymentMethodLast4">): tiffinApi.CardOnFile | null =>
  s.paymentMethodId ? { type: s.paymentMethod === "pad" ? "pad" : "card", brand: s.paymentMethodBrand, last4: s.paymentMethodLast4 } : null;

export function subDto(s: Sub, plan: Plan, route: Pick<Route, "name"> | null): tiffinApi.SubscriptionDto {
  return {
    id: s.id,
    status: s.status as tiffinApi.TiffinSubStatus,
    billingCadence: cadenceOf(s, plan) as tiffinApi.TiffinCadence,
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
/** "Rotli (4)" means 4 pieces per serving: remember the 4 so the prep list can total pieces. */
const PER_SERVING_RE = /\((\d{1,2})\)\s*$/;
const withPerServing = <T extends { name: string; perServing?: number }>(i: T): T => {
  if (i.perServing) return i;
  const m = PER_SERVING_RE.exec(i.name);
  return m && Number(m[1]) > 0 ? { ...i, perServing: Number(m[1]) } : i;
};
const menuDto = (m: MenuRow): tiffinApi.MenuDto => ({ id: m.id, planId: m.planId, date: m.date, items: m.items, notes: m.notes });

export async function putMenus(db: DbOrTx, merchantId: string, body: z.output<typeof tiffinApi.putMenusBody>): Promise<tiffinApi.MenusResponse> {
  const planIds = [...new Set(body.menus.map((m) => m.planId).filter((x): x is string => !!x))];
  if (planIds.length) {
    const found = await db.select({ id: tiffinPlans.id }).from(tiffinPlans).where(and(eq(tiffinPlans.merchantId, merchantId), inArray(tiffinPlans.id, planIds)));
    if (found.length !== planIds.length) throw notFound("Plan");
  }
  const out: MenuRow[] = [];
  for (const m of body.menus) {
    m.items = m.items.map(withPerServing);
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
  const subtotal = Math.max(0, sub.priceCents - credit);
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, sub.merchantId)).limit(1);
  // Tax only for a shop that says it is registered for GST/HST (and a taxable plan): a subscriber agreed to a price, so an unset status adds nothing.
  const bps = merchant?.taxRegistered === true && plan.taxable ? salesTaxBps({ province: await merchantProvince(ctx.db, merchant), taxRegistered: true }) : 0;
  const taxCents = Math.round((subtotal * bps) / 10_000);
  const amount = subtotal + taxCents;
  const manual = isManualMethod(sub.paymentMethod);
  // The platform fee is a share of the sale before tax (tax is passed through); hand-recorded payments carry none.
  const platformFeeCents = merchant ? platformFeeFor(manual ? "manual" : "tiffin", subtotal, merchant) : 0;
  const [c] = await ctx.db
    .insert(tiffinCharges)
    .values({
      merchantId: sub.merchantId,
      subscriptionId: sub.id,
      periodStart,
      periodEnd: periodEndFor(cadenceOf(sub, plan), periodStart),
      amountCents: amount,
      creditCents: credit,
      taxCents,
      platformFeeCents,
      ...(manual && amount > 0 ? { status: "awaiting", referenceCode: await newReferenceCode(ctx.db, sub.merchantId, sub.userId), paymentMethod: sub.paymentMethod } : {}),
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
  // The customer confirms this one, and it keeps their method on file for renewals (replacing any old one).
  const customerId = await ensurePayerCustomer(ctx, merchant, sub);
  const pi = await createConnectPayment(ctx, merchant, {
    ...chargeArgs(merchant, sub, charge),
    // A charge re-created after the merchant switched to direct charges is a different request (other account), so another key.
    idempotencyKey: `tiffin:${charge.id}:pi${attempt ? `:${attempt}` : ""}${chargeModeFor(ctx, merchant) === "direct" ? ":direct" : ""}`,
    customerId,
    setupFutureUsage: "off_session",
  });
  await ctx.db.update(tiffinCharges).set({ stripePaymentIntentId: pi.id, status: "pending" }).where(eq(tiffinCharges.id, charge.id));
  return paymentRef(pi, sub);
}

function chargeArgs(merchant: Merchant, sub: Sub, charge: Charge) {
  return {
    amountCents: charge.amountCents,
    connectedAccountId: merchant.stripeAccountId!,
    applicationFeeCents: charge.platformFeeCents,
    description: `${merchant.name} tiffin ${charge.periodStart} to ${charge.periodEnd}`,
    metadata: { ll_kind: "tiffin", ll_id: charge.id, merchant_id: merchant.id, subscription_id: sub.id },
    ...(sub.paymentMethod === "pad" ? { paymentMethodTypes: ["acss_debit"] } : {}),
  };
}

/**
 * The merchant's charge mode changed (destination <-> direct): saved Stripe customers and payment methods live on the
 * old account (the platform or the connected account) and can't be charged on the new one. Clear them for every live
 * subscription that has one, and drop the unpaid PaymentIntent of a pending charge, which also lives on the old account.
 * The next renewal then takes the renewal_due path (a new intent on the new account, and the customer is asked to
 * confirm it and re-add their card, which is kept for the renewals after). Returns how many subscriptions were reset.
 * A payment already processing is left alone: its debit settles on the old account and the webhook still lands.
 */
export async function resetSavedMethodsForChargeModeChange(ctx: AppContext, merchantId: string): Promise<number> {
  const reset = await ctx.db
    .update(tiffinSubscriptions)
    .set({ stripeCustomerId: null, paymentMethodId: null, paymentMethodBrand: null, paymentMethodLast4: null, setupIntentId: null, updatedAt: ctx.now() })
    .where(
      and(
        eq(tiffinSubscriptions.merchantId, merchantId),
        ne(tiffinSubscriptions.status, "cancelled"),
        or(sql`${tiffinSubscriptions.stripeCustomerId} is not null`, sql`${tiffinSubscriptions.paymentMethodId} is not null`, sql`${tiffinSubscriptions.setupIntentId} is not null`),
      ),
    )
    .returning({ id: tiffinSubscriptions.id });
  if (reset.length) {
    await ctx.db
      .update(tiffinCharges)
      .set({ stripePaymentIntentId: null })
      .where(and(inArray(tiffinCharges.subscriptionId, reset.map((r) => r.id)), eq(tiffinCharges.status, "pending")));
  }
  return reset.length;
}

/**
 * The Stripe Customer for this user at this merchant (on the connected account for direct charges, the platform
 * otherwise): reused from another subscription of theirs with the same kitchen, else created once.
 */
async function ensurePayerCustomer(ctx: AppContext, merchant: Merchant, sub: Sub): Promise<string> {
  if (sub.stripeCustomerId) return sub.stripeCustomerId;
  const [other] = await ctx.db
    .select({ id: tiffinSubscriptions.stripeCustomerId })
    .from(tiffinSubscriptions)
    .where(and(eq(tiffinSubscriptions.userId, sub.userId), eq(tiffinSubscriptions.merchantId, sub.merchantId), sql`${tiffinSubscriptions.stripeCustomerId} is not null`))
    .limit(1);
  let customerId = other?.id ?? null;
  if (!customerId) {
    const [u] = await ctx.db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, sub.userId)).limit(1);
    const direct = chargeModeFor(ctx, merchant) === "direct";
    customerId = (await getPayments(ctx).createPayerCustomer({ userId: sub.userId, merchantId: merchant.id, email: u?.email, name: u?.name, connectedAccountId: direct ? merchant.stripeAccountId : null })).customerId;
  }
  await ctx.db.update(tiffinSubscriptions).set({ stripeCustomerId: customerId, updatedAt: ctx.now() }).where(eq(tiffinSubscriptions.id, sub.id));
  sub.stripeCustomerId = customerId;
  return customerId;
}

/** Remember the method a customer paid or set up with, so renewals can charge it. Card details are display-only and best effort. */
async function saveMethod(ctx: AppContext, merchant: Merchant, subId: string, paymentMethodId: string): Promise<void> {
  const info = await getPayments(ctx).retrievePaymentMethod(paymentMethodId, savedMethodScope(ctx, merchant)).catch(() => null);
  await ctx.db
    .update(tiffinSubscriptions)
    .set({ paymentMethodId, paymentMethodBrand: info?.brand ?? null, paymentMethodLast4: info?.last4 ?? null, updatedAt: ctx.now() })
    .where(eq(tiffinSubscriptions.id, subId));
}

/** What the webhook knows about a PaymentIntent beyond its outcome. */
interface PaidWith {
  paymentMethodId?: string | null;
  customerId?: string | null;
  errorCode?: string | null;
}

/** Mark a charge paid and move the subscription into that period. Idempotent. */
async function settleCharge(ctx: AppContext, chargeId: string, paymentIntentId: string | null, paid?: PaidWith): Promise<void> {
  const [charge] = await ctx.db.select().from(tiffinCharges).where(eq(tiffinCharges.id, chargeId)).limit(1);
  if (!charge || charge.status === "paid" || charge.status === "refunded") return;
  const [sub] = await ctx.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, charge.subscriptionId)).limit(1);
  const now = ctx.now();
  await ctx.db
    .update(tiffinCharges)
    .set({ status: "paid", paidAt: now, ...(sub && !isManualMethod(sub.paymentMethod) ? { paymentMethod: sub.paymentMethod } : {}), ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}) })
    .where(eq(tiffinCharges.id, chargeId));
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
  // A payment that kept its method on our customer becomes the card on file.
  if (paid?.paymentMethodId && paid.paymentMethodId !== sub.paymentMethodId && sub.stripeCustomerId && paid.customerId === sub.stripeCustomerId) {
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, charge.merchantId)).limit(1);
    if (m) await saveMethod(ctx, m, sub.id, paid.paymentMethodId);
  }
  await advanceSubscription(ctx, charge, sub);
  await awardTiffinPoints(ctx, charge, sub);
}

/**
 * A paid period earns the subscriber points in the kitchen's own program (once per charge: key `tiffin:<chargeId>`).
 * Dollar programs count the food and fees before tax; stamp programs give one stamp per meal day in the period.
 * A kitchen with no loyalty program, or one that is paused, simply earns nothing: the subscription is not affected.
 */
async function awardTiffinPoints(ctx: AppContext, charge: Charge, sub: Sub): Promise<void> {
  try {
    const [plan] = await ctx.db.select().from(tiffinPlans).where(eq(tiffinPlans.id, sub.planId)).limit(1);
    const days = plan ? serviceDates(plan, sub, charge.periodStart, charge.periodEnd).length : 1;
    await awardPurchase(ctx, {
      merchantId: charge.merchantId,
      userId: sub.userId,
      amountCents: Math.max(0, charge.amountCents - charge.taxCents),
      quantity: Math.max(1, days),
      source: "customer_app",
      locationId: null,
      idempotencyKey: `tiffin:${charge.id}`,
      externalRef: `tiffin:${charge.referenceCode ?? charge.id}`,
      ignoreCooldown: true,
      joinedVia: "app",
    });
  } catch (err) {
    if (err instanceof HttpError && err.statusCode < 500) return;
    if (ctx.config.env !== "test") console.error("[tiffin points]", charge.id, err);
  }
}

/** A paid charge moves the subscription into its period and out of pending / past due. */
async function advanceSubscription(ctx: AppContext, charge: Charge, sub: Sub): Promise<void> {
  const [plan] = await ctx.db.select({ cadence: tiffinPlans.cadence }).from(tiffinPlans).where(eq(tiffinPlans.id, sub.planId)).limit(1);
  const isTrial = plan?.cadence === "trial";
  const advance = !sub.currentPeriodStart || charge.periodStart >= sub.currentPeriodStart;
  await ctx.db
    .update(tiffinSubscriptions)
    .set({
      ...(sub.status === "pending" || sub.status === "past_due" ? { status: "active" } : {}),
      ...(advance ? { currentPeriodStart: charge.periodStart, currentPeriodEnd: charge.periodEnd, nextBillingDate: isTrial ? null : addDays(charge.periodEnd, 1) } : {}),
      updatedAt: ctx.now(),
    })
    .where(eq(tiffinSubscriptions.id, sub.id));
}

/** Webhook entry (payment_intent.* with ll_kind "tiffin"). */
export async function onTiffinPayment(ctx: AppContext, chargeId: string, paymentIntentId: string, outcome: "succeeded" | "failed" | "processing", pi?: PaidWith): Promise<void> {
  const [charge] = await ctx.db.select().from(tiffinCharges).where(eq(tiffinCharges.id, chargeId)).limit(1);
  if (!charge) return;
  if (outcome === "succeeded") return settleCharge(ctx, chargeId, paymentIntentId, pi);
  if (outcome === "processing") return markProcessing(ctx, charge, paymentIntentId);
  if (charge.status === "paid" || charge.status === "refunded") return;
  if (charge.stripePaymentIntentId && charge.stripePaymentIntentId !== paymentIntentId) return; // an older attempt
  // An off-session attempt that needs the customer: the charge stays pending and they confirm it (renewal_due was sent).
  if (pi?.errorCode === "authentication_required") return;
  // Already failed by the off-session charge itself; the webhook is the same news.
  if (charge.status === "failed" && charge.stripePaymentIntentId === paymentIntentId) return;
  await failCharge(ctx, charge, paymentIntentId);
}

/**
 * A PAD debit is in flight (payment_intent.processing, takes days): the charge is neither paid nor failed. The subscription
 * keeps its status, nothing else is charged for the period (the same PaymentIntent is kept, rollBilling skips charges that
 * already have one, and retry-payment refuses while it's processing). A later success settles it, a failure fails it normally.
 */
async function markProcessing(ctx: AppContext, charge: Charge, paymentIntentId: string): Promise<void> {
  if (charge.status !== "pending") return; // paid / refunded / failed already, or processing and this is a replay
  if (charge.stripePaymentIntentId && charge.stripePaymentIntentId !== paymentIntentId) return; // an older attempt
  const [marked] = await ctx.db.update(tiffinCharges).set({ status: "processing", stripePaymentIntentId: paymentIntentId }).where(and(eq(tiffinCharges.id, charge.id), eq(tiffinCharges.status, "pending"))).returning();
  if (!marked) return;
  await notifyProcessing(ctx, marked);
}

async function notifyProcessing(ctx: AppContext, charge: Charge): Promise<void> {
  const row = await loadSubRow(ctx.db, charge.subscriptionId);
  if (!row || row.sub.status === "cancelled") return;
  const [merchant] = await ctx.db.select({ name: merchants.name }).from(merchants).where(eq(merchants.id, row.sub.merchantId)).limit(1);
  await notify(ctx, row.sub.userId, row.sub.merchantId, "tiffin_update", "Your tiffin payment is processing", `${merchant?.name ?? "Your kitchen"} is collecting ${money(charge.amountCents)} for ${row.plan.name} from your bank account. Bank debits can take a few business days. We'll let you know when it clears.`, {
    subscriptionId: row.sub.id,
    chargeId: charge.id,
    event: "payment_processing",
  });
}

/** A charge that didn't go through: mark it failed, an active subscription past due, and tell the customer. */
async function failCharge(ctx: AppContext, charge: Charge, paymentIntentId: string): Promise<void> {
  const chargeId = charge.id;
  await ctx.db.update(tiffinCharges).set({ status: "failed", stripePaymentIntentId: paymentIntentId }).where(eq(tiffinCharges.id, chargeId));
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
  const [charge] = await ctx.db.select().from(tiffinCharges).where(and(eq(tiffinCharges.subscriptionId, subId), inArray(tiffinCharges.status, ["failed", "pending", "processing"]))).orderBy(desc(tiffinCharges.periodStart)).limit(1);
  if (!charge) throw conflict("Nothing is due");
  // A bank debit is already on its way: paying again would charge the period twice.
  if (charge.status === "processing") throw conflict("Your bank payment is still processing. It can take a few business days.");
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

/**
 * Customer wants a different card (or bank account): a SetupIntent on their Stripe customer, confirmed with Stripe.js
 * on the web or at /pay/setup/<id>?cs=<secret> from the app. An open one is reused. The webhook saves the result.
 */
export async function myPaymentMethodSetup(ctx: AppContext, userId: string, subId: string): Promise<tiffinApi.PaymentMethodSetupResponse> {
  const { sub } = await mySubRow(ctx.db, userId, subId);
  if (sub.status === "cancelled") throw conflict("This subscription is cancelled");
  if (isManualMethod(sub.paymentMethod)) throw conflict("You pay this kitchen by hand, so there is no card to change.");
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, sub.merchantId)).limit(1);
  if (!merchant?.stripeAccountId) throw conflict("This kitchen can't take payments yet");
  const payments = getPayments(ctx);
  const scope = savedMethodScope(ctx, merchant);
  const methods = sub.paymentMethod === "pad" ? ["acss_debit"] : ["card"];
  if (sub.setupIntentId) {
    const open = await payments.retrieveSetupIntent(sub.setupIntentId, scope).catch(() => null);
    if (open && (open.status === "requires_payment_method" || open.status === "requires_confirmation") && open.customerId === sub.stripeCustomerId) return { setupIntentId: open.id, clientSecret: open.clientSecret, methods };
  }
  const customerId = await ensurePayerCustomer(ctx, merchant, sub);
  const si = await payments.createSetupIntent({
    ...scope,
    customerId,
    ...(sub.paymentMethod === "pad" ? { paymentMethodTypes: ["acss_debit"] } : {}),
    metadata: { ll_kind: "tiffin_setup", ll_id: sub.id, merchant_id: merchant.id, subscription_id: sub.id },
    // A finished SetupIntent is never reused, so each new one needs its own key; double taps are caught by reusing the open one above.
    idempotencyKey: `tiffin_setup:${sub.id}:${randomUUID()}`,
  });
  await ctx.db.update(tiffinSubscriptions).set({ setupIntentId: si.id, updatedAt: ctx.now() }).where(eq(tiffinSubscriptions.id, sub.id));
  return { setupIntentId: si.id, clientSecret: si.clientSecret, methods };
}

/** Webhook entry (setup_intent.succeeded with ll_kind "tiffin_setup"): the new method becomes the card on file. */
export async function onTiffinSetup(ctx: AppContext, subId: string, setupIntentId: string, paymentMethodId: string): Promise<void> {
  const row = await loadSubRow(ctx.db, subId);
  if (!row || row.sub.status === "cancelled") return;
  if (row.sub.paymentMethodId === paymentMethodId) return;
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, row.sub.merchantId)).limit(1);
  if (!merchant) return;
  await saveMethod(ctx, merchant, subId, paymentMethodId);
  const [fresh] = await ctx.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, subId)).limit(1);
  const card = cardOnFileOf(fresh!);
  await notify(ctx, row.sub.userId, row.sub.merchantId, "tiffin_update", "Your payment method was updated", `${merchant.name} will charge ${card?.last4 ? `${card.type === "pad" ? "your bank account" : "your card"} ending ${card.last4}` : "your new payment method"} for ${row.plan.name} renewals.`, {
    subscriptionId: subId,
    setupIntentId,
    event: "payment_method_updated",
  });
}

/** Billing roll: charge each subscription whose next period starts today or earlier. Idempotent. */
export async function rollBilling(ctx: AppContext): Promise<{ charged: number; settled: number; errors: number }> {
  const today = todayOf(ctx);
  const rows = await ctx.db
    .select({ sub: tiffinSubscriptions, plan: tiffinPlans, merchant: merchants })
    .from(tiffinSubscriptions)
    .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
    .innerJoin(merchants, eq(merchants.id, tiffinSubscriptions.merchantId))
    .where(and(inArray(tiffinSubscriptions.status, ["active", "paused"]), ne(tiffinPlans.cadence, "trial"), lte(tiffinSubscriptions.nextBillingDate, today)));
  let charged = 0;
  let settled = 0;
  let errors = 0;
  for (const { sub, plan, merchant } of rows) {
    try {
      const { charge, created } = await ensureCharge(ctx, sub, plan, sub.nextBillingDate!, false);
      if (charge.status === "paid" || charge.status === "refunded") continue;
      if (isManualMethod(sub.paymentMethod)) {
        // Hand-paid: no Stripe. A fully credited period settles itself; otherwise tell the customer how to pay, once.
        if (charge.amountCents <= 0 && charge.status !== "paid") {
          await settleCharge(ctx, charge.id, null);
          settled++;
        } else if (created) {
          charged++;
          await notifyManualDue(ctx, merchant, sub, plan, charge, "renewal_due");
        }
        continue;
      }
      if (charge.stripePaymentIntentId || charge.status === "failed") continue; // already out for payment
      const forPeriod = `${money(charge.amountCents)} for ${plan.name} from ${charge.periodStart}${charge.creditCents ? `, after ${money(charge.creditCents)} credit for skipped days` : ""}`;
      // A saved method is charged without the customer; a free period (under the card minimum) settles below like before.
      if (sub.paymentMethodId && sub.stripeCustomerId && merchant.stripeAccountId && charge.amountCents >= MIN_CHARGE_CENTS) {
        const r = await chargeConnectSavedMethod(ctx, merchant, { ...chargeArgs(merchant, sub, charge), idempotencyKey: `tiffin:${charge.id}:off${chargeModeFor(ctx, merchant) === "direct" ? ":direct" : ""}`, customerId: sub.stripeCustomerId, paymentMethodId: sub.paymentMethodId });
        await ctx.db.update(tiffinCharges).set({ stripePaymentIntentId: r.intent.id, status: r.outcome === "processing" ? "processing" : "pending" }).where(eq(tiffinCharges.id, charge.id));
        charged++;
        if (r.outcome === "succeeded") {
          await settleCharge(ctx, charge.id, r.intent.id, { paymentMethodId: sub.paymentMethodId, customerId: sub.stripeCustomerId });
          await notify(ctx, sub.userId, sub.merchantId, "tiffin_update", "Your tiffin renewal was paid", `${forPeriod}. Charged to your card on file.`, { subscriptionId: sub.id, chargeId: charge.id, event: "renewal_paid" });
        } else if (r.outcome === "authentication_required") {
          await notify(ctx, sub.userId, sub.merchantId, "tiffin_update", "Your tiffin renewal needs you", `${forPeriod}. Your bank wants you to confirm this payment.`, { subscriptionId: sub.id, chargeId: charge.id, event: "renewal_due", reason: "authentication_required" });
        } else if (r.outcome === "declined") {
          await failCharge(ctx, { ...charge, status: "pending" }, r.intent.id);
        } else if (r.outcome === "processing") {
          // PAD: the debit clears in days; the webhook settles it (or fails it). Tell the customer it's on its way.
          await notifyProcessing(ctx, { ...charge, status: "processing" });
        }
        continue;
      }
      const ref = await startPayment(ctx, merchant, sub, charge);
      if (!ref) {
        settled++;
        continue;
      }
      charged++;
      if (created || !charge.stripePaymentIntentId) {
        await notify(ctx, sub.userId, sub.merchantId, "tiffin_update", "Your tiffin renewal is ready", `${forPeriod}.`, {
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
  let candidates = rows.filter((r) => r.plan.daysOfWeek.includes(dow) && isServiceDay(r.plan, r.sub, date));
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

/** A trial is one meal day: once that day has passed the subscription ends on its own (nothing renews). */
export async function finishTrials(ctx: AppContext): Promise<number> {
  const today = todayOf(ctx);
  const rows = await ctx.db
    .select({ id: tiffinSubscriptions.id })
    .from(tiffinSubscriptions)
    .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
    .where(and(eq(tiffinPlans.cadence, "trial"), eq(tiffinSubscriptions.status, "active"), lt(tiffinSubscriptions.startDate, today)));
  if (!rows.length) return 0;
  await ctx.db
    .update(tiffinSubscriptions)
    .set({ status: "cancelled", cancelledAt: ctx.now(), cancelReason: "Trial day finished", nextBillingDate: null, updatedAt: ctx.now() })
    .where(inArray(tiffinSubscriptions.id, rows.map((r) => r.id)));
  return rows.length;
}

/** The whole daily pass: resume paused, roll billing, generate tomorrow, send menus. Safe to run any number of times. */
export async function runDaily(ctx: AppContext): Promise<{ resumed: number; billing: Awaited<ReturnType<typeof rollBilling>>; deliveries: number; menus: number }> {
  const resumed = await autoResume(ctx);
  await finishTrials(ctx);
  const billing = await rollBilling(ctx);
  const tomorrow = addDays(todayOf(ctx), 1);
  const { created } = await generateDeliveries(ctx, tomorrow);
  const menus = await sendMenuNotifications(ctx, tomorrow);
  return { resumed, billing, deliveries: created, menus };
}

// ---------------------------------------------------------------------------
// Merchant: subscribers
// ---------------------------------------------------------------------------
interface AwaitingInfo {
  cents: number;
  since: Date;
  chargeId: string;
  referenceCode: string | null;
}

function subscriberDto(r: { sub: Sub; plan: Plan; route: Route | null; user: Pick<User, "id" | "name" | "phone" | "email"> }, awaiting?: AwaitingInfo): tiffinApi.SubscriberDto {
  return {
    ...subDto(r.sub, r.plan, r.route),
    customer: { id: r.user.id, name: r.user.name, phone: r.user.phone, email: r.user.email },
    awaitingCents: awaiting?.cents ?? 0,
    awaitingSince: awaiting ? awaiting.since.toISOString() : null,
    awaitingChargeId: awaiting?.chargeId ?? null,
    awaitingReferenceCode: awaiting?.referenceCode ?? null,
  };
}

/** Hand-paid charges still to record for these subscriptions: what is owed, since when, and the charge to record against. */
async function awaitingFor(db: DbOrTx, subIds: string[]): Promise<Map<string, AwaitingInfo>> {
  const out = new Map<string, AwaitingInfo>();
  if (!subIds.length) return out;
  const rows = await db.select().from(tiffinCharges).where(and(inArray(tiffinCharges.subscriptionId, subIds), eq(tiffinCharges.status, "awaiting"))).orderBy(asc(tiffinCharges.createdAt));
  for (const c of rows) {
    const e = out.get(c.subscriptionId);
    const owed = Math.max(0, c.amountCents - c.paidCents);
    if (!e) out.set(c.subscriptionId, { cents: owed, since: c.createdAt, chargeId: c.id, referenceCode: c.referenceCode });
    else out.set(c.subscriptionId, { ...e, cents: e.cents + owed, chargeId: c.id, referenceCode: c.referenceCode });
  }
  return out;
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
  if (q.payment) conds.push(eq(tiffinSubscriptions.paymentMethod, q.payment));
  if (q.awaiting === "true") conds.push(or(eq(tiffinSubscriptions.status, "pending"), sql`exists (select 1 from tiffin_charges c where c.subscription_id = ${tiffinSubscriptions.id} and c.status = 'awaiting')`)!);
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
  const awaiting = await awaitingFor(db, page.map((r) => r.sub.id));
  return { items: page.map((r) => subscriberDto(r, awaiting.get(r.sub.id))), nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!.sub) : null };
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
  return subscriberDto(r, (await awaitingFor(db, [r.sub.id])).get(r.sub.id));
}

export const getSubscriber = subscriberById;

/** A subscriber's billing periods, newest first: amount, skip credit, status and paid date. */
export async function listSubscriberCharges(db: DbOrTx, merchantId: string, subId: string): Promise<tiffinApi.SubscriberChargesResponse> {
  const row = await merchantSubRow(db, merchantId, subId);
  const rows = await db.select().from(tiffinCharges).where(and(eq(tiffinCharges.subscriptionId, row.sub.id), eq(tiffinCharges.merchantId, merchantId))).orderBy(desc(tiffinCharges.periodStart)).limit(24);
  return { items: rows.map(chargeDto) };
}

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
  const day = subs.filter((s) => s.plan.daysOfWeek.includes(dow) && isServiceDay(s.plan, s.sub, date));
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
  const totals = { servings: sum("servings"), subscribers: sum("subscribers"), deliveryServings: sum("deliveryServings"), pickupServings: sum("pickupServings"), skippedServings: sum("skippedServings") };
  return { date, plans: list, totals, ...(await kitchenExtras(ctx, merchantId, date, list, plans)) };
}

const DISH_SUFFIX_RE = /\s*\(\d{1,2}\)\s*$/;

/** Today-screen numbers: handed over, route progress, prep list, money waiting, who needs the kitchen, the next cutoff. */
async function kitchenExtras(ctx: AppContext, merchantId: string, date: string, list: tiffinApi.KitchenPlanRow[], plans: Plan[]) {
  const dels = await ctx.db
    .select({ d: tiffinDeliveries, route: { id: tiffinRoutes.id, name: tiffinRoutes.name, driver: tiffinRoutes.driverName }, fulfilment: tiffinSubscriptions.fulfilment, subRoute: tiffinSubscriptions.routeId })
    .from(tiffinDeliveries)
    .innerJoin(tiffinSubscriptions, eq(tiffinSubscriptions.id, tiffinDeliveries.subscriptionId))
    .leftJoin(tiffinRoutes, eq(tiffinRoutes.id, tiffinDeliveries.routeId))
    .where(and(eq(tiffinDeliveries.merchantId, merchantId), eq(tiffinDeliveries.date, date), ne(tiffinDeliveries.status, "skipped")));
  const isDone = (st: string) => st === "delivered" || st === "picked_up";
  const byRoute = new Map<string, { id: string | null; name: string; done: number; total: number; driver: string | null }>();
  for (const r of dels) {
    const key = r.fulfilment === "pickup" ? "pickup" : (r.route?.id ?? "none");
    const e = byRoute.get(key) ?? { id: r.fulfilment === "pickup" ? null : (r.route?.id ?? null), name: r.fulfilment === "pickup" ? "Pickup" : (r.route?.name ?? "No route yet"), done: 0, total: 0, driver: r.route?.driver ?? null };
    e.total++;
    if (isDone(r.d.status)) e.done++;
    byRoute.set(key, e);
  }
  const prepMap = new Map<string, { dish: string; packs: number; pieces: number | null }>();
  for (const row of list) {
    if (row.servings <= 0) continue;
    for (const item of row.menu) {
      const dish = item.name.replace(DISH_SUFFIX_RE, "").trim();
      const per = withPerServing(item).perServing ?? null;
      const e = prepMap.get(dish.toLowerCase()) ?? { dish, packs: 0, pieces: null as number | null };
      e.packs += row.servings;
      if (per) e.pieces = (e.pieces ?? 0) + per * row.servings;
      prepMap.set(dish.toLowerCase(), e);
    }
  }
  const [aw] = await ctx.db
    .select({ n: sql<number>`count(*)::int`, cents: sql<number>`coalesce(sum(${tiffinCharges.amountCents} - ${tiffinCharges.paidCents}), 0)::int` })
    .from(tiffinCharges)
    .where(and(eq(tiffinCharges.merchantId, merchantId), eq(tiffinCharges.status, "awaiting")));
  const [need] = await ctx.db
    .select({
      unrouted: sql<number>`count(*) filter (where ${tiffinSubscriptions.routeId} is null and ${tiffinSubscriptions.fulfilment} = 'delivery' and ${tiffinSubscriptions.status} in ('active','pending'))::int`,
      pastDue: sql<number>`count(*) filter (where ${tiffinSubscriptions.status} = 'past_due')::int`,
    })
    .from(tiffinSubscriptions)
    .where(eq(tiffinSubscriptions.merchantId, merchantId));
  // The soonest skip cutoff still open: the next meal day of each active plan.
  let nextCutoff: { at: Date; date: string } | null = null;
  const now = ctx.now();
  for (const p of plans.filter((x) => x.active && x.cadence !== "trial")) {
    for (let d = todayOf(ctx), i = 0; i < 14; d = addDays(d, 1), i++) {
      if (!p.daysOfWeek.includes(dowOf(d))) continue;
      const at = cutoffAt(p, d);
      if (at.getTime() < now.getTime()) continue;
      if (!nextCutoff || at < nextCutoff.at) nextCutoff = { at, date: d };
      break;
    }
  }
  return {
    delivered: dels.filter((r) => isDone(r.d.status)).length,
    outForDelivery: dels.filter((r) => r.d.status === "out_for_delivery").length,
    routes: [...byRoute.values()].sort((a, b) => (a.id === null ? 1 : 0) - (b.id === null ? 1 : 0) || a.name.localeCompare(b.name)),
    prep: [...prepMap.values()].sort((a, b) => b.packs - a.packs || a.dish.localeCompare(b.dish)),
    awaiting: { count: Number(aw?.n ?? 0), cents: Number(aw?.cents ?? 0) },
    unrouted: Number(need?.unrouted ?? 0),
    pastDue: Number(need?.pastDue ?? 0),
    nextCutoffAt: nextCutoff ? nextCutoff.at.toISOString() : null,
    nextMealDate: nextCutoff?.date ?? null,
  };
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
    e.mrrCents += mrrOf(cadenceOf(sub, plan), sub.priceCents);
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
  const methodRows = await ctx.db
    .select({ method: sql<string>`coalesce(${tiffinCharges.paymentMethod}, 'card')`, cents: sql<number>`coalesce(sum(${tiffinCharges.amountCents}), 0)::int`, n: sql<number>`count(*)::int` })
    .from(tiffinCharges)
    .where(and(eq(tiffinCharges.merchantId, merchantId), eq(tiffinCharges.status, "paid"), gte(tiffinCharges.paidAt, startAt), lt(tiffinCharges.paidAt, endAt)))
    .groupBy(sql`coalesce(${tiffinCharges.paymentMethod}, 'card')`);
  const [owed] = await ctx.db
    .select({
      awaitingCents: sql<number>`coalesce(sum(${tiffinCharges.amountCents} - ${tiffinCharges.paidCents}) filter (where ${tiffinCharges.status} = 'awaiting'), 0)::int`,
      awaitingCount: sql<number>`count(*) filter (where ${tiffinCharges.status} = 'awaiting')::int`,
      inFlight: sql<number>`coalesce(sum(${tiffinCharges.amountCents}) filter (where ${tiffinCharges.status} = 'processing'), 0)::int`,
    })
    .from(tiffinCharges)
    .where(eq(tiffinCharges.merchantId, merchantId));
  const [late] = await ctx.db
    .select({ cents: sql<number>`coalesce(sum(${tiffinCharges.amountCents} - ${tiffinCharges.paidCents}), 0)::int` })
    .from(tiffinCharges)
    .innerJoin(tiffinSubscriptions, eq(tiffinSubscriptions.id, tiffinCharges.subscriptionId))
    .where(and(eq(tiffinCharges.merchantId, merchantId), inArray(tiffinCharges.status, ["awaiting", "failed"]), eq(tiffinSubscriptions.status, "past_due")));
  const methodOrder = tiffinApi.TIFFIN_PAYMENT_METHODS as readonly string[];
  const collectedByMethod = methodRows
    .map((r) => ({ method: r.method as tiffinApi.TiffinPaymentMethod, cents: Number(r.cents), count: Number(r.n) }))
    .sort((a, b) => methodOrder.indexOf(a.method) - methodOrder.indexOf(b.method));
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
    collectedByMethod,
    awaitingCents: Number(owed?.awaitingCents ?? 0),
    awaitingCount: Number(owed?.awaitingCount ?? 0),
    pastDueCents: Number(late?.cents ?? 0),
    inFlightCents: Number(owed?.inFlight ?? 0),
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
    accepted: acceptedMethods(merchant, !!ctx.config.tiffin?.padEnabled),
    etransfer: etransferOffer(merchant),
    taxApplies: merchant.taxRegistered === true,
    certifiedFoodHandler: merchant.foodHandlerBadge && !!merchant.foodHandlerExpiry && merchant.foodHandlerExpiry >= todayOf(ctx),
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

export async function subscribe(ctx: AppContext, userId: string, body: z.output<typeof tiffinApi.subscribeBody>, opts: { merchantId?: string } = {}): Promise<tiffinApi.SubscribeResponse> {
  const [plan] = await ctx.db.select().from(tiffinPlans).where(eq(tiffinPlans.id, body.planId)).limit(1);
  if (!plan || !plan.active || (opts.merchantId && plan.merchantId !== opts.merchantId)) throw notFound("Plan");
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, plan.merchantId)).limit(1);
  if (!merchant || merchant.status === "closed") throw notFound("Plan");
  await requireFeature(ctx.db, merchant, "restaurant.tiffin");
  if (body.servings > plan.maxServings) throw badRequest(`This plan serves up to ${plan.maxServings}`);
  if (body.fulfilment === "delivery" && !plan.deliveryAllowed) throw badRequest("This plan is pickup only");
  if (body.fulfilment === "pickup" && !plan.pickupAllowed) throw badRequest("This plan is delivery only");
  if (body.paymentMethod === "pad" && !ctx.config.tiffin?.padEnabled) throw badRequest("Pre-authorized debit isn't available yet. Pay by card.");
  const manual = isManualMethod(body.paymentMethod);
  if (body.paymentMethod === "etransfer" && !etransferOffer(merchant)) throw badRequest("This kitchen doesn't take e-transfers. Choose another way to pay.");
  if (body.paymentMethod === "cash" && !settingsOf(merchant).cashEnabled) throw badRequest("This kitchen doesn't take cash payments for subscriptions. Choose another way to pay.");
  const today = todayOf(ctx);
  if (body.startDate < today) throw badRequest("The start date is in the past");
  if (body.startDate > addDays(today, 60)) throw badRequest("Start within the next 60 days");
  if (plan.cadence === "trial" && !plan.daysOfWeek.includes(dowOf(body.startDate))) throw badRequest("Pick a day this kitchen cooks for this plan");
  if (body.billingCadence === "monthly" && plan.cadence !== "weekly") throw badRequest("Only a weekly plan can be billed monthly");
  if (body.billingCadence === "monthly" && !manual) throw badRequest("Monthly billing of a weekly plan is for e-transfer and cash");
  // A kitchen that takes e-transfer or cash needs no Stripe account; card and bank debit do.
  if (!manual && !stripeReady(merchant)) throw conflict("This kitchen can't take payments yet");
  const [dupe] = await ctx.db
    .select({ id: tiffinSubscriptions.id })
    .from(tiffinSubscriptions)
    .where(and(eq(tiffinSubscriptions.userId, userId), eq(tiffinSubscriptions.planId, plan.id), ne(tiffinSubscriptions.status, "cancelled")))
    .limit(1);
  if (dupe) throw conflict("You already have this plan. Manage it from your subscriptions.");

  const now = ctx.now();
  const billingCadence = plan.cadence === "weekly" && body.billingCadence === "monthly" ? "monthly" : null;
  const price = billingCadence ? monthlyOfWeekly(priceFor(plan, body.servings, body.fulfilment)) : priceFor(plan, body.servings, body.fulfilment);
  const periodEnd = periodEndFor(billingCadence ?? plan.cadence, body.startDate);
  if (body.name) await ctx.db.update(users).set({ name: body.name }).where(and(eq(users.id, userId), or(isNull(users.name), eq(users.name, ""))));
  let [sub] = await ctx.db
    .insert(tiffinSubscriptions)
    .values({
      merchantId: merchant.id,
      planId: plan.id,
      userId,
      // Hand-paid subscribers wait for the kitchen to record the first payment, unless the kitchen starts them on trust.
      status: manual && settingsOf(merchant).startOnTrust ? "active" : "pending",
      servings: body.servings,
      fulfilment: body.fulfilment,
      address: body.fulfilment === "delivery" ? (body.address ?? null) : null,
      addressNotes: body.addressNotes ?? null,
      postalCode: body.postalCode ? body.postalCode.toUpperCase() : null,
      dietaryNotes: body.dietaryNotes ?? null,
      startDate: body.startDate,
      currentPeriodStart: body.startDate,
      currentPeriodEnd: periodEnd,
      nextBillingDate: plan.cadence === "trial" ? null : addDays(periodEnd, 1),
      priceCents: price,
      paymentMethod: body.paymentMethod,
      billingCadence,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  sub = await autoAssignRoute(ctx.db, sub!);
  const { charge } = await ensureCharge(ctx, sub, plan, body.startDate, true);
  let payment: tiffinApi.PaymentIntentRef | null;
  try {
    payment = manual ? null : await startPayment(ctx, merchant, sub, charge);
  } catch (err) {
    await ctx.db.delete(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, sub.id));
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, "payment_error", "We couldn't start the payment. Please try again.", { cause: (err as Error).message });
  }
  const row = (await loadSubRow(ctx.db, sub.id))!;
  const [fresh] = await ctx.db.select().from(tiffinCharges).where(eq(tiffinCharges.id, charge.id)).limit(1);
  if (manual && fresh!.amountCents <= 0) await settleCharge(ctx, fresh!.id, null);
  else if (manual) await notifyManualDue(ctx, merchant, row.sub, row.plan, fresh!, "payment_due");
  const [settledCharge] = await ctx.db.select().from(tiffinCharges).where(eq(tiffinCharges.id, charge.id)).limit(1);
  const [freshSub] = await ctx.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, row.sub.id)).limit(1);
  return { subscription: subDto(freshSub ?? row.sub, row.plan, row.route), charge: chargeDto(settledCharge!), payment, manual: manual ? manualFor(merchant, row.sub.paymentMethod, settledCharge!) : null };
}

/**
 * The kitchen adds a regular who phones in: finds or creates the customer by phone, then subscribes them the way they would
 * themselves (hand-paid: they get the e-transfer details by text, the kitchen records the money). The kitchen's own people
 * can start someone before their first payment lands; that is the "start on trust" setting on the payments page.
 */
export async function addSubscriber(ctx: AppContext, merchantId: string, body: z.output<typeof tiffinApi.addSubscriberBody>): Promise<tiffinApi.SubscribeResponse> {
  const user = await findOrCreateUserByPhone(ctx, body.phone, body.name);
  if (!user) throw badRequest("That phone number can't be used");
  const { name: _n, phone: _p, ...rest } = body;
  return subscribe(ctx, user.id, { ...rest, name: body.name }, { merchantId });
}

/** What the customer needs to pay by hand: the shop's e-transfer email and the charge's reference code (cash gets plain words). */
function manualFor(merchant: Pick<Merchant, "paymentSettings" | "stripeAccountId" | "stripeChargesEnabled" | "name">, method: string, charge: Pick<Charge, "amountCents" | "referenceCode" | "status" | "paidCents">): paymentsManualApi.ManualInstructions | null {
  if (charge.status !== "awaiting" || !charge.referenceCode) return null;
  const due = Math.max(0, charge.amountCents - charge.paidCents);
  if (method === "cash") return { email: "", amountCents: due, referenceCode: charge.referenceCode, instructions: `Pay ${merchant.name} in cash and mention reference ${charge.referenceCode}.` };
  return manualInstructions(merchant, due, charge.referenceCode);
}

/** Tell the customer how to pay a hand-paid charge (once per charge; reminders come from remindManualCharges). */
async function notifyManualDue(ctx: AppContext, merchant: Merchant, sub: Sub, plan: Plan, charge: Charge, event: "payment_due" | "renewal_due"): Promise<void> {
  const how = manualFor(merchant, sub.paymentMethod, charge);
  if (!how) return;
  const where = sub.paymentMethod === "cash" ? how.instructions : `Send an Interac e-transfer of ${money(how.amountCents)} to ${how.email} and put ${how.referenceCode} in the message.`;
  await notify(ctx, sub.userId, sub.merchantId, "tiffin_update", `How to pay for your tiffin`, `${merchant.name}, ${plan.name} from ${charge.periodStart}: ${where}`, { subscriptionId: sub.id, chargeId: charge.id, event, referenceCode: how.referenceCode });
}

type MyMerchant = Pick<Merchant, "id" | "name" | "slug" | "logoUrl" | "paymentSettings" | "stripeAccountId" | "stripeChargesEnabled">;
async function myDto(ctx: AppContext, row: SubRow, merchant: MyMerchant): Promise<tiffinApi.MySubscriptionDto> {
  const today = todayOf(ctx);
  const [latest] = await ctx.db.select().from(tiffinCharges).where(eq(tiffinCharges.subscriptionId, row.sub.id)).orderBy(desc(tiffinCharges.periodStart)).limit(1);
  const skips = await ctx.db.select({ date: tiffinSkips.date }).from(tiffinSkips).where(and(eq(tiffinSkips.subscriptionId, row.sub.id), gte(tiffinSkips.date, today))).orderBy(asc(tiffinSkips.date));
  const upcoming = await upcomingFor(ctx, [row], 14);
  const next = upcoming.find((u) => u.status === "scheduled" || u.status === "out_for_delivery");
  return {
    ...subDto(row.sub, row.plan, row.route),
    cardOnFile: cardOnFileOf(row.sub),
    merchant: { id: merchant.id, name: merchant.name, slug: merchant.slug, logoUrl: merchant.logoUrl },
    nextDelivery: next ? { date: next.date, status: next.status as tiffinApi.TiffinDeliveryStatus } : null,
    latestCharge: latest ? chargeDto(latest) : null,
    skips: skips.map((s) => s.date),
    manual: latest && isManualMethod(row.sub.paymentMethod) ? manualFor(merchant, row.sub.paymentMethod, latest) : null,
  };
}

async function myRows(ctx: AppContext, userId: string, extra: ReturnType<typeof and>[] = []) {
  const rows = await ctx.db
    .select({ sub: tiffinSubscriptions, plan: tiffinPlans, route: tiffinRoutes, merchant: { id: merchants.id, name: merchants.name, slug: merchants.slug, logoUrl: merchants.logoUrl, paymentSettings: merchants.paymentSettings, stripeAccountId: merchants.stripeAccountId, stripeChargesEnabled: merchants.stripeChargesEnabled } })
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
        // A skipped day stays changeable until the cutoff: the customer can put it back (Undo).
        canSkip: sub.status === "active" && (status === "scheduled" || status === "skipped") && ctx.now().getTime() <= cutoff.getTime(),
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

// ---------------------------------------------------------------------------
// Hand-recorded payments (e-transfer, cash, cheque): record, void, awaiting list, reminders
// ---------------------------------------------------------------------------
async function loadMerchantCharge(db: DbOrTx, merchantId: string, chargeId: string): Promise<Charge> {
  const [c] = await db.select().from(tiffinCharges).where(and(eq(tiffinCharges.id, chargeId), eq(tiffinCharges.merchantId, merchantId))).limit(1);
  if (!c) throw notFound("Charge");
  return c;
}

/**
 * The kitchen marks money received. Rules: only awaiting / pending / failed charges; a charge that is already paid answers
 * 409 with the existing record (no double pay). Paying less than is due keeps the charge awaiting with the remainder;
 * paying more is stored and flagged (overpaidCents), never credited automatically. Full payment sets the charge paid
 * (paidAt = the date received), activates a pending or past-due subscription and sends one receipt. No platform fee.
 */
export async function recordPayment(ctx: AppContext, staff: StaffContext, chargeId: string, body: z.output<typeof paymentsManualApi.recordPaymentBody>): Promise<tiffinApi.ChargeDto> {
  assertNotFuture(body.receivedOn, todayFor(ctx, staff.merchant));
  const merchantId = staff.merchant.id;
  const outcome = await ctx.db.transaction(async (tx) => {
    const [c] = await tx.select().from(tiffinCharges).where(and(eq(tiffinCharges.id, chargeId), eq(tiffinCharges.merchantId, merchantId))).for("update").limit(1);
    if (!c) throw notFound("Charge");
    if (c.status === "paid" || c.status === "refunded") {
      const existing = (await liveLedger(tx, "tiffin_charge", c.id)).at(-1);
      throw new HttpError(409, "already_paid", "This charge is already marked paid.", { chargeId: c.id, payment: existing ? { id: existing.id, method: existing.method, amountCents: existing.amountCents, receivedOn: existing.receivedOn } : null });
    }
    if (c.status === "processing") throw conflict("A bank debit for this charge is still processing. Wait for it to clear.");
    const ledger = await addLedger(ctx, staff, tx, { subjectType: "tiffin_charge", subjectId: c.id, body });
    const paidCents = c.paidCents + ledger.amountCents;
    const full = paidCents >= c.amountCents;
    const [row] = await tx
      .update(tiffinCharges)
      .set(
        full
          ? { status: "paid", paidAt: new Date(`${body.receivedOn}T12:00:00Z`), paymentMethod: body.method, receivedOn: body.receivedOn, paidCents }
          : { status: "awaiting", paymentMethod: body.method, receivedOn: body.receivedOn, paidCents },
      )
      .where(eq(tiffinCharges.id, c.id))
      .returning();
    return { charge: row!, full };
  });
  const { charge, full } = outcome;
  const row = await loadSubRow(ctx.db, charge.subscriptionId);
  if (row && full) await advanceSubscription(ctx, charge, row.sub);
  if (row && body.sendReceipt && row.sub.status !== "cancelled") {
    const left = Math.max(0, charge.amountCents - charge.paidCents);
    await notify(ctx, row.sub.userId, row.sub.merchantId, "tiffin_update", full ? "Payment received" : "Part payment received", `${staff.merchant.name} received ${receiptLine(body.amountCents, body.method, body.receivedOn)} for ${row.plan.name}.${full ? " Thank you." : ` ${money(left)} is still due.`}`, {
      subscriptionId: row.sub.id,
      chargeId: charge.id,
      event: "payment_receipt",
    });
  }
  return chargeDto(charge);
}

/** Undo a recorded payment (a mistake): the ledger row is voided, the charge reopens as awaiting. */
export async function voidPayment(ctx: AppContext, staff: StaffContext, chargeId: string, body: z.output<typeof paymentsManualApi.voidPaymentBody>): Promise<tiffinApi.ChargeDto> {
  const charge = await loadMerchantCharge(ctx.db, staff.merchant.id, chargeId);
  await voidLedger(ctx, staff, "tiffin_charge", charge.id, body.reason, body.paymentId);
  const live = await liveLedger(ctx.db, "tiffin_charge", charge.id);
  const paidCents = live.reduce((s, l) => s + l.amountCents, 0);
  const last = live.at(-1);
  const wasPaid = charge.status === "paid";
  const [row] = await ctx.db
    .update(tiffinCharges)
    .set({ status: paidCents >= charge.amountCents ? "paid" : "awaiting", paidCents, paidAt: paidCents >= charge.amountCents ? charge.paidAt : null, receivedOn: last?.receivedOn ?? null, paymentMethod: last?.method ?? charge.paymentMethod })
    .where(eq(tiffinCharges.id, charge.id))
    .returning();
  // A subscription that only became active because of this payment goes back to waiting (unless the kitchen starts people on trust).
  if (wasPaid && row!.status === "awaiting") {
    const sub = await loadSubRow(ctx.db, charge.subscriptionId);
    const [other] = await ctx.db.select({ id: tiffinCharges.id }).from(tiffinCharges).where(and(eq(tiffinCharges.subscriptionId, charge.subscriptionId), eq(tiffinCharges.status, "paid"))).limit(1);
    if (sub && sub.sub.status === "active" && !other && !settingsOf(staff.merchant).startOnTrust) await ctx.db.update(tiffinSubscriptions).set({ status: "pending", updatedAt: ctx.now() }).where(eq(tiffinSubscriptions.id, sub.sub.id));
  }
  return chargeDto(row!);
}

export async function awaitingList(ctx: AppContext, merchantId: string): Promise<paymentsManualApi.AwaitingResponse> {
  const rows = await ctx.db
    .select({ c: tiffinCharges, plan: tiffinPlans.name, customer: users.name })
    .from(tiffinCharges)
    .innerJoin(tiffinSubscriptions, eq(tiffinSubscriptions.id, tiffinCharges.subscriptionId))
    .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
    .innerJoin(users, eq(users.id, tiffinSubscriptions.userId))
    .where(and(eq(tiffinCharges.merchantId, merchantId), eq(tiffinCharges.status, "awaiting"), ne(tiffinSubscriptions.status, "cancelled")))
    .orderBy(asc(tiffinCharges.createdAt));
  const today = todayOf(ctx);
  const items = rows.map(({ c, plan, customer }) => ({
    chargeId: c.id,
    subscriptionId: c.subscriptionId,
    customerName: customer,
    planName: plan,
    referenceCode: c.referenceCode,
    amountCents: c.amountCents,
    remainingCents: Math.max(0, c.amountCents - c.paidCents),
    periodStart: c.periodStart,
    since: c.createdAt.toISOString(),
    ageDays: Math.max(0, Math.round((parseYmd(today).getTime() - parseYmd(localDate(c.createdAt, TZ)).getTime()) / DAY_MS)),
  }));
  return { items, totalCents: items.reduce((s, i) => s + i.remainingCents, 0) };
}

/**
 * Daily pass over hand-paid charges still awaiting: a reminder on day 1 and day 3 (skipped between 21:00 and 08:00, the next
 * run sends it), then after the kitchen's grace days an active subscription goes past due (deliveries stop, as for a failed card).
 * Idempotent: reminderStage records what was sent.
 */
export async function remindManualCharges(ctx: AppContext): Promise<{ reminded: number; pastDue: number }> {
  const rows = await ctx.db
    .select({ c: tiffinCharges, sub: tiffinSubscriptions, plan: tiffinPlans, merchant: merchants })
    .from(tiffinCharges)
    .innerJoin(tiffinSubscriptions, eq(tiffinSubscriptions.id, tiffinCharges.subscriptionId))
    .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
    .innerJoin(merchants, eq(merchants.id, tiffinCharges.merchantId))
    .where(and(eq(tiffinCharges.status, "awaiting"), inArray(tiffinSubscriptions.status, ["pending", "active", "paused", "past_due"])));
  const today = todayOf(ctx);
  let reminded = 0;
  let pastDue = 0;
  for (const { c, sub, plan, merchant } of rows) {
    try {
      const age = Math.round((parseYmd(today).getTime() - parseYmd(localDate(c.createdAt, TZ)).getTime()) / DAY_MS);
      const stage = age >= 3 ? 3 : age >= 1 ? 1 : 0;
      if (stage > c.reminderStage && !inQuietHours(ctx.now(), merchant.timezone || TZ)) {
        const how = manualFor(merchant, sub.paymentMethod, c);
        if (how) {
          const where = sub.paymentMethod === "cash" ? how.instructions : `Send ${money(how.amountCents)} by e-transfer to ${how.email} with ${how.referenceCode} in the message.`;
          await notify(ctx, sub.userId, sub.merchantId, "tiffin_update", stage === 3 ? "Your tiffin payment is still due" : "A reminder to pay for your tiffin", `${merchant.name}, ${plan.name}: ${where}`, { subscriptionId: sub.id, chargeId: c.id, event: "payment_reminder", referenceCode: how.referenceCode, stage });
          await ctx.db.update(tiffinCharges).set({ reminderStage: stage }).where(eq(tiffinCharges.id, c.id));
          reminded++;
        }
      }
      if (sub.status === "active" && age >= settingsOf(merchant).graceDays) {
        await ctx.db.update(tiffinSubscriptions).set({ status: "past_due", updatedAt: ctx.now() }).where(and(eq(tiffinSubscriptions.id, sub.id), eq(tiffinSubscriptions.status, "active")));
        pastDue++;
        await notify(ctx, sub.userId, sub.merchantId, "tiffin_update", "Your tiffin is on hold", `${merchant.name} hasn't received your payment for ${plan.name}, so meals are on hold. Pay and they'll start again once it's recorded.`, { subscriptionId: sub.id, chargeId: c.id, event: "payment_failed" });
      }
    } catch (err) {
      if (ctx.config.env !== "test") console.error("[tiffin remind]", c.id, err);
    }
  }
  return { reminded, pastDue };
}
