/**
 * Catering & events (Growth: restaurant.catering).
 *
 * Flow: inquiry → (tasting) → quoted (link /c/<approvalToken>) → customer signs →
 * deposit paid (PaymentIntent, ll_kind catering_deposit) → confirmed → invoice for
 * the balance → completed. Cancelled from any open state.
 * Money is integer cents; tax comes from services/tax.ts (merchant province).
 */
import { and, asc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { cateringEvents, catalogItems, hallBookings, halls, invoices, messageDeliveries, users, type DbOrTx } from "@ll/db";
import { paymentsManualApi, salesTaxBps, type restaurantApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { randomToken } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, notFound, tooMany } from "../lib/errors.js";
import { allow } from "../lib/rate-limit.js";
import { platformFeeFor } from "./fees.js";
import { createConnectPayment, retrieveConnectPayment } from "./payments.js";
import { refundDeposit, refundSentence, resolveDepositRefund } from "./depositRefunds.js";
import { formatLocalDateTime, iso, loadMerchant, merchantBrands, money, notifyCustomer, paymentsReady } from "./commerceShared.js";
import { nextNumber } from "./counters.js";
import { requireFeature } from "./features.js";
import { sendInvoice } from "./invoices.js";
import { findOrCreateCustomerByPhone } from "./ledger.js";
import { requirePhone } from "./merchant.js";
import { computeTax, merchantProvince } from "./tax.js";
import { addLedger, assertNotFuture, etransferOffer, ledgerDtos, liveLedger, manualInstructions, newReferenceCode, receiptLine, todayFor, voidLedger } from "./manual-payments.js";
import { markInvoicePaid } from "./invoices.js";

export type CateringEvent = typeof cateringEvents.$inferSelect;
type Merchant = NonNullable<Awaited<ReturnType<typeof loadMerchant>>>;
type MenuLine = CateringEvent["menu"][number];

export const DEFAULT_DEPOSIT_BPS = 3000;
/** The mandatory service charge is a line item with this prefix (taxed like food; kind "fee" so it prints with the extras). */
export const SERVICE_CHARGE_PREFIX = "Service charge";
const isServiceLine = (l: { description: string }) => l.description.startsWith(SERVICE_CHARGE_PREFIX);
const MIN_CARD_CENTS = 50;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
export function cateringDto(e: CateringEvent, publicWebUrl: string, forStaff: boolean, customer?: restaurantApi.CateringEventDto["customer"]): restaurantApi.CateringEventDto {
  return {
    id: e.id,
    merchantId: e.merchantId,
    userId: e.userId,
    number: e.number,
    customer: customer ?? null,
    eventType: e.eventType as restaurantApi.CateringEventType,
    eventDate: e.eventDate,
    startTime: e.startTime,
    headcount: e.headcount,
    venueName: e.venueName,
    venueAddress: e.venueAddress,
    service: e.service as restaurantApi.CateringService,
    status: e.status as restaurantApi.CateringStatus,
    menu: e.menu.map((m) => ({ catalogItemId: m.catalogItemId ?? null, name: m.name, perHeadCents: m.perHeadCents ?? null, quantity: m.quantity ?? null, unitPriceCents: m.unitPriceCents ?? null })),
    perHeadCents: e.perHeadCents,
    lineItems: e.lineItems.map((l) => ({ description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, totalCents: l.quantity * l.unitPriceCents })),
    subtotalCents: e.subtotalCents,
    taxCents: e.taxCents,
    totalCents: e.totalCents,
    depositBps: e.depositBps,
    depositCents: e.depositCents,
    balanceCents: Math.max(0, e.totalCents - (e.depositPaidAt ? e.depositCents : 0)),
    dietaryNotes: e.dietaryNotes,
    notes: e.notes,
    tastingAt: iso(e.tastingAt),
    quoteSentAt: iso(e.quoteSentAt),
    approvedAt: iso(e.approvedAt),
    signatureName: e.signatureName,
    ...(forStaff ? { signatureIp: e.signatureIp, signatureUserAgent: e.signatureUserAgent } : {}),
    depositPaidAt: iso(e.depositPaidAt),
    depositMethod: e.depositMethod ?? (e.depositPaidAt && e.depositPaymentIntentId ? "card" : null),
    depositReceivedOn: e.depositReceivedOn,
    referenceCode: e.referenceCode,
    serviceChargeBps: e.serviceChargeBps,
    serviceChargeCents: e.lineItems.filter(isServiceLine).reduce((s, l) => s + l.quantity * l.unitPriceCents, 0),
    quoteOpenedAt: iso(e.quoteOpenedAt),
    depositRefundCents: e.depositRefundCents,
    depositRefundedAt: iso(e.depositRefundedAt),
    invoiceId: e.invoiceId,
    hallBookingId: e.hallBookingId,
    approvalUrl: e.quoteSentAt ? `${publicWebUrl}/e/${e.approvalToken}` : null,
    createdAt: e.createdAt.toISOString(),
  };
}

async function customersFor(db: DbOrTx, userIds: string[]) {
  const map = new Map<string, NonNullable<restaurantApi.CateringEventDto["customer"]>>();
  if (!userIds.length) return map;
  const rows = await db.select({ id: users.id, name: users.name, phone: users.phone, email: users.email }).from(users).where(inArray(users.id, [...new Set(userIds)]));
  for (const r of rows) map.set(r.id, { name: r.name, phone: r.phone, email: r.email });
  return map;
}

export async function staffDto(ctx: AppContext, e: CateringEvent) {
  const c = await customersFor(ctx.db, [e.userId]);
  const dto = cateringDto(e, ctx.config.publicWebUrl, true, c.get(e.userId));
  const payments = await ledgerDtos(ctx.db, ["catering_deposit", "catering_balance"], e.id);
  const balancePaid = payments.filter((p) => p.subjectType === "catering_balance" && !p.voidedAt).reduce((s, p) => s + p.amountCents, 0);
  const merchant = await loadMerchant(ctx.db, e.merchantId);
  return { ...dto, balanceCents: Math.max(0, dto.balanceCents - balancePaid), payments, dateClashes: await dateClashCount(ctx.db, e), ...(merchant ? { tax: await taxNote(ctx, merchant) } : {}) };
}

/** "HST 13% on 123456789RT0001", "No HST charged (small supplier)" or "tax status not set": what the quote and approval page say. */
export async function taxNote(ctx: AppContext, m: Merchant): Promise<NonNullable<restaurantApi.CateringEventDto["tax"]>> {
  const province = await merchantProvince(ctx.db, m);
  const bps = salesTaxBps({ province, taxRegistered: m.taxRegistered });
  const rate = `${+(bps / 100).toFixed(3)}%`;
  const label = m.taxRegistered === false ? "No HST charged (small supplier)" : m.taxRegistered === true ? `Tax ${rate}${m.taxNumber ? `, GST/HST no. ${m.taxNumber}` : ""}` : `Tax ${rate}, tax status not set`;
  return { registered: m.taxRegistered, number: m.taxNumber, label };
}

export async function getMerchantEvent(db: DbOrTx, merchantId: string, eventId: string): Promise<CateringEvent> {
  const [e] = await db.select().from(cateringEvents).where(and(eq(cateringEvents.id, eventId), eq(cateringEvents.merchantId, merchantId))).limit(1);
  if (!e) throw notFound("Catering event");
  return e;
}

export async function getEventByToken(db: DbOrTx, token: string): Promise<CateringEvent> {
  if (!token || token.length < 16) throw notFound("Catering quote");
  const [e] = await db.select().from(cateringEvents).where(eq(cateringEvents.approvalToken, token)).limit(1);
  // Customers only see an event once the quote has been sent.
  if (!e || !e.quoteSentAt) throw notFound("Catering quote");
  return e;
}

/** Today's date (YYYY-MM-DD) in the shop's timezone. */
function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// ---------------------------------------------------------------------------
// Inquiry
// ---------------------------------------------------------------------------
const HOUR = 3_600_000;
const PUBLIC_INQUIRIES_PER_HOUR = 10;

async function checkRate(ctx: AppContext, ip: string) {
  if (!(await allow(ctx, `catering-inquiry:${ip}`, PUBLIC_INQUIRIES_PER_HOUR, HOUR))) throw tooMany("Too many inquiries from this connection. Try again in an hour, or call the shop.");
}

export async function createInquiry(ctx: AppContext, merchant: Merchant, userId: string, body: z.infer<typeof restaurantApi.cateringInquiryBody>): Promise<CateringEvent> {
  await requireFeature(ctx.db, merchant, "restaurant.catering");
  const now = ctx.now();
  if (body.eventDate < localDate(now, merchant.timezone)) throw badRequest("The event date can't be in the past");
  const event = await ctx.db.transaction(async (tx) => {
    const number = await nextNumber(tx, merchant.id, "catering");
    const [e] = await tx
      .insert(cateringEvents)
      .values({
        merchantId: merchant.id,
        userId,
        number,
        eventType: body.eventType,
        eventDate: body.eventDate,
        startTime: body.startTime ?? null,
        headcount: body.headcount,
        venueName: body.venueName ?? null,
        venueAddress: body.venueAddress ?? null,
        service: body.service,
        status: "inquiry",
        depositBps: DEFAULT_DEPOSIT_BPS,
        dietaryNotes: body.dietaryNotes ?? null,
        notes: body.notes ?? null,
        approvalToken: randomToken(24),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return e!;
  });
  return event;
}

export async function createPublicInquiry(ctx: AppContext, merchant: Merchant, body: z.infer<typeof restaurantApi.cateringPublicInquiryBody>, ip: string) {
  await requireFeature(ctx.db, merchant, "restaurant.catering");
  const phone = requirePhone(body.phone);
  await checkRate(ctx, ip);
  const { user } = await findOrCreateCustomerByPhone(ctx.db, phone, body.name);
  if (body.email && !user.email) {
    const [taken] = await ctx.db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${body.email.toLowerCase()}`).limit(1);
    if (!taken) await ctx.db.update(users).set({ email: body.email }).where(eq(users.id, user.id));
  }
  const { name: _n, phone: _p, email: _e, ...inquiry } = body;
  const event = await createInquiry(ctx, merchant, user.id, inquiry);
  return event;
}

// ---------------------------------------------------------------------------
// Menu + pricing
// ---------------------------------------------------------------------------
async function resolveMenu(db: DbOrTx, merchant: Merchant, headcount: number, items: z.infer<typeof restaurantApi.cateringMenuItemInput>[]): Promise<MenuLine[]> {
  const ids = [...new Set(items.map((i) => i.catalogItemId).filter((x): x is string => !!x))];
  const rows = ids.length ? await db.select().from(catalogItems).where(and(eq(catalogItems.merchantId, merchant.id), inArray(catalogItems.id, ids))) : [];
  if (rows.length !== ids.length) throw badRequest("Unknown catalog item on the menu");
  const byId = new Map(rows.map((r) => [r.id, r]));
  return items.map((i) => {
    const item = i.catalogItemId ? byId.get(i.catalogItemId)! : null;
    const name = i.name?.trim() || item!.name;
    if (i.pricing === "per_head") {
      const perHeadCents = i.perHeadCents ?? (item ? (item.serves ? Math.round(item.priceCents / item.serves) : item.priceCents) : null);
      if (perHeadCents == null) throw badRequest(`Give "${name}" a per-head price`);
      return { catalogItemId: item?.id, name, perHeadCents };
    }
    const unitPriceCents = i.unitPriceCents ?? item?.priceCents;
    if (unitPriceCents == null) throw badRequest(`Give "${name}" a tray price`);
    const quantity = i.quantity ?? (item?.serves ? Math.ceil(headcount / item.serves) : null);
    if (!quantity) throw badRequest(`How many trays of "${name}"?`);
    return { catalogItemId: item?.id, name, quantity, unitPriceCents };
  });
}

export interface Priced {
  menu: MenuLine[];
  perHeadCents: number;
  lineItems: CateringEvent["lineItems"];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositBps: number;
  depositCents: number;
}

/** Totals for a menu: per-head lines × headcount, trays × quantity, extras, tax, deposit. */
export async function priceMenu(db: DbOrTx, merchant: Merchant, headcount: number, menu: MenuLine[], extras: { description: string; quantity: number; unitPriceCents: number }[], depositBps: number, serviceChargeBps = 0): Promise<Priced> {
  const lineItems: Priced["lineItems"] = [];
  let perHeadCents = 0;
  for (const m of menu) {
    if (m.perHeadCents != null) {
      perHeadCents += m.perHeadCents;
      lineItems.push({ description: `${m.name} (per guest)`, quantity: headcount, unitPriceCents: m.perHeadCents, kind: "other" });
    } else {
      lineItems.push({ description: `${m.name} (tray)`, quantity: m.quantity ?? 1, unitPriceCents: m.unitPriceCents ?? 0, kind: "other" });
    }
  }
  for (const x of extras) lineItems.push({ description: x.description, quantity: x.quantity, unitPriceCents: x.unitPriceCents, kind: "fee" });
  // A mandatory service charge is part of the sale: it counts toward the subtotal and is taxed (tips are never modelled here).
  const beforeCharge = lineItems.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
  if (serviceChargeBps > 0 && beforeCharge > 0) {
    const pct = `${+(serviceChargeBps / 100).toFixed(2)}%`;
    lineItems.push({ description: `${SERVICE_CHARGE_PREFIX} ${pct}${merchant.taxRegistered === false ? "" : " (tax applies)"}`, quantity: 1, unitPriceCents: Math.round((beforeCharge * serviceChargeBps) / 10_000), kind: "fee" });
  }
  const subtotalCents = lineItems.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
  // A merchant that says it is not registered for GST/HST charges no tax; unset still computes at the provincial rate (labelled "tax status not set").
  const taxCents = merchant.taxRegistered === false ? 0 : computeTax(subtotalCents, await merchantProvince(db, merchant)).taxCents;
  const totalCents = subtotalCents + taxCents;
  let depositCents = Math.round((totalCents * depositBps) / 10_000);
  // Card deposits under the Stripe minimum are rounded up (never above the total).
  if (depositCents > 0 && depositCents < MIN_CARD_CENTS) depositCents = Math.min(totalCents, MIN_CARD_CENTS);
  return { menu, perHeadCents, lineItems, subtotalCents, taxCents, totalCents, depositBps, depositCents };
}

const EDITABLE = ["inquiry", "tasting", "quoted"];

/** Editing a quoted (not yet approved) event pulls the quote back: it must be re-sent. */
function reopenPatch(e: CateringEvent): Partial<typeof cateringEvents.$inferInsert> {
  if (e.status !== "quoted") return {};
  return { status: e.tastingAt ? "tasting" : "inquiry", quoteSentAt: null };
}

function assertEditable(e: CateringEvent) {
  if (!EDITABLE.includes(e.status) || e.approvedAt) throw conflict(`This event is ${e.approvedAt && e.status === "quoted" ? "already approved" : e.status}; it can't be changed`);
}

export async function setMenu(ctx: AppContext, staff: StaffContext, eventId: string, body: z.infer<typeof restaurantApi.cateringMenuBody>): Promise<CateringEvent> {
  const merchant = staff.merchant;
  const e = await getMerchantEvent(ctx.db, merchant.id, eventId);
  assertEditable(e);
  const menu = await resolveMenu(ctx.db, merchant, e.headcount, body.items);
  const serviceChargeBps = body.serviceChargeBps ?? e.serviceChargeBps;
  const priced = await priceMenu(ctx.db, merchant, e.headcount, menu, body.extras, body.depositBps ?? e.depositBps, serviceChargeBps);
  const [row] = await ctx.db
    .update(cateringEvents)
    .set({ ...reopenPatch(e), serviceChargeBps, menu: priced.menu, perHeadCents: priced.perHeadCents, lineItems: priced.lineItems, subtotalCents: priced.subtotalCents, taxCents: priced.taxCents, totalCents: priced.totalCents, depositBps: priced.depositBps, depositCents: priced.depositCents, updatedAt: ctx.now() })
    .where(eq(cateringEvents.id, e.id))
    .returning();
  return row!;
}

export async function updateEvent(ctx: AppContext, staff: StaffContext, eventId: string, body: z.infer<typeof restaurantApi.updateCateringBody>): Promise<CateringEvent> {
  const merchant = staff.merchant;
  const e = await getMerchantEvent(ctx.db, merchant.id, eventId);
  assertEditable(e);
  const patch: Partial<typeof cateringEvents.$inferInsert> = { ...body, updatedAt: ctx.now() };
  const changesMoney = body.headcount !== undefined && body.headcount !== e.headcount;
  if (changesMoney || (body.eventDate && body.eventDate !== e.eventDate)) Object.assign(patch, reopenPatch(e));
  if (changesMoney && e.menu.length) {
    // Per-head lines follow the new headcount; trays and extras stay as the staff set them.
    const extras = e.lineItems.filter((l) => l.kind === "fee" && !isServiceLine(l));
    const priced = await priceMenu(ctx.db, merchant, body.headcount!, e.menu, extras, e.depositBps, e.serviceChargeBps);
    Object.assign(patch, { perHeadCents: priced.perHeadCents, lineItems: priced.lineItems, subtotalCents: priced.subtotalCents, taxCents: priced.taxCents, totalCents: priced.totalCents, depositCents: priced.depositCents });
  }
  const [row] = await ctx.db.update(cateringEvents).set(patch).where(eq(cateringEvents.id, e.id)).returning();
  return row!;
}

// ---------------------------------------------------------------------------
// Pipeline + calendar
// ---------------------------------------------------------------------------
export async function listEvents(ctx: AppContext, merchant: Merchant, q: z.infer<typeof restaurantApi.listCateringQuery>) {
  const conds: SQL[] = [eq(cateringEvents.merchantId, merchant.id)];
  if (q.status) conds.push(eq(cateringEvents.status, q.status));
  if (q.from) conds.push(gte(cateringEvents.eventDate, q.from));
  if (q.to) conds.push(lte(cateringEvents.eventDate, q.to));
  const offset = q.cursor ? Math.max(0, Number(Buffer.from(q.cursor, "base64url").toString()) || 0) : 0;
  const rows = await ctx.db.select().from(cateringEvents).where(and(...conds)).orderBy(asc(cateringEvents.eventDate), asc(cateringEvents.number)).limit(q.limit + 1).offset(offset);
  const page = rows.slice(0, q.limit);
  const customers = await customersFor(ctx.db, page.map((r) => r.userId));
  const counts = await ctx.db.select({ status: cateringEvents.status, n: sql<number>`count(*)::int` }).from(cateringEvents).where(eq(cateringEvents.merchantId, merchant.id)).groupBy(cateringEvents.status);
  return {
    items: page.map((e) => cateringDto(e, ctx.config.publicWebUrl, true, customers.get(e.userId))),
    nextCursor: rows.length > q.limit ? Buffer.from(String(offset + q.limit)).toString("base64url") : null,
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Record<string, number>,
    summary: await pipelineSummary(ctx, merchant),
  };
}

/** Customer-facing DTO: adds the kitchen's name, slug, logo and brand colour. */
export async function myDto(ctx: AppContext, e: CateringEvent): Promise<restaurantApi.CateringEventDto> {
  const brand = (await merchantBrands(ctx.db, [e.merchantId])).get(e.merchantId);
  return { ...cateringDto(e, ctx.config.publicWebUrl, false), ...brand };
}

export async function listMyEvents(ctx: AppContext, userId: string) {
  const rows = await ctx.db.select().from(cateringEvents).where(eq(cateringEvents.userId, userId)).orderBy(asc(cateringEvents.eventDate));
  const brands = await merchantBrands(ctx.db, rows.map((e) => e.merchantId));
  return { items: rows.map((e) => ({ ...cateringDto(e, ctx.config.publicWebUrl, false), ...brands.get(e.merchantId) })), nextCursor: null };
}

export async function getMyEvent(ctx: AppContext, userId: string, eventId: string) {
  const [e] = await ctx.db.select().from(cateringEvents).where(and(eq(cateringEvents.id, eventId), eq(cateringEvents.userId, userId))).limit(1);
  if (!e) throw notFound("Catering event");
  return myDto(ctx, e);
}

/** Confirmed events by date range, with guests per day for kitchen capacity. */
export async function calendar(ctx: AppContext, merchant: Merchant, q: z.infer<typeof restaurantApi.cateringCalendarQuery>): Promise<restaurantApi.CateringCalendarResponse> {
  if (q.to < q.from) throw badRequest("'to' must be on or after 'from'");
  const rows = await ctx.db
    .select()
    .from(cateringEvents)
    .where(and(eq(cateringEvents.merchantId, merchant.id), eq(cateringEvents.status, "confirmed"), gte(cateringEvents.eventDate, q.from), lte(cateringEvents.eventDate, q.to)))
    .orderBy(asc(cateringEvents.eventDate), asc(cateringEvents.startTime));
  const customers = await customersFor(ctx.db, rows.map((r) => r.userId));
  const days = new Map<string, { date: string; events: number; headcount: number }>();
  for (const r of rows) {
    const d = days.get(r.eventDate) ?? { date: r.eventDate, events: 0, headcount: 0 };
    d.events += 1;
    d.headcount += r.headcount;
    days.set(r.eventDate, d);
  }
  return { items: rows.map((e) => cateringDto(e, ctx.config.publicWebUrl, true, customers.get(e.userId))), days: [...days.values()] };
}

// ---------------------------------------------------------------------------
// Tasting + quote
// ---------------------------------------------------------------------------
export async function scheduleTasting(ctx: AppContext, staff: StaffContext, eventId: string, body: z.infer<typeof restaurantApi.cateringTastingBody>): Promise<CateringEvent> {
  const merchant = staff.merchant;
  const e = await getMerchantEvent(ctx.db, merchant.id, eventId);
  if (e.status !== "inquiry" && e.status !== "tasting") throw conflict(`Can't schedule a tasting for an event that is ${e.status}`);
  const at = new Date(body.tastingAt);
  if (at <= ctx.now()) throw badRequest("Pick a tasting time in the future");
  const [row] = await ctx.db.update(cateringEvents).set({ tastingAt: at, status: "tasting", updatedAt: ctx.now() }).where(eq(cateringEvents.id, e.id)).returning();
  await notifyCustomer(ctx, {
    userId: e.userId,
    merchantId: merchant.id,
    title: `${merchant.name}: tasting booked`,
    body: `Your tasting for catering #${e.number} is ${formatLocalDateTime(at, merchant.timezone)} at ${merchant.name}.`,
    data: { type: "catering_tasting", cateringEventId: e.id },
  });
  return row!;
}

export async function sendQuote(ctx: AppContext, staff: StaffContext, eventId: string, body: z.infer<typeof restaurantApi.cateringSendQuoteBody>): Promise<CateringEvent> {
  const merchant = staff.merchant;
  const e = await getMerchantEvent(ctx.db, merchant.id, eventId);
  if (!["inquiry", "tasting", "quoted"].includes(e.status) || e.approvedAt) throw conflict(`Can't send a quote for an event that is ${e.status}`);
  if (!e.lineItems.length) throw badRequest("Build the menu before sending a quote");
  const now = ctx.now();
  const referenceCode = e.referenceCode ?? (await newReferenceCode(ctx.db, merchant.id, e.userId));
  const [row] = await ctx.db.update(cateringEvents).set({ status: "quoted", quoteSentAt: now, quoteOpenedAt: null, referenceCode, updatedAt: now }).where(eq(cateringEvents.id, e.id)).returning();
  const url = `${ctx.config.publicWebUrl}/e/${row!.approvalToken}`;
  const dep = row!.depositCents > 0 ? ` (${money(row!.depositCents)} deposit to confirm)` : "";
  const text = `Your catering quote #${row!.number} for ${row!.headcount} guests on ${row!.eventDate} is ${money(row!.totalCents)}${dep}. Review and approve: ${url}`;
  await notifyCustomer(ctx, {
    userId: e.userId,
    merchantId: merchant.id,
    title: `${merchant.name}: catering quote ready`,
    body: text,
    sms: body.channels.includes("sms"),
    // Shape the WhatsApp listener (services/whatsapp.ts notificationFor) expects for a catering quote.
    data: { type: "quote_sent", cateringEventId: e.id, eventName: `${row!.eventType.replace(/_/g, " ")} on ${row!.eventDate}`, url },
  });
  if (body.channels.includes("email")) await emailCustomer(ctx, merchant.id, e.userId, `${merchant.name}: your catering quote #${row!.number}`, `${text}\n\nThank you,\n${merchant.name}`);
  return row!;
}

async function emailCustomer(ctx: AppContext, merchantId: string, userId: string, subject: string, text: string) {
  try {
    const [u] = await ctx.db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!u?.email) return;
    const r = await ctx.providers.email.send({ to: u.email, subject, text });
    await ctx.db.insert(messageDeliveries).values({ userId, merchantId, channel: "email", to: u.email, body: `${subject}: ${text}`, kind: "transactional", status: "sent", providerId: r.id });
  } catch (err) {
    if (ctx.config.env !== "test") console.error("[catering email]", err);
  }
}

// ---------------------------------------------------------------------------
// Approval (public token) + deposit
// ---------------------------------------------------------------------------
export interface ApproveArgs {
  signatureName: string;
  ip?: string | null;
  userAgent?: string | null;
  /** "etransfer" returns instructions instead of starting a card payment. */
  payWith?: "card" | "etransfer";
}

export async function approveEvent(ctx: AppContext, event: CateringEvent, args: ApproveArgs): Promise<restaurantApi.ApproveCateringResponse> {
  const merchant = await loadMerchant(ctx.db, event.merchantId);
  if (!merchant) throw notFound("Catering quote");
  await requireFeature(ctx.db, merchant, "restaurant.catering");
  const signatureName = args.signatureName.trim();
  if (event.approvedAt && ["quoted", "confirmed"].includes(event.status)) {
    // Idempotent re-approve: hand back the deposit payment if still due.
    return approvalResponse(ctx, merchant, event, args.payWith);
  }
  if (event.status !== "quoted") throw conflict(event.status === "cancelled" ? "This event was cancelled" : "This quote is no longer open for approval");
  if (signatureName.length < 2) throw badRequest("Type your full name to sign");
  // A quote cannot be signed once the event date has passed.
  if (event.eventDate < localDate(ctx.now(), merchant.timezone || "America/Toronto")) throw new HttpError(410, "quote_expired", "This quote has expired because the event date has passed. Ask the shop for a new one.");
  const now = ctx.now();
  const noDeposit = event.depositCents === 0;
  const [updated] = await ctx.db
    .update(cateringEvents)
    .set({ approvedAt: now, signatureName, signatureIp: args.ip ?? null, signatureUserAgent: args.userAgent?.slice(0, 500) ?? null, ...(noDeposit ? { status: "confirmed" } : {}), updatedAt: now })
    .where(and(eq(cateringEvents.id, event.id), eq(cateringEvents.status, "quoted")))
    .returning();
  if (!updated) throw conflict("This quote was just updated. Refresh and try again.");
  return approvalResponse(ctx, merchant, updated, args.payWith);
}

async function approvalResponse(ctx: AppContext, merchant: Merchant, e: CateringEvent, payWith: "card" | "etransfer" = "card"): Promise<restaurantApi.ApproveCateringResponse> {
  const manual = manualForEvent(merchant, e);
  // Choosing e-transfer (when the shop takes it) never creates a card payment.
  const deposit = payWith === "etransfer" && manual ? null : await depositPayment(ctx, merchant, e);
  return { event: cateringDto(e, ctx.config.publicWebUrl, false), deposit, manual };
}

/** Deposit PaymentIntent for an approved event, or null when none is due / in-app payments aren't set up. */
export async function depositPayment(ctx: AppContext, merchant: Merchant, e: CateringEvent): Promise<restaurantApi.CateringDepositPaymentDto | null> {
  if (e.depositCents <= 0 || e.depositPaidAt || !e.approvedAt || e.status !== "quoted") return null;
  if (!(await paymentsReady(ctx.db, merchant))) return null;
  const pi = e.depositPaymentIntentId
    ? await retrieveConnectPayment(ctx, merchant, e.depositPaymentIntentId)
    : await createConnectPayment(ctx, merchant, {
        amountCents: e.depositCents,
        connectedAccountId: merchant.stripeAccountId!,
        applicationFeeCents: platformFeeFor("deposit", e.depositCents, merchant),
        description: `${merchant.name} catering deposit #${e.number}`,
        metadata: { ll_kind: "catering_deposit", ll_id: e.id, merchant_id: merchant.id },
        idempotencyKey: `catering_deposit:${e.id}`,
      });
  if (!e.depositPaymentIntentId) await ctx.db.update(cateringEvents).set({ depositPaymentIntentId: pi.id }).where(eq(cateringEvents.id, e.id));
  return { paymentIntentId: pi.id, clientSecret: pi.clientSecret, amountCents: pi.amountCents };
}

async function confirmWithDeposit(ctx: AppContext, e: CateringEvent, patch: Partial<typeof cateringEvents.$inferInsert>): Promise<CateringEvent | null> {
  const [row] = await ctx.db
    .update(cateringEvents)
    .set({ ...patch, depositPaidAt: ctx.now(), depositProcessingAt: null, status: "confirmed", updatedAt: ctx.now() })
    .where(and(eq(cateringEvents.id, e.id), eq(cateringEvents.status, "quoted"), sql`${cateringEvents.depositPaidAt} is null`, sql`${cateringEvents.approvedAt} is not null`))
    .returning();
  return row ?? null;
}

/** Stripe webhook (ll_kind catering_deposit): deposit paid → confirmed. */
export async function onCateringDeposit(ctx: AppContext, eventId: string, paymentIntentId: string, outcome: "succeeded" | "failed" | "processing") {
  const [e] = await ctx.db.select().from(cateringEvents).where(eq(cateringEvents.id, eventId)).limit(1);
  if (!e) return;
  if (e.depositPaymentIntentId && e.depositPaymentIntentId !== paymentIntentId) return;
  if (outcome === "failed") {
    // A debit that was processing and bounced: the deposit is unpaid again and the customer can retry.
    if (e.depositProcessingAt && !e.depositPaidAt) await ctx.db.update(cateringEvents).set({ depositProcessingAt: null, updatedAt: ctx.now() }).where(eq(cateringEvents.id, e.id));
    return;
  }
  if (outcome === "processing") {
    if (e.depositPaidAt || e.depositProcessingAt) return;
    const [marked] = await ctx.db.update(cateringEvents).set({ depositProcessingAt: ctx.now(), updatedAt: ctx.now() }).where(and(eq(cateringEvents.id, e.id), sql`${cateringEvents.depositProcessingAt} is null`, sql`${cateringEvents.depositPaidAt} is null`)).returning();
    if (marked) await notifyDepositProcessing(ctx, marked);
    return;
  }
  const updated = await confirmWithDeposit(ctx, e, { depositPaymentIntentId: paymentIntentId });
  if (!updated) return;
  await notifyDepositReceived(ctx, updated);
}

async function notifyDepositProcessing(ctx: AppContext, e: CateringEvent) {
  const merchant = await loadMerchant(ctx.db, e.merchantId);
  if (!merchant) return;
  await notifyCustomer(ctx, {
    userId: e.userId,
    merchantId: merchant.id,
    title: `${merchant.name}: deposit payment is processing`,
    body: `Your ${money(e.depositCents)} deposit is processing. Bank debits can take a few business days. We'll confirm your event on ${e.eventDate} once ${merchant.name} receives it.`,
    sms: false,
    data: { type: "catering_deposit_processing", cateringEventId: e.id },
  });
}

async function notifyDepositReceived(ctx: AppContext, e: CateringEvent) {
  const merchant = await loadMerchant(ctx.db, e.merchantId);
  if (!merchant) return;
  await notifyCustomer(ctx, {
    userId: e.userId,
    merchantId: merchant.id,
    title: `${merchant.name}: catering confirmed`,
    body: `Thanks! ${merchant.name} received your ${money(e.depositCents)} deposit. Your event on ${e.eventDate} is confirmed.`,
    sms: false,
    data: { type: "catering_confirmed", cateringEventId: e.id },
  });
}

/**
 * Deposit taken outside the app (e-transfer, cash, cheque): staff records it. It writes a ledger row (method, date, amount,
 * bank reference), keeps the method on the event, and confirms the event once the deposit is covered. Amount defaults to the
 * deposit on the quote and the date to today; the date can't be in the future. Hand-recorded money carries no platform fee,
 * and (as before) can't be refunded from here.
 */
export async function markDepositPaid(ctx: AppContext, staff: StaffContext, eventId: string, input: z.infer<typeof restaurantApi.cateringMarkDepositBody> = { method: "other", sendReceipt: true }): Promise<CateringEvent> {
  const e = await getMerchantEvent(ctx.db, staff.merchant.id, eventId);
  if (e.depositPaidAt) return e;
  if (e.status !== "quoted" || !e.approvedAt) throw conflict("The customer must approve the quote before the deposit can be recorded");
  const today = todayFor(ctx, staff.merchant);
  const body = paymentsManualApi.recordPaymentBody.parse({
    method: input.method,
    amountCents: input.amountCents ?? Math.max(1, e.depositCents),
    receivedOn: input.receivedOn ?? today,
    bankReference: input.bankReference ?? null,
    note: input.note ?? null,
    sendReceipt: input.sendReceipt,
  });
  assertNotFuture(body.receivedOn, today);
  const ledger = await addLedger(ctx, staff, ctx.db, { subjectType: "catering_deposit", subjectId: e.id, body });
  const paid = (await liveLedger(ctx.db, "catering_deposit", e.id)).reduce((s, l) => s + l.amountCents, 0);
  if (e.depositCents > 0 && paid < e.depositCents) return e; // part payment: stays quoted until the deposit is covered
  const updated = await confirmWithDeposit(ctx, e, { depositMethod: ledger.method, depositReceivedOn: ledger.receivedOn });
  if (!updated) throw conflict("Event was just updated. Refresh and try again.");
  if (body.sendReceipt) await notifyDepositReceived(ctx, updated);
  return updated;
}

/** Balance after the deposit, taken by hand: ledger row, and the balance invoice (if one is open) is marked paid when covered. */
export async function recordBalancePayment(ctx: AppContext, staff: StaffContext, eventId: string, input: z.infer<typeof paymentsManualApi.recordPaymentBody>): Promise<CateringEvent> {
  const e = await getMerchantEvent(ctx.db, staff.merchant.id, eventId);
  if (e.status !== "confirmed" && e.status !== "completed") throw conflict("Only a confirmed event has a balance to record");
  assertNotFuture(input.receivedOn, todayFor(ctx, staff.merchant));
  const due = Math.max(0, e.totalCents - (e.depositPaidAt ? e.depositCents : 0));
  const already = (await liveLedger(ctx.db, "catering_balance", e.id)).reduce((s, l) => s + l.amountCents, 0);
  if (already >= due) throw conflict("The balance is already covered");
  await addLedger(ctx, staff, ctx.db, { subjectType: "catering_balance", subjectId: e.id, body: input });
  if (already + input.amountCents >= due && e.invoiceId) {
    const [inv] = await ctx.db.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, e.invoiceId)).limit(1);
    if (inv?.status === "open") await markInvoicePaid(ctx, staff, e.invoiceId, { method: input.method === "cash" ? "cash" : input.method === "etransfer" ? "etransfer" : input.method === "cheque" ? "cheque" : "other", note: input.bankReference ? `ref ${input.bankReference}` : (input.note ?? null) });
  }
  if (input.sendReceipt) {
    await notifyCustomer(ctx, { userId: e.userId, merchantId: staff.merchant.id, title: `${staff.merchant.name}: payment received`, body: `${staff.merchant.name} received ${receiptLine(input.amountCents, input.method, input.receivedOn)} for catering #${e.number}. Thank you.`, sms: false, data: { type: "catering_payment", cateringEventId: e.id } });
  }
  return getMerchantEvent(ctx.db, staff.merchant.id, e.id);
}

/**
 * Undo a payment recorded by hand (a mistake): owner only, with a reason, audited. A balance payment reopens the balance. A
 * deposit payment reopens the quote (the event goes back to "quoted") while nothing was built on it. A payment that settled
 * the balance invoice, or any payment on a finished event, can't be voided here: those need a refund.
 */
export async function voidEventPayment(ctx: AppContext, staff: StaffContext, eventId: string, body: z.output<typeof paymentsManualApi.voidPaymentBody>): Promise<CateringEvent> {
  const e = await getMerchantEvent(ctx.db, staff.merchant.id, eventId);
  const deposit = await liveLedger(ctx.db, "catering_deposit", e.id);
  const balance = await liveLedger(ctx.db, "catering_balance", e.id);
  const all = [...deposit, ...balance].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const target = body.paymentId ? all.find((l) => l.id === body.paymentId) : all[all.length - 1];
  if (!target) throw conflict("There is no recorded payment to void");
  if (target.subjectType === "catering_balance") {
    if (e.invoiceId) {
      const [inv] = await ctx.db.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, e.invoiceId)).limit(1);
      if (inv?.status === "paid") throw conflict("This payment settled the balance invoice, which is paid. Refund it from the invoice instead.");
    }
  } else {
    if (e.status !== "confirmed" || e.invoiceId || balance.length) throw conflict("Void the later payments first. A deposit can only be voided while the event is confirmed and nothing else has been taken.");
    if (e.depositPaymentIntentId) throw conflict("The deposit was paid by card. Refund it instead.");
  }
  await voidLedger(ctx, staff, target.subjectType as "catering_deposit" | "catering_balance", e.id, body.reason, target.id);
  if (target.subjectType === "catering_deposit") {
    const left = (await liveLedger(ctx.db, "catering_deposit", e.id)).reduce((s, l) => s + l.amountCents, 0);
    if (e.depositCents <= 0 || left < e.depositCents) {
      await ctx.db
        .update(cateringEvents)
        .set({ depositPaidAt: null, depositMethod: null, depositReceivedOn: null, status: "quoted", updatedAt: ctx.now() })
        .where(and(eq(cateringEvents.id, e.id), eq(cateringEvents.status, "confirmed")));
    }
  }
  return getMerchantEvent(ctx.db, staff.merchant.id, e.id);
}

/** Public quote view: the e-transfer instructions for the deposit, when the shop takes them. */
export function manualForEvent(merchant: Merchant, e: CateringEvent): restaurantApi.PublicCateringResponse["manual"] {
  if (e.status !== "quoted" || !e.approvedAt || e.depositPaidAt || e.depositCents <= 0) return null;
  return manualInstructions(merchant, e.depositCents, e.referenceCode);
}

/** What the customer may choose for the deposit: card and bank debit need the shop's Stripe account; e-transfer needs its settings. */
export async function payOptions(ctx: AppContext, merchant: Merchant): Promise<{ card: boolean; etransfer: boolean }> {
  return { card: await paymentsReady(ctx.db, merchant), etransfer: !!etransferOffer(merchant) };
}

/** The refund tiers of the hall this event is booked into, so the customer sees the shop's policy before signing. */
export async function cancellationTiers(db: DbOrTx, e: CateringEvent): Promise<{ minDaysBefore: number; refundBps: number }[] | null> {
  if (!e.hallBookingId) return null;
  const [row] = await db
    .select({ policy: halls.refundPolicy })
    .from(hallBookings)
    .innerJoin(halls, eq(halls.id, hallBookings.hallId))
    .where(eq(hallBookings.id, e.hallBookingId))
    .limit(1);
  return row ? [...row.policy.tiers].sort((a, b) => b.minDaysBefore - a.minDaysBefore) : null;
}

/** Stamp the first time the customer opens the quote link (feeds "sent 2 days ago, not opened"). */
export async function markQuoteOpened(ctx: AppContext, e: CateringEvent): Promise<void> {
  if (e.quoteOpenedAt) return;
  await ctx.db.update(cateringEvents).set({ quoteOpenedAt: ctx.now() }).where(and(eq(cateringEvents.id, e.id), sql`${cateringEvents.quoteOpenedAt} is null`));
}

/** Other confirmed events or hall bookings on the same date (for a non-blocking "date clash" note). */
export async function dateClashCount(db: DbOrTx, e: CateringEvent): Promise<number> {
  const [ev] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cateringEvents)
    .where(and(eq(cateringEvents.merchantId, e.merchantId), eq(cateringEvents.eventDate, e.eventDate), eq(cateringEvents.status, "confirmed"), sql`${cateringEvents.id} <> ${e.id}`));
  const [hb] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(hallBookings)
    .where(and(eq(hallBookings.merchantId, e.merchantId), eq(hallBookings.status, "confirmed"), sql`(${hallBookings.startsAt} at time zone 'America/Toronto')::date = ${e.eventDate}::date`, e.hallBookingId ? sql`${hallBookings.id} <> ${e.hallBookingId}` : undefined));
  return Number(ev?.n ?? 0) + Number(hb?.n ?? 0);
}

/** Pipeline money tiles and the 8-week strip (staff list response). */
export async function pipelineSummary(ctx: AppContext, merchant: Merchant): Promise<restaurantApi.CateringSummary> {
  const rows = await ctx.db.select().from(cateringEvents).where(and(eq(cateringEvents.merchantId, merchant.id), inArray(cateringEvents.status, ["inquiry", "tasting", "quoted", "confirmed"])));
  const today = localDate(ctx.now(), merchant.timezone);
  const day = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const in14 = day(today, 14);
  const balancePaid = new Map<string, number>();
  const ids = rows.filter((r) => r.status === "confirmed").map((r) => r.id);
  if (ids.length) for (const l of await ledgerDtos(ctx.db, "catering_balance", ids)) if (!l.voidedAt) balancePaid.set(l.subjectId, (balancePaid.get(l.subjectId) ?? 0) + l.amountCents);
  const weeks = Array.from({ length: 8 }, (_, i) => ({ start: day(today, i * 7), confirmed: 0, pending: 0 }));
  let openQuotesCents = 0;
  let depositsToCollectCents = 0;
  let balancesDue14dCents = 0;
  for (const e of rows) {
    if (e.status === "quoted") {
      openQuotesCents += e.totalCents;
      if (e.approvedAt && !e.depositPaidAt) depositsToCollectCents += e.depositCents;
    }
    if (e.status === "confirmed") {
      if (e.eventDate >= today && e.eventDate <= in14) balancesDue14dCents += Math.max(0, e.totalCents - (e.depositPaidAt ? e.depositCents : 0) - (balancePaid.get(e.id) ?? 0));
    }
    const wk = weeks.findIndex((w, i) => e.eventDate >= w.start && (i === 7 ? e.eventDate < day(w.start, 7) : e.eventDate < weeks[i + 1]!.start));
    if (wk >= 0) {
      if (e.status === "confirmed") weeks[wk]!.confirmed++;
      else if (e.status === "quoted" || e.status === "tasting") weeks[wk]!.pending++;
    }
  }
  const booked = rows.filter((e) => e.status === "confirmed" && e.eventDate >= today && e.eventDate < day(today, 56));
  return { openQuotesCents, depositsToCollectCents, balancesDue14dCents, bookedNext8wEvents: booked.length, bookedNext8wCents: booked.reduce((s, e) => s + e.totalCents, 0), weeks };
}

// ---------------------------------------------------------------------------
// Invoice for the balance, completion, cancellation
// ---------------------------------------------------------------------------
export async function convertToInvoice(ctx: AppContext, staff: StaffContext, eventId: string, body: z.infer<typeof restaurantApi.cateringInvoiceBody>) {
  const merchant = staff.merchant;
  const e = await getMerchantEvent(ctx.db, merchant.id, eventId);
  if (e.status !== "confirmed" && e.status !== "completed") throw conflict("Only confirmed events can be invoiced");
  const [existing] = await ctx.db.select({ id: invoices.id, number: invoices.number, status: invoices.status }).from(invoices).where(and(eq(invoices.cateringEventId, e.id), inArray(invoices.status, ["draft", "open", "paid"]))).limit(1);
  if (existing) throw conflict(`Invoice #${existing.number} already exists for this event`);
  const depositApplied = e.depositPaidAt ? Math.min(e.depositCents, e.totalCents) : 0;
  const amountDue = Math.max(0, e.totalCents - depositApplied);
  // Platform fee applies only to money taken in-app (deposit + balance).
  const fee = (await paymentsReady(ctx.db, merchant)) ? platformFeeFor("invoice", e.totalCents, merchant) : platformFeeFor("deposit", e.depositPaymentIntentId ? depositApplied : 0, merchant);
  const invoice = await ctx.db.transaction(async (tx) => {
    const number = await nextNumber(tx, merchant.id, "invoice");
    const [inv] = await tx
      .insert(invoices)
      .values({
        merchantId: merchant.id,
        userId: e.userId,
        cateringEventId: e.id,
        number,
        lineItems: e.lineItems,
        subtotalCents: e.subtotalCents,
        taxCents: e.taxCents,
        depositAppliedCents: depositApplied,
        totalCents: e.totalCents,
        amountDueCents: amountDue,
        platformFeeCents: fee,
        status: "draft",
        payToken: randomToken(24),
      })
      .returning();
    await tx.update(cateringEvents).set({ invoiceId: inv!.id, updatedAt: ctx.now() }).where(eq(cateringEvents.id, e.id));
    return inv!;
  });
  const sent = body.send ? await sendInvoice(ctx, staff, invoice.id) : null;
  const [fresh] = await ctx.db.select().from(invoices).where(eq(invoices.id, invoice.id)).limit(1);
  const final = fresh!;
  const dto: restaurantApi.CateringInvoiceDto = {
    id: final.id,
    number: final.number,
    cateringEventId: e.id,
    status: sent?.status ?? final.status,
    subtotalCents: final.subtotalCents,
    taxCents: final.taxCents,
    totalCents: final.totalCents,
    depositAppliedCents: final.depositAppliedCents,
    amountDueCents: final.amountDueCents,
    payUrl: final.status === "open" ? `${ctx.config.publicWebUrl}/i/${final.payToken}` : null,
  };
  return { invoice: dto, event: await staffDto(ctx, (await getMerchantEvent(ctx.db, merchant.id, e.id))) };
}

export async function completeEvent(ctx: AppContext, staff: StaffContext, eventId: string): Promise<CateringEvent> {
  const e = await getMerchantEvent(ctx.db, staff.merchant.id, eventId);
  if (e.status !== "confirmed") throw conflict(`Only confirmed events can be completed (this one is ${e.status})`);
  const [row] = await ctx.db.update(cateringEvents).set({ status: "completed", updatedAt: ctx.now() }).where(eq(cateringEvents.id, e.id)).returning();
  return row!;
}

export async function cancelEvent(ctx: AppContext, staff: StaffContext, eventId: string, body: z.infer<typeof restaurantApi.cateringCancelBody>): Promise<CateringEvent> {
  const merchant = staff.merchant;
  const e = await getMerchantEvent(ctx.db, merchant.id, eventId);
  if (e.status === "cancelled" || e.status === "completed") throw conflict(`Event is already ${e.status}`);
  const now = ctx.now();
  const notes = body.reason ? [e.notes, `Cancelled: ${body.reason}`].filter(Boolean).join("\n") : e.notes;
  // Refund first: if Stripe refuses, the event stays open. A retry reuses the same idempotency key.
  const refundCents = await resolveDepositRefund(ctx, merchant, body.refund, e);
  if (refundCents > 0) await refundDeposit(ctx, merchant, { kind: "catering_deposit", id: e.id, paymentIntentId: e.depositPaymentIntentId! }, refundCents, body.reason ?? "Catering cancelled");
  const row = await ctx.db.transaction(async (tx) => {
    // Free the hall too: a cancelled event shouldn't keep a room blocked.
    if (e.hallBookingId) {
      await tx.update(hallBookings).set({ status: "cancelled", holdExpiresAt: null }).where(and(eq(hallBookings.id, e.hallBookingId), inArray(hallBookings.status, ["hold", "confirmed"])));
    }
    const [r] = await tx
      .update(cateringEvents)
      .set({ status: "cancelled", notes, updatedAt: now, ...(refundCents > 0 ? { depositRefundCents: refundCents, depositRefundedAt: now } : {}) })
      .where(eq(cateringEvents.id, e.id))
      .returning();
    if (e.invoiceId) await tx.update(invoices).set({ status: "void" }).where(and(eq(invoices.id, e.invoiceId), inArray(invoices.status, ["draft", "open"])));
    return r!;
  });
  await notifyCustomer(ctx, {
    userId: e.userId,
    merchantId: merchant.id,
    title: `${merchant.name}: catering cancelled`,
    body: `Catering #${e.number} for ${e.eventDate} was cancelled.${refundCents > 0 ? refundSentence(refundCents) : e.depositPaidAt ? ` ${merchant.name} will be in touch about your deposit.` : ""}`,
    sms: false,
    data: { type: "catering_cancelled", cateringEventId: e.id, ...(refundCents > 0 ? { refundCents } : {}) },
  });
  return row;
}
