/**
 * Pre-order wait list and balance reminders (restaurant.degh_preorders).
 *  - A full day takes names: the guest agrees to one message if a pot opens up (CASL wording stored with the row).
 *  - When a pre-order is cancelled, exactly one waiting guest is messaged per pot it frees (WhatsApp first, then SMS).
 *  - "Remind" on an order with a balance sends one reminder (WhatsApp first, then SMS), at most one every few hours.
 */
import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { catalogItems, merchants, orderItems, orders, preorderWaitlist, users } from "@ll/db";
import { restaurantApi, whatsappApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { HttpError, badRequest, notFound } from "../lib/errors.js";
import { normalizePhone } from "./channel-orders.js";
import { notifyCustomer } from "./commerceShared.js";
import { requireFeature } from "./features.js";
import { orderCancelledHooks, balanceDueCents } from "./orders.js";
import { addDaysKey, capFor, dateKeyIn, potRowsOnDay } from "./preorderPlanning.js";
import { canSendTransactional, getSession, renderTemplateText, sendWhatsApp, sendWhatsAppNotification } from "./whatsapp.js";
import { sendSms } from "./opt-out.js";

type Merchant = typeof merchants.$inferSelect;

const REMIND_MIN_GAP_MS = 6 * 3_600_000;

const longDay = (dateKey: string) => new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${dateKey}T12:00:00Z`));
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const nth = (n: number) => (n === 1 ? "first" : n === 2 ? "second" : n === 3 ? "third" : `number ${n}`);

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------
export async function joinWaitlist(ctx: AppContext, merchant: Merchant, body: z.infer<typeof restaurantApi.waitlistBody>): Promise<restaurantApi.WaitlistResponse> {
  await requireFeature(ctx.db, merchant, "restaurant.degh_preorders");
  const [item] = await ctx.db.select().from(catalogItems).where(and(eq(catalogItems.id, body.itemId), eq(catalogItems.merchantId, merchant.id))).limit(1);
  if (!item || !item.preorderOnly) throw notFound("Dish");
  const today = dateKeyIn(ctx.now(), merchant.timezone);
  if (body.date < today || body.date > addDaysKey(today, 60)) throw badRequest("Pick a day in the next 60 days");
  const phone = normalizePhone(body.phone);
  if (phone.replace(/\D/g, "").length < 10) throw badRequest("That phone number doesn't look right");
  const { cap } = capFor(merchant, body.date);
  if (cap != null) {
    const booked = (await potRowsOnDay(ctx.db, merchant, body.date)).reduce((s, r) => s + r.quantity, 0);
    if (booked < cap) throw new HttpError(409, "not_full", "That day still has pots. Order now instead of waiting.", { potsLeft: cap - booked });
  } else throw new HttpError(409, "not_full", "That day has no limit. Order now instead of waiting.");
  const [u] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
  const inserted = await ctx.db
    .insert(preorderWaitlist)
    .values({ merchantId: merchant.id, itemId: item.id, date: body.date, userId: u?.id ?? null, phone, name: body.name?.trim() || null, consentText: restaurantApi.WAITLIST_CONSENT_TEXT, createdAt: ctx.now() })
    .onConflictDoNothing()
    .returning({ id: preorderWaitlist.id });
  const waiting = await ctx.db.select({ id: preorderWaitlist.id, phone: preorderWaitlist.phone }).from(preorderWaitlist).where(and(eq(preorderWaitlist.merchantId, merchant.id), eq(preorderWaitlist.date, body.date), isNull(preorderWaitlist.notifiedAt))).orderBy(asc(preorderWaitlist.createdAt), asc(preorderWaitlist.id));
  const position = Math.max(1, waiting.findIndex((w) => w.phone === phone) + 1);
  return {
    date: body.date,
    position,
    alreadyWaiting: inserted.length === 0,
    message: `You're ${nth(position)} in line for ${longDay(body.date)}. We'll message you once if a pot opens up.`,
  };
}

/** Staff view of the wait list for a date range, oldest first. */
export async function listWaitlist(ctx: AppContext, merchant: Merchant, from: string, to: string): Promise<restaurantApi.WaitlistEntryDto[]> {
  await requireFeature(ctx.db, merchant, "restaurant.degh_preorders");
  const rows = await ctx.db
    .select({ w: preorderWaitlist, dish: catalogItems.name })
    .from(preorderWaitlist)
    .leftJoin(catalogItems, eq(catalogItems.id, preorderWaitlist.itemId))
    .where(and(eq(preorderWaitlist.merchantId, merchant.id), gte(preorderWaitlist.date, from), lte(preorderWaitlist.date, to)))
    .orderBy(asc(preorderWaitlist.date), asc(preorderWaitlist.createdAt));
  return rows.map((r) => ({ id: r.w.id, date: r.w.date, name: r.w.name, phone: r.w.phone, dish: r.dish, joinedAt: r.w.createdAt.toISOString(), notifiedAt: r.w.notifiedAt?.toISOString() ?? null }));
}

// ---------------------------------------------------------------------------
// Freed pots -> wait list
// ---------------------------------------------------------------------------
/** WhatsApp (inside the chat window or with an approved template) then SMS. */
async function messagePhone(ctx: AppContext, merchant: Merchant, phone: string, kind: "waitlist_open", vars: Record<string, string>, smsText: string): Promise<"whatsapp" | "sms" | "none"> {
  const session = await getSession(ctx, merchant.id, phone);
  if (session && canSendTransactional(session)) {
    const def = whatsappApi.WA_TEMPLATE_NAMES[kind];
    const params = def.params.map((p) => vars[p] ?? "");
    const r = await sendWhatsApp(ctx, merchant, phone, { text: renderTemplateText(kind, params), template: { name: def.name, params } }, session);
    if (r.sent) return "whatsapp";
  }
  try {
    return (await sendSms(ctx, phone, smsText)) ? "sms" : "none";
  } catch {
    return "none";
  }
}

/** Message the first `pots` guests waiting for a day (one message each, then they are marked notified). Returns how many were messaged. */
export async function notifyWaitlist(ctx: AppContext, merchantId: string, date: string, pots: number): Promise<number> {
  if (pots <= 0) return 0;
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!merchant) return 0;
  const rows = await ctx.db.select().from(preorderWaitlist).where(and(eq(preorderWaitlist.merchantId, merchantId), eq(preorderWaitlist.date, date), isNull(preorderWaitlist.notifiedAt))).orderBy(asc(preorderWaitlist.createdAt), asc(preorderWaitlist.id)).limit(pots);
  let sent = 0;
  for (const w of rows) {
    // Claim the row first so a retry can never message the same guest twice.
    const [claimed] = await ctx.db.update(preorderWaitlist).set({ notifiedAt: ctx.now() }).where(and(eq(preorderWaitlist.id, w.id), isNull(preorderWaitlist.notifiedAt))).returning({ id: preorderWaitlist.id });
    if (!claimed) continue;
    const link = `${ctx.config.publicWebUrl.replace(/\/$/, "")}/shops/${merchant.slug}`;
    const day = longDay(date);
    const via = await messagePhone(ctx, merchant, w.phone, "waitlist_open", { merchant: merchant.name, date: day }, `${merchant.name}: a pot opened up for ${day}. Order it before it goes: ${link} Reply STOP to opt out.`);
    if (via !== "none") sent++;
  }
  return sent;
}

// A cancelled pre-order frees its pots for the wait list.
orderCancelledHooks.push(async (ctx, order) => {
  if (order.kind !== "preorder" || !order.pickupAt) return;
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, order.merchantId)).limit(1);
  if (!m) return;
  const [potRow] = await ctx.db
    .select({ pots: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int` })
    .from(orderItems)
    .innerJoin(catalogItems, eq(catalogItems.id, orderItems.catalogItemId))
    .where(and(eq(orderItems.orderId, order.id), eq(catalogItems.preorderOnly, true)));
  const date = dateKeyIn(order.pickupAt, m.timezone);
  if (date < dateKeyIn(ctx.now(), m.timezone)) return;
  await notifyWaitlist(ctx, m.id, date, potRow?.pots ?? 0);
});

// ---------------------------------------------------------------------------
// Remind balance
// ---------------------------------------------------------------------------
export async function remindBalance(ctx: AppContext, staff: StaffContext, orderId: string): Promise<restaurantApi.RemindBalanceResponse> {
  const merchant = staff.merchant;
  const [order] = await ctx.db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.merchantId, merchant.id))).limit(1);
  if (!order) throw notFound("Order");
  const due = balanceDueCents(order);
  const out = (p: Partial<restaurantApi.RemindBalanceResponse>): restaurantApi.RemindBalanceResponse => ({ orderId, balanceDueCents: due, channel: "none", sent: false, ...p });
  if (due <= 0 || order.status === "picked_up") return out({ reason: "not_due" });
  if (order.balanceRemindedAt && ctx.now().getTime() - order.balanceRemindedAt.getTime() < REMIND_MIN_GAP_MS) return out({ reason: "too_soon" });
  const [u] = await ctx.db.select({ phone: users.phone, deletedAt: users.deletedAt }).from(users).where(eq(users.id, order.userId)).limit(1);
  if (!u?.phone || u.deletedAt) return out({ reason: "no_phone" });
  const when = order.pickupAt ? new Intl.DateTimeFormat("en-CA", { timeZone: merchant.timezone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(order.pickupAt).replace(/ /g, " ") : "at pickup";
  const vars = { merchant: merchant.name, order_number: String(order.number), amount: money(due), pickup: when };

  const wa = await sendWhatsAppNotification(ctx, { merchantId: merchant.id, userId: order.userId, kind: "balance_reminder", vars });
  let channel: "whatsapp" | "sms" | "none" = wa.sent ? "whatsapp" : "none";
  if (!wa.sent) {
    const text = `${merchant.name}: ${money(due)} is left to pay for order #${order.number} at pickup (${when}).`;
    const r = await notifyCustomer(ctx, { userId: order.userId, merchantId: merchant.id, title: `Balance for order #${order.number}`, body: text, push: false, sms: true, data: { type: "order_balance", orderId: order.id } });
    if (r.sms) channel = "sms";
  }
  if (channel === "none") return out({ reason: "no_consent" });
  await ctx.db.update(orders).set({ balanceRemindedAt: ctx.now() }).where(eq(orders.id, order.id));
  return out({ channel, sent: true });
}
