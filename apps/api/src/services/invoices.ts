/**
 * Invoices (Pro: service.invoices). Built from the approved quote plus
 * extras, deposit applied, paid in-app via a public pay link
 * (/i/<payToken>) or marked paid at the counter. On payment the customer
 * earns points through ledger.awardPurchase (idempotency key `invoice:<id>`).
 */
import { and, desc, eq, inArray, lt, or, type SQL } from "drizzle-orm";
import { invoices, serviceTickets, type DbOrTx, type LineItem } from "@ll/db";
import type { serviceApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { randomToken } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { getPayments, platformFeeCents } from "../providers/payments.js";
import { decodeCursor, encodeCursor, iso, itemLabel, loadMerchant, money, notifyCustomer, paymentsReady, requirePaymentsReady } from "./commerceShared.js";
import { nextNumber } from "./counters.js";
import { requireFeature } from "./features.js";
import { awardPurchase } from "./ledger.js";
import { approvedQuoteFor, lineItemDto, priceLineItems } from "./quotes.js";
import { addTicketEvent, getMerchantTicket } from "./tickets.js";

export type Invoice = typeof invoices.$inferSelect;
type Merchant = NonNullable<Awaited<ReturnType<typeof loadMerchant>>>;

export function invoiceDto(i: Invoice, publicWebUrl: string): serviceApi.InvoiceDto {
  return {
    id: i.id,
    merchantId: i.merchantId,
    userId: i.userId,
    ticketId: i.ticketId,
    number: i.number,
    lineItems: i.lineItems.map(lineItemDto),
    subtotalCents: i.subtotalCents,
    taxCents: i.taxCents,
    depositAppliedCents: i.depositAppliedCents,
    totalCents: i.totalCents,
    amountDueCents: i.amountDueCents,
    platformFeeCents: i.platformFeeCents,
    status: i.status,
    payUrl: i.status === "open" ? `${publicWebUrl}/i/${i.payToken}` : null,
    paidAt: iso(i.paidAt),
    pointsEarned: i.pointsEarned,
    createdAt: i.createdAt.toISOString(),
  };
}

export async function getMerchantInvoice(db: DbOrTx, merchantId: string, invoiceId: string): Promise<Invoice> {
  const [i] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.merchantId, merchantId))).limit(1);
  if (!i) throw notFound("Invoice");
  return i;
}

export async function getInvoiceByToken(db: DbOrTx, token: string): Promise<Invoice> {
  if (!token || token.length < 16) throw notFound("Invoice");
  const [i] = await db.select().from(invoices).where(eq(invoices.payToken, token)).limit(1);
  if (!i || i.status === "draft") throw notFound("Invoice");
  return i;
}

export async function getMyInvoice(db: DbOrTx, userId: string, invoiceId: string): Promise<Invoice> {
  const [i] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId))).limit(1);
  if (!i || i.status === "draft") throw notFound("Invoice");
  return i;
}

export async function listInvoices(db: DbOrTx, merchant: Merchant, publicWebUrl: string, q: z.infer<typeof serviceApi.listInvoicesQuery>) {
  const conds: SQL[] = [eq(invoices.merchantId, merchant.id)];
  if (q.status) conds.push(eq(invoices.status, q.status));
  const cur = decodeCursor(q.cursor);
  if (cur) conds.push(or(lt(invoices.createdAt, cur.createdAt), and(eq(invoices.createdAt, cur.createdAt), lt(invoices.id, cur.id)))!);
  const rows = await db.select().from(invoices).where(and(...conds)).orderBy(desc(invoices.createdAt), desc(invoices.id)).limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  return { items: page.map((i) => invoiceDto(i, publicWebUrl)), nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!) : null };
}

export async function createInvoice(ctx: AppContext, staff: StaffContext, ticketId: string, body: z.infer<typeof serviceApi.createInvoiceBody>) {
  const merchant = staff.merchant;
  const ticket = await getMerchantTicket(ctx.db, merchant.id, ticketId);
  if (ticket.status === "cancelled") throw conflict("Ticket is cancelled");
  const [existing] = await ctx.db.select({ id: invoices.id, number: invoices.number }).from(invoices).where(and(eq(invoices.ticketId, ticket.id), eq(invoices.merchantId, merchant.id), inArray(invoices.status, ["draft", "open"]))).limit(1);
  if (existing) throw conflict(`Invoice #${existing.number} is already open for this ticket. Void it first.`);
  const quote = body.fromQuote ? await approvedQuoteFor(ctx.db, ticket) : null;
  if (body.fromQuote && !quote) throw conflict("This ticket has no approved quote. Send fromQuote=false with the line items.");
  const base: z.infer<typeof serviceApi.lineItemSchema>[] = (quote?.lineItems ?? []).map((l: LineItem) => ({ description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, kind: l.kind ?? "other", categoryId: l.categoryId ?? null }));
  const all = [...base, ...body.extraLineItems];
  if (!all.length) throw badRequest("An invoice needs at least one line item");
  const priced = await priceLineItems(ctx.db, merchant, all);
  const depositApplied = quote?.depositPaidAt ? Math.min(quote.depositCents, priced.totalCents) : 0;
  const amountDue = Math.max(0, priced.totalCents - depositApplied);
  // Platform fee applies only to money taken in-app (deposit + balance).
  const fee = (await paymentsReady(ctx.db, merchant)) ? platformFeeCents(priced.totalCents) : platformFeeCents(depositApplied);
  const invoice = await ctx.db.transaction(async (tx) => {
    const number = await nextNumber(tx, merchant.id, "invoice");
    const [inv] = await tx
      .insert(invoices)
      .values({
        merchantId: merchant.id,
        userId: ticket.userId,
        ticketId: ticket.id,
        number,
        lineItems: priced.lineItems,
        subtotalCents: priced.subtotalCents,
        taxCents: priced.taxCents,
        depositAppliedCents: depositApplied,
        totalCents: priced.totalCents,
        amountDueCents: amountDue,
        platformFeeCents: fee,
        status: "draft",
        payToken: randomToken(24),
      })
      .returning();
    await addTicketEvent(tx, ticket.id, { note: `Invoice #${number} created: ${money(priced.totalCents)}`, visibleToCustomer: false, actorUserId: staff.user.id });
    return inv!;
  });
  if (body.send) return sendInvoice(ctx, staff, invoice.id);
  return invoiceDto(invoice, ctx.config.publicWebUrl);
}

export async function sendInvoice(ctx: AppContext, staff: StaffContext, invoiceId: string) {
  const merchant = staff.merchant;
  const inv = await getMerchantInvoice(ctx.db, merchant.id, invoiceId);
  if (inv.status !== "draft" && inv.status !== "open") throw conflict(`Invoice is ${inv.status}`);
  let open = inv;
  if (inv.status === "draft") {
    [open] = (await ctx.db.update(invoices).set({ status: "open" }).where(and(eq(invoices.id, inv.id), eq(invoices.status, "draft"))).returning()) as [Invoice];
    if (!open) throw conflict("Invoice was just updated");
  }
  if (open.amountDueCents === 0) {
    // Deposit covered everything.
    return invoiceDto(await completeInvoicePayment(ctx, open, { inApp: false, actorUserId: staff.user.id, note: "Covered by deposit" }), ctx.config.publicWebUrl);
  }
  const [ticket] = open.ticketId ? await ctx.db.select().from(serviceTickets).where(eq(serviceTickets.id, open.ticketId)).limit(1) : [];
  const url = `${ctx.config.publicWebUrl}/i/${open.payToken}`;
  const what = ticket ? ` for ${itemLabel(ticket.itemKind, ticket.itemDetails)} (ticket #${ticket.number})` : "";
  const deposit = open.depositAppliedCents > 0 ? ` after your ${money(open.depositAppliedCents)} deposit` : "";
  if (ticket) await addTicketEvent(ctx.db, ticket.id, { note: `Invoice #${open.number}: ${money(open.amountDueCents)} due`, visibleToCustomer: true, actorUserId: staff.user.id });
  await notifyCustomer(ctx, {
    userId: open.userId,
    merchantId: merchant.id,
    title: `${merchant.name}: invoice #${open.number}`,
    body: `Your invoice${what} is ready: ${money(open.amountDueCents)} due${deposit}. Pay: ${url}`,
    data: { type: "invoice_sent", invoiceId: open.id, ticketId: open.ticketId, url },
  });
  return invoiceDto(open, ctx.config.publicWebUrl);
}

/** Start (or resume) an in-app payment for an open invoice. */
export async function payInvoice(ctx: AppContext, inv: Invoice): Promise<serviceApi.PayInvoiceResponse> {
  const merchant = await loadMerchant(ctx.db, inv.merchantId);
  if (!merchant) throw notFound("Invoice");
  if (inv.status === "paid") return { invoice: invoiceDto(inv, ctx.config.publicWebUrl), payment: null };
  if (inv.status !== "open") throw conflict(`Invoice is ${inv.status}`);
  await requireFeature(ctx.db, merchant, "service.invoices");
  const accountId = await requirePaymentsReady(ctx.db, merchant);
  if (inv.amountDueCents < 50) throw badRequest("The balance is too small to pay by card; pay at the counter");
  const payments = getPayments(ctx);
  const depositFee = platformFeeCents(inv.depositAppliedCents);
  const fee = Math.min(inv.amountDueCents, Math.max(0, platformFeeCents(inv.totalCents) - depositFee));
  const pi = inv.stripePaymentIntentId
    ? await payments.retrievePaymentIntent(inv.stripePaymentIntentId)
    : await payments.createPaymentIntent({
        amountCents: inv.amountDueCents,
        connectedAccountId: accountId,
        applicationFeeCents: fee,
        description: `${merchant.name} invoice #${inv.number}`,
        metadata: { ll_kind: "invoice", ll_id: inv.id, merchant_id: merchant.id },
        idempotencyKey: `invoice:${inv.id}:pi`,
      });
  let updated = inv;
  if (!inv.stripePaymentIntentId) {
    [updated] = (await ctx.db.update(invoices).set({ stripePaymentIntentId: pi.id, platformFeeCents: depositFee + fee }).where(eq(invoices.id, inv.id)).returning()) as [Invoice];
  }
  return { invoice: invoiceDto(updated, ctx.config.publicWebUrl), payment: { paymentIntentId: pi.id, clientSecret: pi.clientSecret, amountCents: pi.amountCents } };
}

/** Mark paid, award points once, log on the ticket, thank the customer. */
export async function completeInvoicePayment(ctx: AppContext, inv: Invoice, opts: { inApp: boolean; paymentIntentId?: string; actorUserId?: string | null; note?: string }): Promise<Invoice> {
  const now = ctx.now();
  const patch: Partial<typeof invoices.$inferInsert> = { status: "paid", paidAt: now };
  if (opts.paymentIntentId) patch.stripePaymentIntentId = opts.paymentIntentId;
  if (!opts.inApp) patch.platformFeeCents = platformFeeCents(inv.depositAppliedCents);
  const [paid] = await ctx.db.update(invoices).set(patch).where(and(eq(invoices.id, inv.id), eq(invoices.status, "open"))).returning();
  if (!paid) {
    const [cur] = await ctx.db.select().from(invoices).where(eq(invoices.id, inv.id)).limit(1);
    return cur!;
  }
  let points = 0;
  try {
    const r = await awardPurchase(ctx, {
      merchantId: paid.merchantId,
      userId: paid.userId,
      lines: paid.lineItems.map((l) => ({ amountCents: l.quantity * l.unitPriceCents, categoryId: l.categoryId ?? null, quantity: l.quantity })),
      source: opts.inApp ? "customer_app" : "dashboard",
      idempotencyKey: `invoice:${paid.id}`,
      externalRef: `invoice:${paid.number}`,
      staffUserId: opts.actorUserId ?? null,
      ignoreCooldown: true,
      joinedVia: "phone",
    });
    points = r.transaction?.points ?? 0;
  } catch (err) {
    if (!(err instanceof HttpError) || err.statusCode >= 500) throw err;
  }
  const [final] = await ctx.db.update(invoices).set({ pointsEarned: points }).where(eq(invoices.id, paid.id)).returning();
  const merchant = await loadMerchant(ctx.db, paid.merchantId);
  if (paid.ticketId) {
    await addTicketEvent(ctx.db, paid.ticketId, { note: `Invoice #${paid.number} paid${opts.note ? ` (${opts.note})` : ""}`, visibleToCustomer: true, actorUserId: opts.actorUserId ?? null });
  }
  if (merchant) {
    await notifyCustomer(ctx, {
      userId: paid.userId,
      merchantId: merchant.id,
      title: `${merchant.name}: payment received`,
      body: `Thanks! Invoice #${paid.number} is paid.${points > 0 ? ` You earned ${points} points at ${merchant.name}.` : ""}`,
      sms: opts.inApp,
      data: { type: "invoice_paid", invoiceId: paid.id, ticketId: paid.ticketId, points },
    });
  }
  return final!;
}

export async function markInvoicePaid(ctx: AppContext, staff: StaffContext, invoiceId: string, body: z.infer<typeof serviceApi.markInvoicePaidBody>) {
  const inv = await getMerchantInvoice(ctx.db, staff.merchant.id, invoiceId);
  if (inv.status !== "open") throw conflict(inv.status === "draft" ? "Send the invoice first" : `Invoice is ${inv.status}`);
  const done = await completeInvoicePayment(ctx, inv, { inApp: false, actorUserId: staff.user.id, note: body.note ? `${body.method}: ${body.note}` : body.method.replace("_", " ") });
  return invoiceDto(done, ctx.config.publicWebUrl);
}

export async function voidInvoice(ctx: AppContext, staff: StaffContext, invoiceId: string) {
  const inv = await getMerchantInvoice(ctx.db, staff.merchant.id, invoiceId);
  if (inv.status === "paid") throw conflict("Paid invoices can't be voided; refund in Stripe instead");
  if (inv.status === "void") throw conflict("Invoice is already void");
  const [row] = await ctx.db.update(invoices).set({ status: "void" }).where(eq(invoices.id, inv.id)).returning();
  if (inv.ticketId) await addTicketEvent(ctx.db, inv.ticketId, { note: `Invoice #${inv.number} voided`, visibleToCustomer: inv.status === "open", actorUserId: staff.user.id });
  return invoiceDto(row!, ctx.config.publicWebUrl);
}

export async function onInvoicePayment(ctx: AppContext, invoiceId: string, paymentIntentId: string, outcome: "succeeded" | "failed") {
  const [inv] = await ctx.db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) return;
  if (inv.stripePaymentIntentId && inv.stripePaymentIntentId !== paymentIntentId) return;
  if (outcome === "failed") {
    if (inv.ticketId) await addTicketEvent(ctx.db, inv.ticketId, { note: `Payment for invoice #${inv.number} failed`, visibleToCustomer: false });
    return;
  }
  if (inv.status !== "open") return;
  await completeInvoicePayment(ctx, inv, { inApp: true, paymentIntentId });
}

