/**
 * Invoices (Pro: service.invoices). Built from the approved quote plus
 * extras, deposit applied, paid in-app via a public pay link
 * (/i/<payToken>) or marked paid at the counter. On payment the customer
 * earns points through ledger.awardPurchase (idempotency key `invoice:<id>`).
 */
import { and, desc, eq, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { invoices, loyaltyPrograms, merchantCategories, quotes, serviceTickets, users, type DbOrTx, type LineItem } from "@ll/db";
import { OVERDUE_INVOICE_DAYS, calculateEarn, earnableAmounts, maxAuthorizedCents, tipWithinLimit, tipsEnabledFor, type FeatureKey, type serviceApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { randomToken } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { platformFeeFor } from "./fees.js";
import { createConnectPayment, retrieveConnectPayment } from "./payments.js";
import { decodeCursor, encodeCursor, iso, itemLabel, loadMerchant, money, notifyCustomer, paymentsReady, requirePaymentsReady } from "./commerceShared.js";
import { nextNumber } from "./counters.js";
import { requireApprovedEstimate } from "./auto-estimate.js";
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
    tipCents: i.tipCents,
  };
}

/** Catering / hall balance invoices ride the restaurant pack, and appointment checkouts ride booking.appointments (Café & Retail), not the Pro service plan. */
export function invoiceFeature(inv: Pick<Invoice, "cateringEventId" | "hallBookingId"> & { appointmentId?: string | null }): FeatureKey {
  return inv.cateringEventId ? "restaurant.catering" : inv.hallBookingId ? "restaurant.banquet" : inv.appointmentId ? "booking.appointments" : "service.invoices";
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

const DAY_MS = 86_400_000;

/** Plain-words last activity for an invoice row, from the invoice and its ticket's reminder ladder. */
function activityOf(i: Invoice, ticket: { pickupReminderDay: number } | null, merchantTz: string, now: Date): string {
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: merchantTz, month: "short", day: "numeric" }).format(d);
  if (i.status === "paid") return `Paid ${day(i.paidAt ?? i.createdAt)}`;
  if (i.status === "void") return "Voided";
  if (i.status === "draft") return "Not sent";
  const sent = Math.max(0, Math.floor((now.getTime() - i.createdAt.getTime()) / DAY_MS));
  const steps = ["day 0", ...(ticket && ticket.pickupReminderDay >= 3 ? ["day 3"] : []), ...(ticket && ticket.pickupReminderDay >= 7 ? ["day 7"] : [])];
  return sent === 0 && steps.length === 1 ? "Texted today" : `Texted ${steps.join(", ")}`;
}

export async function listInvoices(db: DbOrTx, merchant: Merchant, publicWebUrl: string, q: z.infer<typeof serviceApi.listInvoicesQuery>, now = new Date()): Promise<serviceApi.InvoiceListResponse> {
  const conds: SQL[] = [eq(invoices.merchantId, merchant.id)];
  if (q.status) conds.push(eq(invoices.status, q.status));
  if (q.filter === "overdue") conds.push(eq(invoices.status, "open"), lt(invoices.createdAt, new Date(now.getTime() - OVERDUE_INVOICE_DAYS * DAY_MS)));
  if (q.q?.trim()) {
    const term = `%${q.q.trim().replace(/[%_]/g, "")}%`;
    const digits = q.q.replace(/\D/g, "");
    const ors: SQL[] = [ilike(users.name, term)];
    if (digits.length >= 3) ors.push(ilike(users.phone, `%${digits}%`));
    if (/^#?\d+$/.test(q.q.trim())) {
      const n = Number(q.q.trim().replace("#", ""));
      ors.push(eq(invoices.number, n), eq(serviceTickets.number, n));
    }
    conds.push(or(...ors)!);
  }
  const cur = decodeCursor(q.cursor);
  if (cur) conds.push(or(lt(invoices.createdAt, cur.createdAt), and(eq(invoices.createdAt, cur.createdAt), lt(invoices.id, cur.id)))!);
  const rows = await db
    .select({ i: invoices, name: users.name, phone: users.phone, t: serviceTickets })
    .from(invoices)
    .innerJoin(users, eq(users.id, invoices.userId))
    .leftJoin(serviceTickets, eq(serviceTickets.id, invoices.ticketId))
    .where(and(...conds))
    .orderBy(desc(invoices.createdAt), desc(invoices.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  return {
    items: page.map((r) => ({
      ...invoiceDto(r.i, publicWebUrl),
      customerName: r.name,
      customerPhone: r.phone,
      ticketNumber: r.t?.number ?? null,
      itemLabel: r.t ? itemLabel(r.t.itemKind, r.t.itemDetails).replace(/^your /, "") : null,
      lastActivity: activityOf(r.i, r.t, merchant.timezone, now),
      lastActivityAt: (r.i.paidAt ?? r.i.createdAt).toISOString(),
      overdue: r.i.status === "open" && now.getTime() - r.i.createdAt.getTime() >= OVERDUE_INVOICE_DAYS * DAY_MS,
    })),
    nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!.i) : null,
  };
}

/** Numbers for the invoice page's stat strip. Deposits held = paid deposits on approved quotes whose ticket is still open and unpaid. */
export async function invoiceSummary(db: DbOrTx, merchant: Merchant, now: Date): Promise<serviceApi.InvoiceSummaryResponse> {
  const overdueBefore = new Date(now.getTime() - OVERDUE_INVOICE_DAYS * DAY_MS);
  const [openRow] = await db
    .select({
      openCents: sql<number>`coalesce(sum(${invoices.amountDueCents}) filter (where ${invoices.status} = 'open'), 0)`.mapWith(Number),
      openCount: sql<number>`count(*) filter (where ${invoices.status} = 'open')`.mapWith(Number),
      overdueCents: sql<number>`coalesce(sum(${invoices.amountDueCents}) filter (where ${invoices.status} = 'open' and ${invoices.createdAt} < ${overdueBefore.toISOString()}::timestamptz), 0)`.mapWith(Number),
      overdueCount: sql<number>`count(*) filter (where ${invoices.status} = 'open' and ${invoices.createdAt} < ${overdueBefore.toISOString()}::timestamptz)`.mapWith(Number),
      oldestOpen: sql<string | null>`min(${invoices.createdAt}) filter (where ${invoices.status} = 'open' and ${invoices.createdAt} < ${overdueBefore.toISOString()}::timestamptz)`,
      paidMonthCents: sql<number>`coalesce(sum(${invoices.totalCents}) filter (where ${invoices.status} = 'paid' and date_trunc('month', ${invoices.paidAt} at time zone ${merchant.timezone}) = date_trunc('month', ${now.toISOString()}::timestamptz at time zone ${merchant.timezone})), 0)`.mapWith(Number),
      paidMonthCount: sql<number>`count(*) filter (where ${invoices.status} = 'paid' and date_trunc('month', ${invoices.paidAt} at time zone ${merchant.timezone}) = date_trunc('month', ${now.toISOString()}::timestamptz at time zone ${merchant.timezone}))`.mapWith(Number),
      avgSeconds: sql<number | null>`avg(extract(epoch from (${invoices.paidAt} - ${invoices.createdAt}))) filter (where ${invoices.status} = 'paid' and ${invoices.paidAt} > ${new Date(now.getTime() - 90 * DAY_MS).toISOString()}::timestamptz)`.mapWith((v) => (v === null ? null : Number(v))),
    })
    .from(invoices)
    .where(eq(invoices.merchantId, merchant.id));
  const [ready] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(invoices)
    .innerJoin(serviceTickets, eq(serviceTickets.id, invoices.ticketId))
    .where(and(eq(invoices.merchantId, merchant.id), eq(invoices.status, "open"), eq(serviceTickets.status, "ready")));
  const [held] = await db
    .select({ cents: sql<number>`coalesce(sum(${quotes.depositCents}), 0)`.mapWith(Number), n: sql<number>`count(*)`.mapWith(Number) })
    .from(quotes)
    .innerJoin(serviceTickets, eq(serviceTickets.id, quotes.ticketId))
    .where(
      and(
        eq(quotes.merchantId, merchant.id),
        eq(quotes.status, "approved"),
        sql`${quotes.depositPaidAt} is not null`,
        sql`${serviceTickets.status} not in ('picked_up', 'cancelled')`,
        sql`not exists (select 1 from invoices i where i.ticket_id = ${quotes.ticketId} and i.status = 'paid')`,
      ),
    );
  return {
    openCents: openRow?.openCents ?? 0,
    openCount: openRow?.openCount ?? 0,
    openReadyTickets: ready?.n ?? 0,
    overdueCents: openRow?.overdueCents ?? 0,
    overdueCount: openRow?.overdueCount ?? 0,
    oldestOverdueDays: openRow?.oldestOpen ? Math.floor((now.getTime() - new Date(openRow.oldestOpen).getTime()) / DAY_MS) : 0,
    paidThisMonthCents: openRow?.paidMonthCents ?? 0,
    paidThisMonthCount: openRow?.paidMonthCount ?? 0,
    depositsHeldCents: held?.cents ?? 0,
    depositsHeldQuotes: held?.n ?? 0,
    avgDaysToPay: openRow?.avgSeconds == null ? null : Math.round((openRow.avgSeconds / 86_400) * 10) / 10,
  };
}

export async function createInvoice(ctx: AppContext, staff: StaffContext, ticketId: string, body: z.infer<typeof serviceApi.createInvoiceBody>) {
  const merchant = staff.merchant;
  const ticket = await getMerchantTicket(ctx.db, merchant.id, ticketId);
  if (ticket.status === "cancelled") throw conflict("Ticket is cancelled");
  const [existing] = await ctx.db.select({ id: invoices.id, number: invoices.number }).from(invoices).where(and(eq(invoices.ticketId, ticket.id), eq(invoices.merchantId, merchant.id), inArray(invoices.status, ["draft", "open"]))).limit(1);
  if (existing) throw conflict(`Invoice #${existing.number} is already open for this ticket. Void it first.`);
  // The quote this invoice is held to: the one the caller names (a revision the customer approved), else the latest approved.
  let approved = await approvedQuoteFor(ctx.db, ticket);
  if (body.quoteId) {
    const [named] = await ctx.db.select().from(quotes).where(and(eq(quotes.id, body.quoteId), eq(quotes.ticketId, ticket.id), eq(quotes.merchantId, merchant.id), eq(quotes.status, "approved"))).limit(1);
    if (!named) throw conflict("That quote isn't approved for this ticket");
    approved = named;
  }
  await requireApprovedEstimate(ctx.db, ticket, "invoice");
  const quote = body.fromQuote ? approved : null;
  if (body.fromQuote && !quote) throw conflict("This ticket has no approved quote. Add the invoice lines yourself instead.");
  const base: z.infer<typeof serviceApi.lineItemSchema>[] = (quote?.lineItems ?? []).map((l: LineItem) => ({ description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, kind: l.kind ?? "other", categoryId: l.categoryId ?? null, condition: l.condition ?? null }));
  const all = [...base, ...body.extraLineItems];
  if (!all.length) throw badRequest("An invoice needs at least one line item");
  const priced = await priceLineItems(ctx.db, merchant, all);
  // The final price may not be more than 10% above what the customer approved. A revised quote the customer approves resets the cap.
  // Shop policy for every kind of ticket; see packages/shared/src/service-rules.ts for what is and is not settled law.
  if (approved && priced.totalCents > maxAuthorizedCents(approved.totalCents)) {
    const cap = maxAuthorizedCents(approved.totalCents);
    throw new HttpError(409, "over_estimate", `This invoice (${money(priced.totalCents)}) is more than 10% above the approved quote (${money(approved.totalCents)}). The most you can charge is ${money(cap)}. Send the customer a revised quote to approve first.`, {
      quoteId: approved.id,
      quoteTotalCents: approved.totalCents,
      maxAuthorizedCents: cap,
      invoiceTotalCents: priced.totalCents,
    });
  }
  const depositApplied = quote?.depositPaidAt ? Math.min(quote.depositCents, priced.totalCents) : 0;
  const amountDue = Math.max(0, priced.totalCents - depositApplied);
  // Platform fee applies only to money taken in-app (deposit + balance).
  const fee = (await paymentsReady(ctx.db, merchant)) ? platformFeeFor("invoice", priced.totalCents, merchant) : platformFeeFor("deposit", depositApplied, merchant);
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

/** The person a tip goes to: whoever the ticket is assigned to. */
export async function invoiceTipInfo(db: DbOrTx, inv: Invoice): Promise<{ staff: { id: string; name: string } | null }> {
  // A salon checkout names the stylist on the invoice itself (appointment checkout sets tipStaffId); a repair ticket uses its assignee.
  if (inv.tipStaffId) {
    const [named] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, inv.tipStaffId)).limit(1);
    if (named) return { staff: { id: named.id, name: named.name ?? "your stylist" } };
  }
  if (!inv.ticketId) return { staff: null };
  const [row] = await db
    .select({ id: users.id, name: users.name })
    .from(serviceTickets)
    .innerJoin(users, eq(users.id, serviceTickets.assignedStaffId))
    .where(eq(serviceTickets.id, inv.ticketId))
    .limit(1);
  return { staff: row ? { id: row.id, name: row.name ?? "your technician" } : null };
}

/** Start (or resume) an in-app payment for an open invoice. */
export async function payInvoice(ctx: AppContext, inv: Invoice, opts: { tipCents?: number } = {}): Promise<serviceApi.PayInvoiceResponse> {
  const merchant = await loadMerchant(ctx.db, inv.merchantId);
  if (!merchant) throw notFound("Invoice");
  if (inv.status === "paid") return { invoice: invoiceDto(inv, ctx.config.publicWebUrl), payment: null };
  if (inv.status !== "open") throw conflict(`Invoice is ${inv.status}`);
  await requireFeature(ctx.db, merchant, invoiceFeature(inv));
  const accountId = await requirePaymentsReady(ctx.db, merchant);
  if (inv.amountDueCents < 50) throw badRequest("The balance is too small to pay by card; pay at the counter");
  const tipCents = opts.tipCents ?? 0;
  if (tipCents > 0) {
    // A tip is voluntary, on the pre-tax subtotal, never taxed and never earns points. Only for shops that offer tipping.
    if (!tipsEnabledFor(merchant.vertical, merchant.tipsEnabled)) throw badRequest("This shop doesn't take tips online");
    if (!tipWithinLimit(tipCents, inv.subtotalCents)) throw badRequest("A tip can be 0 to 100% of the amount before tax");
  }
  const depositFee = platformFeeFor("deposit", inv.depositAppliedCents, merchant);
  // An appointment checkout taken through the calendar carries no platform fee on the balance (FEES.appointmentCheckoutBps).
  const fee = Math.min(inv.amountDueCents, Math.max(0, platformFeeFor(inv.appointmentId ? "appointment_checkout" : "invoice", inv.totalCents, merchant) - depositFee));
  // The amount of a PaymentIntent is fixed once created, so a different tip means a new intent (keyed by the tip, so a retry reuses it).
  const wanted = inv.amountDueCents + tipCents;
  let existing = inv.stripePaymentIntentId ? await retrieveConnectPayment(ctx, merchant, inv.stripePaymentIntentId) : null;
  if (existing && existing.amountCents !== wanted && existing.status !== "succeeded" && existing.status !== "processing") existing = null;
  const pi =
    existing ??
    (await createConnectPayment(ctx, merchant, {
      amountCents: wanted,
      connectedAccountId: accountId,
      applicationFeeCents: fee,
      description: `${merchant.name} invoice #${inv.number}`,
      metadata: { ll_kind: "invoice", ll_id: inv.id, merchant_id: merchant.id, tip_cents: String(tipCents) },
      idempotencyKey: `invoice:${inv.id}:pi:${tipCents}`,
    }));
  let updated = inv;
  if (pi.id !== inv.stripePaymentIntentId) {
    const tipStaffId = tipCents > 0 ? ((await invoiceTipInfo(ctx.db, inv)).staff?.id ?? null) : null;
    [updated] = (await ctx.db.update(invoices).set({ stripePaymentIntentId: pi.id, platformFeeCents: depositFee + fee, tipCents, tipStaffId }).where(eq(invoices.id, inv.id)).returning()) as [Invoice];
  }
  return { invoice: invoiceDto(updated, ctx.config.publicWebUrl), payment: { paymentIntentId: pi.id, clientSecret: pi.clientSecret, amountCents: pi.amountCents } };
}

/** Mark paid, award points once, log on the ticket, thank the customer. */
export async function completeInvoicePayment(ctx: AppContext, inv: Invoice, opts: { inApp: boolean; paymentIntentId?: string; actorUserId?: string | null; note?: string }): Promise<Invoice> {
  const now = ctx.now();
  const patch: Partial<typeof invoices.$inferInsert> = { status: "paid", paidAt: now, paymentProcessingAt: null };
  if (opts.paymentIntentId) patch.stripePaymentIntentId = opts.paymentIntentId;
  if (!opts.inApp) {
    const m = await loadMerchant(ctx.db, inv.merchantId);
    patch.platformFeeCents = m ? platformFeeFor("deposit", inv.depositAppliedCents, m) : 0;
  }
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
      // Service lines only: tax and tips are never in the lines, and a credit (diagnostic fee) reduces the lines it offsets.
      lines: (() => {
        const amounts = earnableAmounts(paid.lineItems.map((l) => ({ amountCents: l.quantity * l.unitPriceCents })));
        return paid.lineItems.map((l, idx) => ({ amountCents: amounts[idx]!, categoryId: l.categoryId ?? null, quantity: l.quantity })).filter((l) => l.amountCents > 0);
      })(),
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
      // A visit paid from the calendar also says what the tip was, links the receipt and offers the next booking.
      body: `Thanks! Invoice #${paid.number} is paid.${points > 0 ? ` You earned ${points} points at ${merchant.name}.` : ""}${
        paid.appointmentId
          ? `${paid.tipCents > 0 ? ` Your $${(paid.tipCents / 100).toFixed(2)} tip went to the team.` : ""} Receipt: ${ctx.config.publicWebUrl}/i/${paid.payToken}. Book your next visit: ${ctx.config.publicWebUrl}/shops/${merchant.slug}/book`
          : ""
      }`,
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

export async function onInvoicePayment(ctx: AppContext, invoiceId: string, paymentIntentId: string, outcome: "succeeded" | "failed" | "processing") {
  const [inv] = await ctx.db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) return;
  if (inv.stripePaymentIntentId && inv.stripePaymentIntentId !== paymentIntentId) return;
  if (outcome === "processing") {
    // A bank debit in flight: the invoice stays open (the same PaymentIntent is reused, so no second charge) until it clears.
    if (inv.status !== "open" || inv.paymentProcessingAt) return;
    const [marked] = await ctx.db.update(invoices).set({ paymentProcessingAt: ctx.now() }).where(and(eq(invoices.id, inv.id), isNull(invoices.paymentProcessingAt))).returning({ id: invoices.id });
    if (marked && inv.ticketId) await addTicketEvent(ctx.db, inv.ticketId, { note: `Payment for invoice #${inv.number} is processing. Bank debits can take a few business days.`, visibleToCustomer: true });
    return;
  }
  if (outcome === "failed") {
    if (inv.paymentProcessingAt) await ctx.db.update(invoices).set({ paymentProcessingAt: null }).where(eq(invoices.id, inv.id));
    if (inv.ticketId) await addTicketEvent(ctx.db, inv.ticketId, { note: `Payment for invoice #${inv.number} failed`, visibleToCustomer: false });
    return;
  }
  if (inv.status !== "open") return;
  await completeInvoicePayment(ctx, inv, { inApp: true, paymentIntentId });
}


/** Points this payment will earn at the base rate (promos and VIP can add more): service lines only, never tax or tips. */
export async function previewInvoicePoints(db: DbOrTx, inv: Invoice): Promise<number> {
  const [program] = await db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, inv.merchantId)).limit(1);
  if (!program || !program.active) return 0;
  const cats = await db.select({ id: merchantCategories.id, earn: merchantCategories.earnEligible }).from(merchantCategories).where(eq(merchantCategories.merchantId, inv.merchantId));
  const amounts = earnableAmounts(inv.lineItems.map((l) => ({ amountCents: l.quantity * l.unitPriceCents })));
  const lines = inv.lineItems.map((l, i) => ({ amountCents: amounts[i]!, categoryId: l.categoryId ?? null })).filter((l) => l.amountCents > 0);
  if (!lines.length) return 0;
  return calculateEarn({
    rules: { earnType: program.earnType, pointsPerDollar: program.pointsPerDollar, pointsPerVisit: program.pointsPerVisit, minSpendCents: program.minSpendCents },
    lines,
    noEarnCategoryIds: cats.filter((c) => !c.earn).map((c) => c.id),
  }).totalPoints;
}
