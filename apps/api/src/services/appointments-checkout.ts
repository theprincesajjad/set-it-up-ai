/**
 * Appointment checkout: turns a visit into an invoice (services/invoices.ts does the rest) with the deposit
 * credited, an optional loyalty reward, and a tip attributed to the stylist.
 *
 *  - counter: the client pays at the desk (cash, tap on the shop's terminal). The invoice is marked paid
 *    right away; the tip is recorded on it. Platform fee on the balance: 0% (FEES.appointmentCheckoutBps).
 *  - link: the pay link is texted. The client picks their tip on the pay page; the stylist it goes to is
 *    recorded now (tipStaffId).
 * Points go through ledger.awardPurchase from the invoice lines only: tax and tips never earn, and a
 * no-earn category line earns nothing.
 */
import { and, eq, inArray } from "drizzle-orm";
import { appointments, invoices, merchantMembers, merchantStaff, services, type LineItem } from "@ll/db";
import { tipWithinLimit, type appointmentsApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { randomToken } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { appointmentDto, getAppointment, type Appointment } from "./appointments.js";
import { nextNumber } from "./counters.js";
import { isPharmacy, pharmacyNoCheckout } from "./pharmacy-guard.js";
import { platformFeeFor } from "./fees.js";
import { markInvoicePaid, sendInvoice, voidInvoice } from "./invoices.js";
import { findOrCreateCustomerByPhone, redeemReward } from "./ledger.js";
import { requirePhone } from "./merchant.js";
import { autoSetPreferred } from "./preferred-staff.js";
import { priceLineItems } from "./quotes.js";

type Invoice = typeof invoices.$inferSelect;

export function checkoutInvoiceDto(i: Invoice, publicWebUrl: string): appointmentsApi.CheckoutInvoiceDto {
  const discount = i.lineItems.reduce((n, l) => n + Math.min(0, l.quantity * l.unitPriceCents), 0);
  return {
    id: i.id,
    number: i.number,
    status: i.status,
    subtotalCents: i.subtotalCents,
    discountCents: -discount,
    taxCents: i.taxCents,
    totalCents: i.totalCents,
    depositAppliedCents: i.depositAppliedCents,
    tipCents: i.tipCents,
    tipStaffId: i.tipStaffId,
    amountDueCents: i.amountDueCents,
    platformFeeCents: i.platformFeeCents,
    pointsEarned: i.pointsEarned,
    payUrl: i.status === "open" ? `${publicWebUrl}/i/${i.payToken}` : null,
  };
}

export async function checkout(ctx: AppContext, staff: StaffContext, id: string, body: z.output<typeof appointmentsApi.checkoutBody>): Promise<appointmentsApi.CheckoutResponse> {
  const merchant = staff.merchant;
  // A pharmacy appointment is never billed or rewarded here (no invoice, no points, no reward): completion goes through the status change.
  if (isPharmacy(merchant)) throw pharmacyNoCheckout();
  let a = await getAppointment(ctx.db, merchant.id, id);

  // A second checkout: a paid invoice is final (return it); an unpaid one is voided and rebuilt.
  if (a.invoiceId) {
    const [old] = await ctx.db.select().from(invoices).where(eq(invoices.id, a.invoiceId)).limit(1);
    if (old?.status === "paid") return { appointment: await appointmentDto(ctx.db, a), invoice: checkoutInvoiceDto(old, ctx.config.publicWebUrl), payUrl: null };
    if (old && old.status !== "void") await voidInvoice(ctx, staff, old.id);
  } else if (a.status === "cancelled" || a.status === "no_show") {
    // A visit marked Done at the chair (the walk-in line) has no invoice yet: it can still be checked out.
    throw conflict(`This appointment is ${a.status.replace("_", " ")}`);
  }

  // The client: invoices belong to a customer, so a walk-in with no phone needs one now.
  let userId = a.userId;
  if (!userId) {
    if (!body.customer?.phone && !body.customer?.userId) throw new HttpError(409, "customer_required", "Add the client's phone number to check out. They earn points and get a receipt.");
    if (body.customer.userId) userId = body.customer.userId;
    else userId = (await findOrCreateCustomerByPhone(ctx.db, requirePhone(body.customer.phone!), body.customer.name ?? a.customerName)).user.id;
  }

  const items = body.items ?? a.items;
  if (!items.length) throw badRequest("Nothing to bill");
  const serviceIds = [...new Set(items.map((i) => i.serviceId).filter((s): s is string => !!s))];
  const svcs = serviceIds.length ? await ctx.db.select({ id: services.id, categoryId: services.categoryId, taxable: services.taxable }).from(services).where(and(eq(services.merchantId, merchant.id), inArray(services.id, serviceIds))) : [];
  const lines: { description: string; quantity: number; unitPriceCents: number; kind: "labour" | "part" | "fee" | "other"; categoryId: string | null; taxable?: boolean }[] = items.map((i) => ({
    description: i.name,
    quantity: 1,
    unitPriceCents: i.priceCents,
    kind: "labour",
    categoryId: svcs.find((s) => s.id === i.serviceId)?.categoryId ?? null,
    // A service marked "no tax" (a gift card, a product with its own rules) is billed without it.
    taxable: svcs.find((s) => s.id === i.serviceId)?.taxable ?? true,
  }));
  const serviceTotal = lines.reduce((n, l) => n + l.unitPriceCents, 0);

  // A reward redeemed at the counter becomes a credit line (it can't earn points).
  let discountCents = 0;
  if (body.rewardId) {
    const [member] = await ctx.db.select({ id: merchantMembers.id }).from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchant.id), eq(merchantMembers.userId, userId))).limit(1);
    if (!member) throw new HttpError(409, "not_a_member", "This client hasn't joined your rewards yet, so there's no reward to apply.");
    const r = await redeemReward(ctx, { merchantId: merchant.id, memberId: member.id, rewardId: body.rewardId, source: "staff_app", staffUserId: staff.user.id, idempotencyKey: `appt_reward:${a.id}:${body.rewardId}`, subtotalCents: serviceTotal });
    discountCents = Math.min(serviceTotal, Math.max(0, r.redemption.discountCents ?? 0));
    if (discountCents > 0) lines.push({ description: `Reward: ${r.reward.name}`, quantity: 1, unitPriceCents: -discountCents, kind: "other", categoryId: null });
  }
  // Like tiffin: tax only for a shop that says it is registered for GST/HST. An unanswered status adds nothing, so "plus HST" copy and the bill agree.
  const priced = await priceLineItems(ctx.db, { id: merchant.id, neighbourhoodId: merchant.neighbourhoodId, taxRegistered: merchant.taxRegistered === true }, lines);

  // Tip: at the desk only; on the pay link the client picks it (the stylist is recorded either way).
  const counter = body.mode === "counter";
  const tipCents = counter ? body.tipCents : 0;
  if (!tipWithinLimit(tipCents, serviceTotal)) throw badRequest("A tip can be at most 100% of the services");
  const tipStaffId = body.tipStaffId ?? a.staffId ?? null;
  if (tipStaffId) {
    const [m] = await ctx.db.select({ userId: merchantStaff.userId }).from(merchantStaff).where(and(eq(merchantStaff.merchantId, merchant.id), eq(merchantStaff.userId, tipStaffId))).limit(1);
    if (!m) throw badRequest("Unknown staff member for the tip");
  }

  const depositApplied = a.depositPaidAt ? Math.min(a.depositCents, priced.totalCents) : 0;
  const amountDue = Math.max(0, priced.totalCents - depositApplied);
  // The deposit was paid online (1%); the balance taken through the calendar carries no platform fee.
  const fee = platformFeeFor("deposit", depositApplied, merchant) + platformFeeFor("appointment_checkout", amountDue, merchant);
  const now = ctx.now();

  const invoice = await ctx.db.transaction(async (tx) => {
    const number = await nextNumber(tx, merchant.id, "invoice");
    const [inv] = await tx
      .insert(invoices)
      .values({
        merchantId: merchant.id,
        userId,
        ticketId: null,
        number,
        lineItems: priced.lineItems as LineItem[],
        subtotalCents: priced.subtotalCents,
        taxCents: priced.taxCents,
        depositAppliedCents: depositApplied,
        totalCents: priced.totalCents,
        amountDueCents: amountDue,
        platformFeeCents: fee,
        status: counter ? "open" : "draft",
        payToken: randomToken(24),
        appointmentId: a.id,
        tipCents,
        tipStaffId,
      })
      .returning();
    await tx
      .update(appointments)
      .set({
        userId,
        items,
        invoiceId: inv!.id,
        status: "completed",
        arrivedAt: a.arrivedAt ?? now,
        startedAt: a.startedAt ?? a.arrivedAt ?? now,
        completedAt: a.completedAt ?? now,
        holdExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(appointments.id, a.id));
    return inv!;
  });

  await autoSetPreferred(ctx, userId, merchant.id, a.staffId);
  if (counter) await markInvoicePaid(ctx, staff, invoice.id, { method: body.counterMethod, note: body.note ?? null });
  else await sendInvoice(ctx, staff, invoice.id);

  const [fresh] = await ctx.db.select().from(invoices).where(eq(invoices.id, invoice.id)).limit(1);
  a = await getAppointment(ctx.db, merchant.id, id);
  const dto = checkoutInvoiceDto(fresh!, ctx.config.publicWebUrl);
  return { appointment: await appointmentDto(ctx.db, a), invoice: dto, payUrl: counter ? null : dto.payUrl };
}

export async function invoiceFor(ctx: AppContext, merchantId: string, a: Appointment) {
  if (!a.invoiceId) throw notFound("Invoice");
  const [i] = await ctx.db.select().from(invoices).where(and(eq(invoices.id, a.invoiceId), eq(invoices.merchantId, merchantId))).limit(1);
  if (!i) throw notFound("Invoice");
  return checkoutInvoiceDto(i, ctx.config.publicWebUrl);
}
