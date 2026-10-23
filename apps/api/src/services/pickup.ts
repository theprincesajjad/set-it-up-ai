/**
 * Finished work that has not been collected: the pickup reminder ladder and the 60-day record.
 *
 *   day 3   text: it is ready                      (service.rebooking)
 *   day 7   text with the pay link if money is due (service.rebooking)
 *   day 30  a call task for staff on the ticket    (service.tickets)
 *   day 60  flag the ticket "lien eligible"        (service.tickets) and send nothing
 *
 * Days count from the moment the ticket became ready. We record and show dates; whether and when to sell an unclaimed item is
 * the shop's legal decision (Repair and Storage Liens Act, Part III notice). Nothing here sells, notifies on the shop's behalf
 * or says a notice was sent unless staff record it. See packages/shared/src/service-rules.ts.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { invoices, merchants, serviceTickets, users } from "@ll/db";
import { LIEN_FLAG_DAYS, PICKUP_LADDER, dueSteps, serviceApi, t } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { conflict } from "../lib/errors.js";
import { itemLabel, money, notifyCustomer } from "./commerceShared.js";
import { getMerchantFeatures } from "./features.js";
import { customerLocale, withLang } from "./service-messages.js";
import { addTicketEvent, ensureStatusToken, getMerchantTicket, getTicketDetail, readyDays, type Ticket } from "./tickets.js";

type Merchant = typeof merchants.$inferSelect;

export async function listUncollected(ctx: AppContext, merchant: Merchant): Promise<serviceApi.UncollectedResponse> {
  const rows = await ctx.db
    .select({ t: serviceTickets, name: users.name })
    .from(serviceTickets)
    .innerJoin(users, eq(users.id, serviceTickets.userId))
    .where(and(eq(serviceTickets.merchantId, merchant.id), eq(serviceTickets.status, "ready")))
    .orderBy(serviceTickets.readyAt);
  const now = ctx.now();
  const items = rows
    .map((r) => ({
      ticketId: r.t.id,
      number: r.t.number,
      customerName: r.name,
      itemLabel: itemLabel(r.t.itemKind, r.t.itemDetails).replace(/^your /, ""),
      readyDays: readyDays(r.t, now) ?? 0,
      lastStep: r.t.pickupReminderDay,
      lienEligible: !!r.t.lienEligibleAt || (readyDays(r.t, now) ?? 0) >= LIEN_FLAG_DAYS,
      lienNoticeSentAt: r.t.lienNoticeSentAt ? r.t.lienNoticeSentAt.toISOString() : null,
    }))
    .sort((a, b) => b.readyDays - a.readyDays);
  return { items, ladder: PICKUP_LADDER.map((s) => ({ day: s.day, action: s.action })) };
}

/** Staff records that they sent the notice required before sale. Their words, their date; we only keep the record. */
export async function recordLienNotice(ctx: AppContext, staff: StaffContext, ticketId: string, body: z.infer<typeof serviceApi.lienNoticeBody>) {
  const ticket = await getMerchantTicket(ctx.db, staff.merchant.id, ticketId);
  const days = readyDays(ticket, ctx.now());
  if (ticket.status !== "ready" || days === null || (!ticket.lienEligibleAt && days < LIEN_FLAG_DAYS)) throw conflict(`This can be recorded once an item has been ready for ${LIEN_FLAG_DAYS} days.`);
  const now = ctx.now();
  const [row] = await ctx.db.update(serviceTickets).set({ lienNoticeSentAt: now, lienEligibleAt: ticket.lienEligibleAt ?? now, updatedAt: now }).where(eq(serviceTickets.id, ticket.id)).returning();
  const [who] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, staff.user.id)).limit(1);
  await addTicketEvent(ctx.db, ticket.id, { note: `Notice before sale recorded as sent by ${who?.name ?? "staff"}${body.note ? `: ${body.note}` : ""}`, visibleToCustomer: false, actorUserId: staff.user.id });
  return getTicketDetail(ctx, staff.merchant, row!, false);
}

/** Job, daily: walk the ladder for every ready ticket. Returns how many texts were sent. */
export async function runPickupReminders(ctx: AppContext): Promise<{ texts: number; tasks: number; flagged: number }> {
  const now = ctx.now();
  const out = { texts: 0, tasks: 0, flagged: 0 };
  const rows = await ctx.db
    .select({ t: serviceTickets, m: merchants })
    .from(serviceTickets)
    .innerJoin(merchants, eq(merchants.id, serviceTickets.merchantId))
    .where(eq(serviceTickets.status, "ready"))
    .limit(2000);
  const featureCache = new Map<string, boolean>();
  const rebookingOn = async (m: Merchant) => {
    if (!featureCache.has(m.id)) featureCache.set(m.id, (await getMerchantFeatures(ctx.db, m))["service.rebooking"].enabled);
    return featureCache.get(m.id)!;
  };
  for (const { t: ticket, m } of rows) {
    const days = readyDays(ticket, now) ?? 0;
    const steps = dueSteps(days, ticket.pickupReminderDay);
    if (!steps.length) continue;
    const top = steps[steps.length - 1]!.day;
    // Claim the steps first so two workers never double-send.
    const [claimed] = await ctx.db
      .update(serviceTickets)
      .set({ pickupReminderDay: top })
      .where(and(eq(serviceTickets.id, ticket.id), eq(serviceTickets.pickupReminderDay, ticket.pickupReminderDay), eq(serviceTickets.status, "ready")))
      .returning();
    if (!claimed) continue;
    const texts = steps.filter((s) => s.action === "text" || s.action === "text_with_pay_link");
    const sendStep = texts[texts.length - 1]; // a late job sends the latest text, not a stale one for every missed day
    for (const step of steps) {
      if (step.action === "staff_task") {
        const [u] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, ticket.userId)).limit(1);
        await addTicketEvent(ctx.db, ticket.id, { note: `Task: call ${u?.name ?? "the customer"}. Ready for ${step.day} days and not collected.`, visibleToCustomer: false });
        out.tasks++;
      } else if (step.action === "lien_flag") {
        await ctx.db.update(serviceTickets).set({ lienEligibleAt: now }).where(eq(serviceTickets.id, ticket.id));
        await addTicketEvent(ctx.db, ticket.id, { note: `Ready for ${step.day} days. You can start your notice before sale (Repair and Storage Liens Act). We have not sent anything.`, visibleToCustomer: false });
        out.flagged++;
      } else if (step === sendStep && (await rebookingOn(m))) {
        if (await sendPickupText(ctx, m, claimed, step.action === "text_with_pay_link")) out.texts++;
      }
    }
  }
  return out;
}

async function sendPickupText(ctx: AppContext, m: Merchant, ticket: Ticket, withPay: boolean): Promise<boolean> {
  const [open] = await ctx.db.select().from(invoices).where(and(eq(invoices.ticketId, ticket.id), inArray(invoices.status, ["open"]))).orderBy(desc(invoices.createdAt)).limit(1);
  const locale = await customerLocale(ctx.db, ticket.userId);
  const withToken = await ensureStatusToken(ctx.db, ticket);
  const vars = { shop: m.name, item: itemLabel(ticket.itemKind, ticket.itemDetails), n: ticket.number, url: withLang(`${ctx.config.publicWebUrl}/t/${withToken.statusToken}`, locale) };
  const body =
    withPay && open && open.amountDueCents > 0
      ? t(locale, "sv.msg.pickupDay7Pay", { ...vars, amount: money(open.amountDueCents), url: withLang(`${ctx.config.publicWebUrl}/i/${open.payToken}`, locale) })
      : t(locale, withPay ? "sv.msg.pickupDay7" : "sv.msg.pickupDay3", vars);
  const r = await notifyCustomer(ctx, { userId: ticket.userId, merchantId: m.id, title: t(locale, "sv.msg.readyTitle", { shop: m.name }), body, data: { type: "ticket_status", ticketId: ticket.id, status: "ready" } });
  await addTicketEvent(ctx.db, ticket.id, { note: `Pickup reminder texted (day ${withPay ? 7 : 3})`, visibleToCustomer: false });
  return r.sms || r.push > 0;
}
