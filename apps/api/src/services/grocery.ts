/**
 * Grocers and halal butchers (docs/research/grocers.md, docs/engineering/api/grocery.md):
 *
 *  - Weekly flyer (grocery.flyer): deals with a price per unit, tied to a season from the grocer calendar; the flyer as text for a
 *    WhatsApp group; a draft text to members who agreed.
 *  - Butcher counter (grocery.counter_preorders): the weigh-in that sets the final price of a pre-order sold by weight, and the Eid
 *    al-Adha plan (animals per pick-up day) built on the same caps, lead times and deposits as the restaurant pre-orders.
 *  - Pantry reminders (grocery.pantry_reminders): bulk staples a household buys every few weeks. The cashier taps what was bought,
 *    we learn each household's own gap, and a text goes out a few days before they run out, only to people who asked.
 *
 * Money is integer cents, weights are grams, times are stored UTC and shown in the shop's zone. Points only move through the ledger.
 */
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import {
  catalogItems,
  groceryDeals,
  merchantMembers,
  merchants,
  messageDeliveries,
  orderItems,
  orders,
  pantryEntries,
  pantryItems,
  pantryReminders,
  users,
} from "@ll/db";
import {
  addDays,
  daysBetween,
  getFestival,
  groceryApi,
  isGrocerSeasonId,
  normalizeLocale,
  pantryDueAt,
  pantryInterval,
  pantryReminderDue,
  pantryRemindAt,
  per100gCents,
  resolveFestivalDates,
  t,
  upcomingGrocerSeasons,
  weighedLineCents,
  type GrocerSeason,
} from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { badRequest, conflict, HttpError, notFound } from "../lib/errors.js";
import { writeAudit } from "./admin-audit.js";
import { notifyCustomer } from "./commerceShared.js";
import { isFeatureOn, requireAnyFeature, requireFeature, PREORDER_FEATURES } from "./features.js";
import { createCampaign, localDate, reserveSmsCredits, smsAllowance } from "./messaging.js";
import { inQuietHours } from "./notifications.js";
import { isSuppressed, optedOutSet, sendSms } from "./opt-out.js";
import { lineCents, loadOrderDto, taxableBaseCents } from "./orders.js";
import { localMidnightUtc, potRowsOnDay, saveRules, waitlistCounts } from "./preorderPlanning.js";
import { computeTax, merchantProvince } from "./tax.js";

type Merchant = typeof merchants.$inferSelect;
type DealRow = typeof groceryDeals.$inferSelect;
const DAY_MS = 86_400_000;

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const shortDate = (key: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${key}T12:00:00Z`));

// ===========================================================================
// Weekly flyer
// ===========================================================================
export function dealDto(r: DealRow, today: string): groceryApi.DealDto {
  const unit = r.priceUnit as groceryApi.PriceUnit;
  return {
    id: r.id,
    title: r.title,
    priceCents: r.priceCents,
    priceUnit: unit,
    packSizeG: r.packSizeG,
    wasPriceCents: r.wasPriceCents,
    per100gCents: per100gCents(r.priceCents, unit, r.packSizeG),
    memberOnly: r.memberOnly,
    limitPerCustomer: r.limitPerCustomer,
    seasonId: r.seasonId,
    startsOn: r.startsOn,
    endsOn: r.endsOn,
    note: r.note,
    sortOrder: r.sortOrder,
    active: r.active,
    state: r.endsOn < today ? "ended" : r.startsOn > today ? "upcoming" : "live",
  };
}

const priceLabel = (d: Pick<groceryApi.DealDto, "priceCents" | "priceUnit">) => `${money(d.priceCents)}${d.priceUnit === "each" ? "" : `/${d.priceUnit}`}`;

/** The flyer as plain text for a WhatsApp group or status: one line per deal, names the shop and the dates. */
export function flyerText(ctx: AppContext, merchant: Pick<Merchant, "name" | "slug">, deals: groceryApi.DealDto[], seasonName: string | null): string {
  const live = deals.filter((d) => d.state === "live" && d.active);
  if (!live.length) return "";
  const from = live.map((d) => d.startsOn).sort()[0]!;
  const to = live.map((d) => d.endsOn).sort().at(-1)!;
  const head = `${seasonName ? `${seasonName} stock-up at` : "This week at"} ${merchant.name} (${shortDate(from)} to ${shortDate(to)})`;
  const lines = live.map((d) => {
    const bits = [priceLabel(d)];
    if (d.wasPriceCents) bits.push(`was ${money(d.wasPriceCents)}`);
    if (d.memberOnly) bits.push("members");
    if (d.limitPerCustomer) bits.push(`limit ${d.limitPerCustomer}`);
    return `• ${d.title}: ${bits[0]}${bits.length > 1 ? ` (${bits.slice(1).join(", ")})` : ""}`;
  });
  return [head, ...lines, `More: ${ctx.config.publicWebUrl.replace(/\/$/, "")}/shops/${merchant.slug}`].join("\n");
}

async function seasonNameFor(deals: groceryApi.DealDto[], seasons: GrocerSeason[]): Promise<string | null> {
  const ids = new Set(deals.filter((d) => d.state === "live" && d.seasonId).map((d) => d.seasonId!));
  if (ids.size !== 1) return null;
  const id = [...ids][0]!;
  return seasons.find((s) => s.id === id)?.name ?? getFestival(id)?.name ?? null;
}

async function textableCount(ctx: AppContext, merchantId: string): Promise<number> {
  const [r] = await ctx.db
    .select({ n: count() })
    .from(merchantMembers)
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .where(and(eq(merchantMembers.merchantId, merchantId), isNotNull(merchantMembers.marketingConsentAt), eq(merchantMembers.muted, false), isNotNull(users.phone), sql`${users.deletedAt} is null`));
  return r?.n ?? 0;
}

export async function listDeals(ctx: AppContext, merchant: Merchant): Promise<groceryApi.DealsResponse> {
  await requireFeature(ctx.db, merchant, "grocery.flyer");
  const today = localDate(ctx.now(), merchant.timezone);
  const rows = await ctx.db.select().from(groceryDeals).where(eq(groceryDeals.merchantId, merchant.id)).orderBy(desc(groceryDeals.endsOn), asc(groceryDeals.sortOrder), asc(groceryDeals.title));
  // Ended deals older than three weeks drop off the list; they stay in the database.
  const cutoff = addDays(today, -21);
  const deals = rows.filter((r) => r.endsOn >= cutoff).map((r) => dealDto(r, today));
  const seasons = upcomingGrocerSeasons(today, 120, merchant.festivalOverrides);
  return { today, deals, seasons, whatsappText: flyerText(ctx, merchant, deals, await seasonNameFor(deals, seasons)), textable: await textableCount(ctx, merchant.id) };
}

async function checkSeason(id: string | null | undefined) {
  if (id && !isGrocerSeasonId(id)) throw badRequest("Pick a season from the list");
}

export async function createDeal(ctx: AppContext, merchant: Merchant, actorUserId: string, body: z.output<typeof groceryApi.dealBody>): Promise<groceryApi.DealDto> {
  await requireFeature(ctx.db, merchant, "grocery.flyer");
  await checkSeason(body.seasonId);
  const open = await ctx.db.select({ n: count() }).from(groceryDeals).where(and(eq(groceryDeals.merchantId, merchant.id), gte(groceryDeals.endsOn, localDate(ctx.now(), merchant.timezone))));
  if ((open[0]?.n ?? 0) >= 60) throw badRequest("A flyer holds up to 60 deals. End or delete some first.");
  const [row] = await ctx.db
    .insert(groceryDeals)
    .values({
      merchantId: merchant.id,
      title: body.title,
      priceCents: body.priceCents,
      priceUnit: body.priceUnit,
      packSizeG: body.packSizeG ?? null,
      wasPriceCents: body.wasPriceCents ?? null,
      memberOnly: body.memberOnly,
      limitPerCustomer: body.limitPerCustomer ?? null,
      seasonId: body.seasonId ?? null,
      startsOn: body.startsOn,
      endsOn: body.endsOn,
      note: body.note ?? null,
      sortOrder: body.sortOrder,
      active: body.active,
    })
    .returning();
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "grocery.deal_created", entity: "grocery_deal", entityId: row!.id, data: { title: body.title, priceCents: body.priceCents } });
  return dealDto(row!, localDate(ctx.now(), merchant.timezone));
}

export async function updateDeal(ctx: AppContext, merchant: Merchant, actorUserId: string, id: string, body: z.output<typeof groceryApi.updateDealBody>): Promise<groceryApi.DealDto> {
  await requireFeature(ctx.db, merchant, "grocery.flyer");
  await checkSeason(body.seasonId);
  const [cur] = await ctx.db.select().from(groceryDeals).where(and(eq(groceryDeals.id, id), eq(groceryDeals.merchantId, merchant.id))).limit(1);
  if (!cur) throw notFound("Deal");
  const next = { ...cur, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) } as DealRow;
  if (next.endsOn < next.startsOn) throw badRequest("The deal ends before it starts");
  if (next.wasPriceCents && next.wasPriceCents <= next.priceCents) throw badRequest("The old price should be higher than the deal price");
  const [row] = await ctx.db.update(groceryDeals).set({ ...body, updatedAt: ctx.now() }).where(eq(groceryDeals.id, id)).returning();
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "grocery.deal_updated", entity: "grocery_deal", entityId: id, data: body });
  return dealDto(row!, localDate(ctx.now(), merchant.timezone));
}

export async function deleteDeal(ctx: AppContext, merchant: Merchant, actorUserId: string, id: string): Promise<{ ok: true }> {
  await requireFeature(ctx.db, merchant, "grocery.flyer");
  const [row] = await ctx.db.delete(groceryDeals).where(and(eq(groceryDeals.id, id), eq(groceryDeals.merchantId, merchant.id))).returning({ id: groceryDeals.id });
  if (!row) throw notFound("Deal");
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "grocery.deal_deleted", entity: "grocery_deal", entityId: id });
  return { ok: true };
}

/** Public flyer page: live deals today. A shop without the feature has no flyer (404, not a paywall). */
export async function publicFlyer(ctx: AppContext, merchant: Merchant): Promise<groceryApi.PublicFlyerResponse> {
  if (!(await isFeatureOn(ctx.db, merchant, "grocery.flyer"))) throw notFound("Flyer");
  const today = localDate(ctx.now(), merchant.timezone);
  const rows = await ctx.db
    .select()
    .from(groceryDeals)
    .where(and(eq(groceryDeals.merchantId, merchant.id), eq(groceryDeals.active, true), lte(groceryDeals.startsOn, today), gte(groceryDeals.endsOn, today)))
    .orderBy(asc(groceryDeals.sortOrder), asc(groceryDeals.title));
  const deals = rows.map((r) => dealDto(r, today));
  const seasons = upcomingGrocerSeasons(addDays(today, -10), 130, merchant.festivalOverrides);
  return {
    shop: { name: merchant.name, slug: merchant.slug },
    today,
    seasonName: await seasonNameFor(deals, seasons),
    validFrom: deals.length ? deals.map((d) => d.startsOn).sort()[0]! : null,
    validTo: deals.length ? deals.map((d) => d.endsOn).sort().at(-1)! : null,
    deals: deals.map(({ active: _a, state: _s, sortOrder: _o, ...d }) => d),
  };
}

/** "Text members": a draft in Messages (CASL consent, quiet hours, STOP line and credits all apply when it is sent). */
export async function draftFlyerText(ctx: AppContext, merchant: Merchant, actorUserId: string): Promise<groceryApi.FlyerDraftResponse> {
  await requireFeature(ctx.db, merchant, "grocery.flyer");
  const flyer = await listDeals(ctx, merchant);
  if (!flyer.whatsappText) throw badRequest("Add a deal that is running today first.");
  const live = flyer.deals.filter((d) => d.state === "live" && d.active).slice(0, 4);
  const body = `${merchant.name}: ${live.map((d) => `${d.title} ${priceLabel(d)}`).join(", ")}. See the full flyer: ${ctx.config.publicWebUrl.replace(/\/$/, "")}/shops/${merchant.slug}`;
  const m = await createCampaign(ctx, merchant, actorUserId, { channel: "sms", subject: null, body, segment: { kind: "all" }, sendNow: false });
  return { messageId: m.id, audience: flyer.textable };
}

// ===========================================================================
// Butcher counter: weigh-in
// ===========================================================================
/**
 * The scale sets the final price. Each weighed line gets its real price (price per kg or lb at order time times the grams), the
 * order's subtotal, tax and total follow, and the customer owes the new total less the deposit. Zero-rated lines (raw meat, flour,
 * rice) carry no GST/HST. Allowed until the order is paid in full or closed; weigh again to correct a slip.
 */
export async function weighOrder(ctx: AppContext, staff: StaffContext, orderId: string, body: z.output<typeof groceryApi.weighBody>): Promise<groceryApi.WeighResponse> {
  const merchant = staff.merchant;
  await requireAnyFeature(ctx.db, merchant, PREORDER_FEATURES);
  const result = await ctx.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.merchantId, merchant.id))).for("update").limit(1);
    if (!order) throw notFound("Order");
    if (order.status === "cancelled" || order.status === "refunded" || order.status === "picked_up") throw conflict("This order is closed, so it can't be weighed again.");
    if (order.paymentStatus === "paid") throw conflict("This order is already paid in full. Refund or adjust it from Orders.");
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const byId = new Map(items.map((i) => [i.id, i]));
    const grams = new Map<string, number>();
    for (const l of body.lines) {
      const it = byId.get(l.orderItemId);
      if (!it) throw notFound("Order line");
      if (!it.weightUnit || !it.perUnitCents) throw badRequest(`${it.name} is not sold by weight`);
      grams.set(it.id, l.actualWeightG);
    }
    const next = items.map((i) => (grams.has(i.id) ? { ...i, actualWeightG: grams.get(i.id)!, weighedCents: weighedLineCents(i.perUnitCents!, i.weightUnit!, grams.get(i.id)!) } : i));
    const subtotal = next.reduce((s, i) => s + lineCents(i), 0);
    const tax = computeTax(taxableBaseCents(next.map((i) => ({ lineTotalCents: lineCents(i), taxable: i.taxable })), order.discountCents), await merchantProvince(tx, merchant));
    const total = subtotal - order.discountCents + tax.taxCents + order.tipCents + order.customerFeeCents;
    for (const i of next) if (grams.has(i.id)) await tx.update(orderItems).set({ actualWeightG: i.actualWeightG, weighedCents: i.weighedCents }).where(eq(orderItems.id, i.id));
    const now = ctx.now();
    const [updated] = await tx.update(orders).set({ subtotalCents: subtotal, taxCents: tax.taxCents, totalCents: total, weighedAt: now, updatedAt: now }).where(eq(orders.id, order.id)).returning();
    await writeAudit(tx, { actorUserId: staff.user.id, merchantId: merchant.id, action: "grocery.weighed", entity: "order", entityId: order.id, data: { lines: body.lines, totalCents: total } });
    return { order: updated!, items: next };
  });
  const o = await loadOrderDto(ctx.db, result.order, true);
  // Tell the customer the real price, in their language. Push only: weighing is not worth a text.
  const [u] = await ctx.db.select({ locale: users.locale }).from(users).where(eq(users.id, result.order.userId)).limit(1);
  const locale = normalizeLocale(u?.locale) ?? "en";
  const weighed = result.items.filter((i) => i.actualWeightG != null);
  const grams = weighed.reduce((s, i) => s + (i.actualWeightG ?? 0), 0);
  const unit = weighed[0]?.weightUnit ?? "kg";
  void notifyCustomer(ctx, {
    userId: result.order.userId,
    merchantId: merchant.id,
    title: merchant.name,
    body: t(locale, "gr.msg.weighed", { shop: merchant.name, n: result.order.number, weight: `${Math.round((grams / (unit === "kg" ? 1000 : 453.59237)) * 100) / 100} ${unit}`, total: money(o.totalCents), balance: money(o.balanceDueCents) }),
    sms: false,
    data: { type: "order_status", orderId: result.order.id, status: result.order.status },
  }).catch(() => undefined);
  return {
    orderId: o.id,
    subtotalCents: o.subtotalCents,
    taxCents: o.taxCents,
    totalCents: o.totalCents,
    depositCents: o.depositCents,
    balanceDueCents: o.balanceDueCents,
    lines: o.items
      .filter((i) => i.actualWeightG != null)
      .map((i) => ({ orderItemId: i.id, name: i.name, actualWeightG: i.actualWeightG!, lineTotalCents: i.lineTotalCents, estimatedCents: i.unitPriceCents * i.quantity })),
  };
}

// ===========================================================================
// Butcher counter: Eid al-Adha plan
// ===========================================================================
const EID_LABEL = "Eid al-Adha day";

/** The year of the next Eid al-Adha that has not finished, or the one asked for. */
function eidYear(merchant: Merchant, today: string, asked?: number): number {
  if (asked) return asked;
  const f = getFestival("eid_al_adha")!;
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1, year + 2]) {
    const r = resolveFestivalDates(f, String(y), merchant.festivalOverrides);
    if (r && addDays(r.start, 3) >= today) return y;
  }
  return year;
}

export async function getEidPlan(ctx: AppContext, merchant: Merchant, asked?: number): Promise<groceryApi.EidPlanResponse> {
  await requireAnyFeature(ctx.db, merchant, PREORDER_FEATURES);
  const today = localDate(ctx.now(), merchant.timezone);
  const year = eidYear(merchant, today, asked);
  const f = getFestival("eid_al_adha")!;
  const r = resolveFestivalDates(f, String(year), merchant.festivalOverrides);
  if (!r) throw badRequest(`The calendar has no Eid al-Adha date for ${year}`);
  const overrides = (merchant.preorderOverrides ?? []).filter((o) => o.label.startsWith(EID_LABEL) && o.from.startsWith(`${year}-`)).sort((a, b) => a.from.localeCompare(b.from));
  const dates = overrides.length ? overrides.map((o) => o.from) : [0, 1, 2].map((n) => addDays(r.start, n));
  const waiting = await waitlistCounts(ctx.db, merchant.id, dates[0]!, dates.at(-1)!);
  const days: groceryApi.EidPlanDay[] = [];
  for (const [i, date] of dates.entries()) {
    const booked = (await potRowsOnDay(ctx.db, merchant, date)).reduce((s, x) => s + x.quantity, 0);
    days.push({ date, label: `Day ${i + 1}`, cap: overrides.find((o) => o.from === date)?.cap ?? null, booked, waiting: waiting.get(date) ?? 0 });
  }
  const items = await ctx.db.select().from(catalogItems).where(and(eq(catalogItems.merchantId, merchant.id), eq(catalogItems.preorderOnly, true), eq(catalogItems.available, true))).orderBy(asc(catalogItems.sortOrder), asc(catalogItems.name));
  return {
    year,
    start: r.start,
    calendarStart: r.calendarStart,
    moved: r.moved,
    bookingsOpen: addDays(r.start, -56),
    leadHours: overrides[0]?.leadHours ?? null,
    days,
    items: items.map((i) => ({ id: i.id, name: i.name, priceCents: i.priceCents, depositBps: i.depositBps, weightUnit: i.weightUnit ?? null })),
  };
}

/** Sets the animals per pick-up day for Eid (one date rule per day, on the shop's pre-order rules) and the notice they need. */
export async function saveEidPlan(ctx: AppContext, staff: StaffContext, body: z.output<typeof groceryApi.eidPlanBody>): Promise<groceryApi.EidPlanResponse> {
  const merchant = staff.merchant;
  await requireAnyFeature(ctx.db, merchant, PREORDER_FEATURES);
  const f = getFestival("eid_al_adha")!;
  const r = resolveFestivalDates(f, String(body.year), merchant.festivalOverrides);
  if (!r) throw badRequest(`The calendar has no Eid al-Adha date for ${body.year}`);
  const keep = (merchant.preorderOverrides ?? []).filter((o) => !(o.label.startsWith(EID_LABEL) && o.from.startsWith(`${body.year}-`)));
  const mine = body.days.map((d, i) => ({ from: addDays(r.start, i), to: addDays(r.start, i), cap: d.cap, leadHours: body.leadHours, label: `${EID_LABEL} ${i + 1}` }));
  await saveRules(ctx, merchant, { overrides: [...keep, ...mine] } as Parameters<typeof saveRules>[2]);
  await writeAudit(ctx.db, { actorUserId: staff.user.id, merchantId: merchant.id, action: "grocery.eid_plan", entity: "merchant", entityId: merchant.id, data: { year: body.year, days: body.days } });
  const [fresh] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchant.id)).limit(1);
  return getEidPlan(ctx, fresh!, body.year);
}

/** Moon sighting: move Eid by a day or two. The Eid pick-up days and anything scheduled follow the new date. */
export async function moveEid(ctx: AppContext, staff: StaffContext, year: number, start: string | null): Promise<groceryApi.EidPlanResponse> {
  const merchant = staff.merchant;
  await requireAnyFeature(ctx.db, merchant, PREORDER_FEATURES);
  const f = getFestival("eid_al_adha")!;
  const d = f.dates[String(year)];
  if (!d) throw badRequest(`The calendar has no Eid al-Adha date for ${year}`);
  const before = resolveFestivalDates(f, String(year), merchant.festivalOverrides)!;
  const mine: Record<string, string> = { ...(merchant.festivalOverrides.eid_al_adha ?? {}) };
  if (start === null || start === d.start) delete mine[String(year)];
  else {
    if (Math.abs(daysBetween(d.start, start)) > 3) throw badRequest("Moon sighting moves a date by a day or two. Pick a date within three days of the calendar.");
    mine[String(year)] = start;
  }
  const next = { ...merchant.festivalOverrides };
  if (Object.keys(mine).length) next.eid_al_adha = mine;
  else delete next.eid_al_adha;
  const after = resolveFestivalDates(f, String(year), next)!;
  const delta = daysBetween(before.start, after.start);
  const overrides = (merchant.preorderOverrides ?? []).map((o) => (o.label.startsWith(EID_LABEL) && o.from.startsWith(`${year}-`) && delta !== 0 ? { ...o, from: addDays(o.from, delta), to: addDays(o.to, delta) } : o));
  await ctx.db.update(merchants).set({ festivalOverrides: next, preorderOverrides: overrides, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
  await writeAudit(ctx.db, { actorUserId: staff.user.id, merchantId: merchant.id, action: "grocery.eid_moved", entity: "merchant", entityId: merchant.id, data: { year, start } });
  const [fresh] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchant.id)).limit(1);
  return getEidPlan(ctx, fresh!, year);
}

// ===========================================================================
// Pantry reminders
// ===========================================================================
type ItemRow = typeof pantryItems.$inferSelect;
type EntryRow = typeof pantryEntries.$inferSelect;

export const PANTRY_ASK = (itemName: string) => `Want a text a few days before your ${itemName} runs out? You can reply STOP any time.`;

export async function listPantryItems(ctx: AppContext, merchant: Merchant): Promise<groceryApi.PantryItemDto[]> {
  await requireFeature(ctx.db, merchant, "grocery.pantry_reminders");
  const items = await ctx.db.select().from(pantryItems).where(eq(pantryItems.merchantId, merchant.id)).orderBy(asc(pantryItems.name));
  const entries = await ctx.db.select().from(pantryEntries).where(and(eq(pantryEntries.merchantId, merchant.id), eq(pantryEntries.remind, true)));
  const soon = ctx.now().getTime() + 7 * DAY_MS;
  return items.map((i) => {
    const mine = entries.filter((e) => e.pantryItemId === i.id);
    return { id: i.id, name: i.name, defaultIntervalDays: i.defaultIntervalDays, catalogItemId: i.catalogItemId, active: i.active, watching: mine.length, dueSoon: mine.filter((e) => pantryRemindAt(e.lastBoughtAt, e.intervalDays).getTime() <= soon && pantryDueAt(e.lastBoughtAt, e.intervalDays).getTime() + e.intervalDays * DAY_MS >= ctx.now().getTime()).length };
  });
}

export async function createPantryItem(ctx: AppContext, merchant: Merchant, actorUserId: string, body: z.output<typeof groceryApi.pantryItemBody>): Promise<groceryApi.PantryItemDto> {
  await requireFeature(ctx.db, merchant, "grocery.pantry_reminders");
  const [n] = await ctx.db.select({ n: count() }).from(pantryItems).where(eq(pantryItems.merchantId, merchant.id));
  if ((n?.n ?? 0) >= 40) throw badRequest("Up to 40 pantry items. Archive one you no longer sell.");
  const [row] = await ctx.db.insert(pantryItems).values({ merchantId: merchant.id, name: body.name, defaultIntervalDays: body.defaultIntervalDays, catalogItemId: body.catalogItemId ?? null, active: body.active }).returning();
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "grocery.pantry_item_created", entity: "pantry_item", entityId: row!.id, data: { name: body.name } });
  return { id: row!.id, name: row!.name, defaultIntervalDays: row!.defaultIntervalDays, catalogItemId: row!.catalogItemId, active: row!.active, watching: 0, dueSoon: 0 };
}

export async function updatePantryItem(ctx: AppContext, merchant: Merchant, actorUserId: string, id: string, body: z.output<typeof groceryApi.updatePantryItemBody>): Promise<{ ok: true }> {
  await requireFeature(ctx.db, merchant, "grocery.pantry_reminders");
  const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  if (!Object.keys(patch).length) throw badRequest("Nothing to update");
  const [row] = await ctx.db.update(pantryItems).set(patch).where(and(eq(pantryItems.id, id), eq(pantryItems.merchantId, merchant.id))).returning({ id: pantryItems.id });
  if (!row) throw notFound("Pantry item");
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "grocery.pantry_item_updated", entity: "pantry_item", entityId: id, data: patch });
  return { ok: true };
}

/**
 * The cashier tapped "bought 20 lb atta" for a member. Adds a purchase to that household's history (a second tap within 12 hours is
 * the same purchase), re-learns the gap, and, only when the cashier says the customer asked AND the member has agreed to texts,
 * turns reminders on with who asked and where recorded.
 */
export async function logPantryPurchase(ctx: AppContext, staff: StaffContext, body: z.output<typeof groceryApi.pantryLogBody>): Promise<groceryApi.PantryLogResponse> {
  const merchant = staff.merchant;
  await requireFeature(ctx.db, merchant, "grocery.pantry_reminders");
  const [member] = await ctx.db.select().from(merchantMembers).where(and(eq(merchantMembers.id, body.memberId), eq(merchantMembers.merchantId, merchant.id))).limit(1);
  if (!member) throw notFound("Member");
  const [item] = await ctx.db.select().from(pantryItems).where(and(eq(pantryItems.id, body.pantryItemId), eq(pantryItems.merchantId, merchant.id))).limit(1);
  if (!item || !item.active) throw notFound("Pantry item");
  const now = ctx.now();
  const [cur] = await ctx.db.select().from(pantryEntries).where(and(eq(pantryEntries.pantryItemId, item.id), eq(pantryEntries.userId, member.userId))).limit(1);
  const history = [...(cur?.history ?? [])];
  const sameTrip = cur && now.getTime() - cur.lastBoughtAt.getTime() < 12 * 3_600_000;
  if (!sameTrip) history.push(now.toISOString());
  const kept = history.slice(-12);
  const interval = pantryInterval(item.defaultIntervalDays, kept);
  const lastBoughtAt = sameTrip ? cur!.lastBoughtAt : now;

  let remind = cur?.remind ?? false;
  let needsMarketingConsent = false;
  const patch: Partial<typeof pantryEntries.$inferInsert> = {};
  if (body.remind === false) remind = false;
  else if (body.remind === true) {
    if (!member.marketingConsentAt || member.muted) needsMarketingConsent = true;
    else {
      remind = true;
      if (!cur?.remind) Object.assign(patch, { remindConsentAt: now, remindConsentSource: "counter", remindConsentBy: staff.user.id });
    }
  }
  const values = { history: kept, lastBoughtAt, intervalDays: interval, remind, updatedAt: now, ...patch };
  const row = cur
    ? (await ctx.db.update(pantryEntries).set(values).where(eq(pantryEntries.id, cur.id)).returning())[0]!
    : (await ctx.db.insert(pantryEntries).values({ merchantId: merchant.id, pantryItemId: item.id, userId: member.userId, ...values }).returning())[0]!;
  if (patch.remindConsentAt) {
    await writeAudit(ctx.db, { actorUserId: staff.user.id, merchantId: merchant.id, action: "consent.pantry", entity: "pantry_entry", entityId: row.id, data: { text: PANTRY_ASK(item.name), source: "counter" } });
  }
  return {
    entryId: row.id,
    itemName: item.name,
    intervalDays: interval,
    purchases: kept.length,
    remind,
    needsMarketingConsent,
    nextTextOn: remind ? localDate(pantryRemindAt(lastBoughtAt, interval), merchant.timezone) : null,
  };
}

interface Candidate {
  entry: EntryRow;
  item: ItemRow;
  userId: string;
  memberId: string;
  name: string | null;
  phone: string | null;
  locale: ReturnType<typeof normalizeLocale>;
  canText: boolean;
}

/** Everyone who asked for reminders on an active item, with whether a text could go to them (consent, not muted, not STOPped). */
async function pantryCandidates(ctx: AppContext, merchant: Merchant): Promise<Candidate[]> {
  const rows = await ctx.db
    .select({ entry: pantryEntries, item: pantryItems, memberId: merchantMembers.id, consent: merchantMembers.marketingConsentAt, muted: merchantMembers.muted, name: users.name, phone: users.phone, locale: users.locale, deletedAt: users.deletedAt })
    .from(pantryEntries)
    .innerJoin(pantryItems, eq(pantryItems.id, pantryEntries.pantryItemId))
    .innerJoin(merchantMembers, and(eq(merchantMembers.userId, pantryEntries.userId), eq(merchantMembers.merchantId, pantryEntries.merchantId)))
    .innerJoin(users, eq(users.id, pantryEntries.userId))
    .where(and(eq(pantryEntries.merchantId, merchant.id), eq(pantryEntries.remind, true), eq(pantryItems.active, true)));
  const stopped = await optedOutSet(ctx.db, rows.map((r) => r.phone), "sms");
  return rows
    .filter((r) => !r.deletedAt)
    .map((r) => ({ entry: r.entry, item: r.item, userId: r.entry.userId, memberId: r.memberId, name: r.name, phone: r.phone, locale: normalizeLocale(r.locale), canText: !!r.consent && !r.muted && !!r.phone && !isSuppressed(stopped, r.phone) }));
}

export async function pantryOverview(ctx: AppContext, merchant: Merchant): Promise<groceryApi.PantryOverviewResponse> {
  await requireFeature(ctx.db, merchant, "grocery.pantry_reminders");
  const now = ctx.now();
  const cands = await pantryCandidates(ctx, merchant);
  const weekOut = now.getTime() + 7 * DAY_MS;
  const due: groceryApi.PantryDueDto[] = cands
    .filter((c) => pantryRemindAt(c.entry.lastBoughtAt, c.entry.intervalDays).getTime() <= weekOut && pantryDueAt(c.entry.lastBoughtAt, c.entry.intervalDays).getTime() + c.entry.intervalDays * DAY_MS >= now.getTime())
    .filter((c) => !c.entry.lastRemindedAt || c.entry.lastRemindedAt < c.entry.lastBoughtAt)
    .map((c) => ({
      entryId: c.entry.id,
      memberId: c.memberId,
      name: c.name,
      itemId: c.item.id,
      itemName: c.item.name,
      intervalDays: c.entry.intervalDays,
      dueOn: localDate(pantryDueAt(c.entry.lastBoughtAt, c.entry.intervalDays), merchant.timezone),
      remindOn: localDate(pantryRemindAt(c.entry.lastBoughtAt, c.entry.intervalDays), merchant.timezone),
      readyToText: c.canText && pantryReminderDue(c.entry, now),
    }))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || (a.name ?? "").localeCompare(b.name ?? ""));
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const sent = await ctx.db.select().from(pantryReminders).where(and(eq(pantryReminders.merchantId, merchant.id), eq(pantryReminders.status, "sent"), gte(pantryReminders.sentAt, since)));
  let back = 0;
  if (sent.length) {
    const entries = await ctx.db.select().from(pantryEntries).where(inArray(pantryEntries.id, [...new Set(sent.map((s) => s.entryId))]));
    const byId = new Map(entries.map((e) => [e.id, e]));
    for (const s of sent) {
      const e = byId.get(s.entryId);
      if (e?.history.some((h) => Date.parse(h) > s.sentAt.getTime() && Date.parse(h) <= s.sentAt.getTime() + 7 * DAY_MS)) back++;
    }
  }
  const people = new Set(cands.map((c) => c.userId));
  return { items: await listPantryItems(ctx, merchant), due, members: people.size, last30: { sent: sent.length, boughtWithin7Days: back }, askText: PANTRY_ASK("20 lb atta") };
}

/** The text a household gets, in its own language. Names the shop, ends with the STOP line. */
export function restockText(ctx: AppContext, merchant: Pick<Merchant, "name" | "slug">, c: { locale: ReturnType<typeof normalizeLocale>; name: string | null; itemName: string }) {
  const locale = c.locale ?? "en";
  const vars = { name: (c.name ?? "").trim().split(/\s+/)[0] || "", item: c.itemName, shop: merchant.name, url: `${ctx.config.publicWebUrl.replace(/\/$/, "")}/shops/${merchant.slug}/order${locale === "en" ? "" : `?lang=${locale}`}` };
  return { title: t(locale, "gr.msg.restockTitle", vars), body: t(locale, "gr.msg.restock", vars).replace(/^\s*,\s*/, "") };
}

async function sendRestock(ctx: AppContext, merchant: Merchant, c: Candidate): Promise<"sent" | "quiet" | "no_credits" | "skipped"> {
  const now = ctx.now();
  if (!c.canText || !c.phone) return "skipped";
  if (inQuietHours(now, merchant.timezone)) return "quiet";
  if (!(await reserveSmsCredits(ctx.db, merchant, 1))) return "no_credits";
  const { body } = restockText(ctx, merchant, { locale: c.locale, name: c.name, itemName: c.item.name });
  let status = "sent";
  let providerId: string | null = null;
  let error: string | null = null;
  try {
    const r = await sendSms(ctx, c.phone, body);
    if (!r) {
      status = "skipped";
      error = "opted_out";
    } else providerId = r.id;
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message.slice(0, 500) : "send failed";
  }
  await ctx.db.insert(messageDeliveries).values({ userId: c.userId, merchantId: merchant.id, channel: "sms", to: c.phone, body, kind: "marketing", status, providerId, error });
  if (status !== "sent") return "skipped";
  await ctx.db.insert(pantryReminders).values({ merchantId: merchant.id, entryId: c.entry.id, sentAt: now });
  await ctx.db.update(pantryEntries).set({ lastRemindedAt: now, updatedAt: now }).where(eq(pantryEntries.id, c.entry.id));
  return "sent";
}

/** Texts everyone whose reminder is due (or just `entryIds`). Stops when the month's texts run out; never texts overnight. */
export async function sendPantryReminders(ctx: AppContext, merchant: Merchant, opts: { entryIds?: string[] } = {}): Promise<groceryApi.PantrySendResponse> {
  await requireFeature(ctx.db, merchant, "grocery.pantry_reminders");
  const now = ctx.now();
  let sent = 0;
  let skipped = 0;
  const pool = (await pantryCandidates(ctx, merchant)).filter((c) => (!opts.entryIds || opts.entryIds.includes(c.entry.id)) && pantryReminderDue(c.entry, now));
  for (const c of pool) {
    const r = await sendRestock(ctx, merchant, c);
    if (r === "sent") sent++;
    else skipped++;
    if (r === "no_credits") break;
    if (r === "quiet") {
      skipped += pool.length - sent - skipped;
      break;
    }
  }
  if (opts.entryIds && !sent && skipped === 0) throw new HttpError(409, "not_due", "Nobody in that list is due for a text right now.");
  return { sent, skipped };
}

/** Job, hourly: at 10:00 shop time, text everyone due for shops that have pantry reminders on. */
export async function runPantryReminders(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const shops = await ctx.db.selectDistinct({ m: merchants }).from(pantryItems).innerJoin(merchants, eq(merchants.id, pantryItems.merchantId)).where(and(eq(pantryItems.active, true), inArray(merchants.status, ["onboarding", "active"])));
  let sent = 0;
  for (const { m } of shops) {
    const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: m.timezone, hour: "2-digit", hourCycle: "h23" }).format(now));
    if (hour !== 10) continue;
    if (!(await isFeatureOn(ctx.db, m, "grocery.pantry_reminders"))) continue;
    sent += (await sendPantryReminders(ctx, m)).sent;
  }
  return sent;
}

// ---------------------------------------------------------------- the customer's side
export async function myPantry(ctx: AppContext, userId: string): Promise<groceryApi.MyPantryResponse> {
  const rows = await ctx.db
    .select({ entry: pantryEntries, item: pantryItems, m: merchants })
    .from(pantryEntries)
    .innerJoin(pantryItems, eq(pantryItems.id, pantryEntries.pantryItemId))
    .innerJoin(merchants, eq(merchants.id, pantryEntries.merchantId))
    .where(and(eq(pantryEntries.userId, userId), eq(pantryItems.active, true)))
    .orderBy(desc(pantryEntries.lastBoughtAt));
  return {
    items: rows.map((r) => ({
      entryId: r.entry.id,
      shop: { id: r.m.id, name: r.m.name, slug: r.m.slug },
      itemName: r.item.name,
      remind: r.entry.remind,
      intervalDays: r.entry.intervalDays,
      nextTextOn: r.entry.remind ? localDate(pantryRemindAt(r.entry.lastBoughtAt, r.entry.intervalDays), r.m.timezone) : null,
    })),
  };
}

/** The customer switches a reminder off any time; switching it on needs the shop's text consent and records where it came from. */
export async function setMyPantry(ctx: AppContext, userId: string, entryId: string, remind: boolean): Promise<groceryApi.MyPantryResponse["items"][number]> {
  const [row] = await ctx.db
    .select({ entry: pantryEntries, item: pantryItems, m: merchants, consent: merchantMembers.marketingConsentAt, muted: merchantMembers.muted })
    .from(pantryEntries)
    .innerJoin(pantryItems, eq(pantryItems.id, pantryEntries.pantryItemId))
    .innerJoin(merchants, eq(merchants.id, pantryEntries.merchantId))
    .innerJoin(merchantMembers, and(eq(merchantMembers.userId, pantryEntries.userId), eq(merchantMembers.merchantId, pantryEntries.merchantId)))
    .where(and(eq(pantryEntries.id, entryId), eq(pantryEntries.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Reminder");
  if (remind && (!row.consent || row.muted)) throw new HttpError(409, "no_consent", `Turn on texts from ${row.m.name} first, then switch this on.`);
  const now = ctx.now();
  const patch = remind && !row.entry.remind ? { remind, remindConsentAt: now, remindConsentSource: "pass", remindConsentBy: userId, updatedAt: now } : { remind, updatedAt: now };
  const [e] = await ctx.db.update(pantryEntries).set(patch).where(eq(pantryEntries.id, entryId)).returning();
  return { entryId, shop: { id: row.m.id, name: row.m.name, slug: row.m.slug }, itemName: row.item.name, remind: e!.remind, intervalDays: e!.intervalDays, nextTextOn: e!.remind ? localDate(pantryRemindAt(e!.lastBoughtAt, e!.intervalDays), row.m.timezone) : null };
}

// ===========================================================================
// Home
// ===========================================================================
export async function groceryHome(ctx: AppContext, merchant: Merchant): Promise<groceryApi.GroceryHomeResponse> {
  const now = ctx.now();
  const today = localDate(now, merchant.timezone);
  const from = localMidnightUtc(today, merchant.timezone);
  const to = localMidnightUtc(addDays(today, 1), merchant.timezone);
  const butcherOn = await isFeatureOn(ctx.db, merchant, "grocery.counter_preorders");
  const pantryOn = await isFeatureOn(ctx.db, merchant, "grocery.pantry_reminders");
  const flyerOn = await isFeatureOn(ctx.db, merchant, "grocery.flyer");

  let butcher: groceryApi.GroceryHomeResponse["butcher"] = [];
  if (butcherOn) {
    const rows = await ctx.db
      .select({ o: orders, name: users.name })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(and(eq(orders.merchantId, merchant.id), gte(orders.pickupAt, from), sql`${orders.pickupAt} < ${to}`, inArray(orders.status, ["pending", "accepted", "preparing", "ready"])))
      .orderBy(asc(orders.pickupAt))
      .limit(12);
    const ids = rows.map((r) => r.o.id);
    const lines = ids.length ? await ctx.db.select().from(orderItems).where(inArray(orderItems.orderId, ids)) : [];
    butcher = rows.map(({ o, name }) => {
      const mine = lines.filter((l) => l.orderId === o.id);
      const toWeigh = mine.some((l) => l.weightUnit && l.actualWeightG == null);
      return {
        id: o.id,
        at: o.pickupAt ? o.pickupAt.toISOString() : null,
        customer: name,
        summary: mine.map((l) => `${l.quantity > 1 ? `${l.quantity} × ` : ""}${l.name}`).join(", "),
        status: toWeigh ? "weigh" : o.paymentStatus === "paid" ? "paid" : o.depositPaidAt ? "deposit_paid" : "unpaid",
      };
    });
  }
  const pantry: groceryApi.GroceryHomeResponse["pantry"] = { members: 0, dueSoon: [] };
  if (pantryOn) {
    const ov = await pantryOverview(ctx, merchant);
    pantry.members = ov.members;
    pantry.dueSoon = ov.due.slice(0, 4);
  }
  const flyer: groceryApi.GroceryHomeResponse["flyer"] = { live: 0, upcoming: 0, ends: null };
  if (flyerOn) {
    const rows = await ctx.db.select().from(groceryDeals).where(and(eq(groceryDeals.merchantId, merchant.id), eq(groceryDeals.active, true), gte(groceryDeals.endsOn, today)));
    const live = rows.filter((r) => r.startsOn <= today);
    flyer.live = live.length;
    flyer.upcoming = rows.length - live.length;
    flyer.ends = live.map((r) => r.endsOn).sort()[0] ?? null;
  }
  const season = flyerOn ? (upcomingGrocerSeasons(today, 45, merchant.festivalOverrides).find((s) => s.flyerDue) ?? null) : null;
  return { today, butcher, pantry, flyer, season };
}
