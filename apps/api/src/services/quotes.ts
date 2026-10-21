/**
 * Quotes (Pro: service.quote_approval) with an e-signature log, and deposits
 * (service.deposits) collected on approval through a PaymentIntent.
 *
 * Flow: draft → sent (public link /q/<token>) → approved | declined | expired.
 * A new quote on the same ticket supersedes any draft/sent one.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { merchantCategories, quotes, serviceTickets, type DbOrTx, type LineItem } from "@ll/db";
import type { serviceApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { randomToken } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { getPayments, platformFeeCents } from "../providers/payments.js";
import { iso, itemLabel, loadMerchant, money, notifyCustomer, requirePaymentsReady } from "./commerceShared.js";
import { getMerchantFeatures, requireFeature } from "./features.js";
import { computeTax, merchantProvince } from "./tax.js";
import { TERMINAL_TICKET_STATUSES, addTicketEvent, getMerchantTicket, setTicketStatusRaw, type Ticket } from "./tickets.js";

export type Quote = typeof quotes.$inferSelect;
type Merchant = NonNullable<Awaited<ReturnType<typeof loadMerchant>>>;

export function lineItemDto(l: LineItem): serviceApi.LineItemDto {
  return { description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, kind: l.kind ?? "other", categoryId: l.categoryId ?? null, totalCents: l.quantity * l.unitPriceCents };
}

export function quoteDto(q: Quote, publicWebUrl: string, forStaff: boolean): serviceApi.QuoteDto {
  return {
    id: q.id,
    ticketId: q.ticketId,
    merchantId: q.merchantId,
    lineItems: q.lineItems.map(lineItemDto),
    diagnosis: q.diagnosis,
    subtotalCents: q.subtotalCents,
    taxCents: q.taxCents,
    totalCents: q.totalCents,
    depositCents: q.depositCents,
    status: q.status,
    approvalUrl: q.status === "draft" ? null : `${publicWebUrl}/q/${q.approvalToken}`,
    expiresAt: iso(q.expiresAt),
    sentAt: iso(q.sentAt),
    respondedAt: iso(q.respondedAt),
    signatureName: q.signatureName,
    ...(forStaff ? { signatureIp: q.signatureIp, signatureUserAgent: q.signatureUserAgent } : {}),
    declineReason: q.declineReason,
    depositPaidAt: iso(q.depositPaidAt),
    createdAt: q.createdAt.toISOString(),
  };
}

/** Normalize line items and compute subtotal / tax / total. */
export async function priceLineItems(db: DbOrTx, merchant: Merchant, input: z.infer<typeof serviceApi.lineItemSchema>[]) {
  const catIds = [...new Set(input.map((l) => l.categoryId).filter((c): c is string => !!c))];
  if (catIds.length) {
    const found = await db.select({ id: merchantCategories.id }).from(merchantCategories).where(and(eq(merchantCategories.merchantId, merchant.id), inArray(merchantCategories.id, catIds)));
    if (found.length !== catIds.length) throw badRequest("Unknown category on a line item");
  }
  const lineItems: LineItem[] = input.map((l) => ({ description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, kind: l.kind, categoryId: l.categoryId ?? null }));
  const subtotalCents = lineItems.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
  const tax = computeTax(subtotalCents, await merchantProvince(db, merchant));
  return { lineItems, subtotalCents, taxCents: tax.taxCents, totalCents: subtotalCents + tax.taxCents };
}

export async function getMerchantQuote(db: DbOrTx, merchantId: string, quoteId: string): Promise<Quote> {
  const [q] = await db.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.merchantId, merchantId))).limit(1);
  if (!q) throw notFound("Quote");
  return q;
}

export async function createQuote(ctx: AppContext, staff: StaffContext, ticketId: string, body: z.infer<typeof serviceApi.createQuoteBody>) {
  const merchant = staff.merchant;
  const ticket = await getMerchantTicket(ctx.db, merchant.id, ticketId);
  if (TERMINAL_TICKET_STATUSES.includes(ticket.status)) throw conflict(`Ticket is ${ticket.status.replace("_", " ")}`);
  const priced = await priceLineItems(ctx.db, merchant, body.lineItems);
  let depositCents = body.depositCents ?? (body.depositPercent ? Math.round((priced.totalCents * body.depositPercent) / 100) : 0);
  if (depositCents > priced.totalCents) throw badRequest("Deposit can't be more than the quote total");
  if (depositCents > 0) {
    await requireFeature(ctx.db, merchant, "service.deposits");
    if (depositCents < 50) throw badRequest("Deposits must be at least $0.50");
  }
  depositCents = Math.max(0, depositCents);
  const now = ctx.now();
  const quote = await ctx.db.transaction(async (tx) => {
    await tx.update(quotes).set({ status: "superseded" }).where(and(eq(quotes.ticketId, ticket.id), eq(quotes.merchantId, merchant.id), inArray(quotes.status, ["draft", "sent"])));
    const [q] = await tx
      .insert(quotes)
      .values({
        ticketId: ticket.id,
        merchantId: merchant.id,
        lineItems: priced.lineItems,
        diagnosis: body.diagnosis ?? null,
        subtotalCents: priced.subtotalCents,
        taxCents: priced.taxCents,
        totalCents: priced.totalCents,
        depositCents,
        status: "draft",
        approvalToken: randomToken(24),
        expiresAt: new Date(now.getTime() + body.expiresInDays * 86_400_000),
      })
      .returning();
    if (ticket.status === "intake") await setTicketStatusRaw(tx, now, ticket, "diagnosing", { note: body.diagnosis ? `Diagnosis: ${body.diagnosis}` : "Diagnosed", visibleToCustomer: true, actorUserId: staff.user.id });
    await addTicketEvent(tx, ticket.id, { note: `Quote drafted: ${money(priced.totalCents)}`, visibleToCustomer: false, actorUserId: staff.user.id });
    return q!;
  });
  if (body.send) return sendQuote(ctx, staff, quote.id);
  return quoteDto(quote, ctx.config.publicWebUrl, true);
}

export async function sendQuote(ctx: AppContext, staff: StaffContext, quoteId: string) {
  const merchant = staff.merchant;
  const quote = await getMerchantQuote(ctx.db, merchant.id, quoteId);
  if (quote.status !== "draft" && quote.status !== "sent") throw conflict(`Quote is ${quote.status}`);
  const ticket = await getMerchantTicket(ctx.db, merchant.id, quote.ticketId);
  if (TERMINAL_TICKET_STATUSES.includes(ticket.status)) throw conflict(`Ticket is ${ticket.status.replace("_", " ")}`);
  const now = ctx.now();
  let updated = quote;
  if (quote.status === "draft") {
    // The response window starts when the customer receives it.
    const windowMs = quote.expiresAt ? quote.expiresAt.getTime() - quote.createdAt.getTime() : 7 * 86_400_000;
    [updated] = (await ctx.db.update(quotes).set({ status: "sent", sentAt: now, expiresAt: new Date(now.getTime() + windowMs) }).where(eq(quotes.id, quote.id)).returning()) as [Quote];
    await setTicketStatusRaw(ctx.db, now, ticket, "quote_sent", { note: `Quote sent: ${money(quote.totalCents)}`, visibleToCustomer: true, actorUserId: staff.user.id });
  } else if (quote.expiresAt && quote.expiresAt <= now) {
    throw new HttpError(409, "quote_expired", "This quote has expired. Create a new one.");
  }
  const url = `${ctx.config.publicWebUrl}/q/${updated.approvalToken}`;
  const item = itemLabel(ticket.itemKind, ticket.itemDetails);
  const deposit = updated.depositCents > 0 ? ` (${money(updated.depositCents)} deposit on approval)` : "";
  await notifyCustomer(ctx, {
    userId: ticket.userId,
    merchantId: merchant.id,
    title: `${merchant.name}: quote ready`,
    body: `Your quote for ${item} (ticket #${ticket.number}) is ${money(updated.totalCents)}${deposit}. Review and approve: ${url}`,
    data: { type: "quote_sent", ticketId: ticket.id, quoteId: updated.id, url },
  });
  return quoteDto(updated, ctx.config.publicWebUrl, true);
}

// ---------------------------------------------------------------------------
// Customer response (public token or signed-in app)
// ---------------------------------------------------------------------------
export interface RespondArgs {
  action: "approve" | "decline";
  signatureName?: string;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

async function markExpired(ctx: AppContext, quote: Quote) {
  const [q] = await ctx.db.update(quotes).set({ status: "expired" }).where(and(eq(quotes.id, quote.id), eq(quotes.status, "sent"))).returning();
  if (q) await addTicketEvent(ctx.db, quote.ticketId, { note: "Quote expired", visibleToCustomer: true });
}

export function isExpired(quote: Quote, now: Date) {
  return quote.status === "expired" || (quote.status === "sent" && !!quote.expiresAt && quote.expiresAt <= now);
}

export async function respondToQuote(ctx: AppContext, quote: Quote, args: RespondArgs): Promise<serviceApi.ApproveQuoteResponse> {
  const merchant = await loadMerchant(ctx.db, quote.merchantId);
  if (!merchant) throw notFound("Quote");
  await requireFeature(ctx.db, merchant, "service.quote_approval");
  const now = ctx.now();
  if (isExpired(quote, now)) {
    await markExpired(ctx, quote);
    throw new HttpError(409, "quote_expired", `This quote has expired. Contact ${merchant.name} for an updated quote.`);
  }
  if (quote.status === "approved" && args.action === "approve") {
    // Idempotent re-approve: hand back the deposit payment if still due.
    const [t] = await ctx.db.select().from(serviceTickets).where(eq(serviceTickets.id, quote.ticketId)).limit(1);
    return { quote: quoteDto(quote, ctx.config.publicWebUrl, false), ticketStatus: t!.status, deposit: await depositPayment(ctx, merchant, quote) };
  }
  if (quote.status !== "sent") throw conflict(quote.status === "superseded" ? "This quote was replaced by a newer one. Check your latest message." : `This quote was already ${quote.status}`);
  const [ticket] = await ctx.db.select().from(serviceTickets).where(eq(serviceTickets.id, quote.ticketId)).limit(1);
  if (!ticket) throw notFound("Quote");

  const signatureName = args.signatureName?.trim() ?? null;
  if (args.action === "approve" && (!signatureName || signatureName.length < 2)) throw badRequest("Type your full name to sign");
  const [updated] = await ctx.db
    .update(quotes)
    .set(
      args.action === "approve"
        ? { status: "approved", respondedAt: now, signatureName, signatureIp: args.ip ?? null, signatureUserAgent: args.userAgent?.slice(0, 500) ?? null }
        : { status: "declined", respondedAt: now, declineReason: args.reason?.trim() || null, signatureIp: args.ip ?? null, signatureUserAgent: args.userAgent?.slice(0, 500) ?? null },
    )
    .where(and(eq(quotes.id, quote.id), eq(quotes.status, "sent")))
    .returning();
  if (!updated) throw conflict("This quote was just updated. Refresh and try again.");
  const status = args.action === "approve" ? "approved" : "declined";
  const note =
    args.action === "approve"
      ? `Quote approved (${money(quote.totalCents)}), signed by ${signatureName}`
      : `Quote declined${updated.declineReason ? `: ${updated.declineReason}` : ""}`;
  const newTicket = await setTicketStatusRaw(ctx.db, now, ticket, status, { note, visibleToCustomer: true, actorUserId: null });
  const deposit = args.action === "approve" ? await depositPayment(ctx, merchant, updated) : null;
  return { quote: quoteDto(updated, ctx.config.publicWebUrl, false), ticketStatus: newTicket.status, deposit };
}

/** Deposit PaymentIntent for an approved quote, or null when none is due / payments aren't set up. */
export async function depositPayment(ctx: AppContext, merchant: Merchant, quote: Quote): Promise<serviceApi.DepositPaymentDto | null> {
  if (quote.depositCents <= 0 || quote.depositPaidAt || quote.status !== "approved") return null;
  const features = await getMerchantFeatures(ctx.db, merchant);
  if (!features["service.deposits"].enabled || !features["payments.in_app"].enabled || !merchant.stripeAccountId || !merchant.stripeChargesEnabled) return null;
  const accountId = await requirePaymentsReady(ctx.db, merchant);
  const payments = getPayments(ctx);
  const pi = quote.depositPaymentIntentId
    ? await payments.retrievePaymentIntent(quote.depositPaymentIntentId)
    : await payments.createPaymentIntent({
        amountCents: quote.depositCents,
        connectedAccountId: accountId,
        applicationFeeCents: platformFeeCents(quote.depositCents),
        description: `${merchant.name} deposit`,
        metadata: { ll_kind: "deposit", ll_id: quote.id, merchant_id: merchant.id, ticket_id: quote.ticketId },
        idempotencyKey: `deposit:${quote.id}`,
      });
  if (!quote.depositPaymentIntentId) await ctx.db.update(quotes).set({ depositPaymentIntentId: pi.id }).where(eq(quotes.id, quote.id));
  return { paymentIntentId: pi.id, clientSecret: pi.clientSecret, amountCents: pi.amountCents };
}

export async function onDepositPayment(ctx: AppContext, quoteId: string, paymentIntentId: string, outcome: "succeeded" | "failed") {
  const [quote] = await ctx.db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1);
  if (!quote) return;
  if (quote.depositPaymentIntentId && quote.depositPaymentIntentId !== paymentIntentId) return;
  if (outcome === "failed") {
    await addTicketEvent(ctx.db, quote.ticketId, { note: "Deposit payment failed", visibleToCustomer: false });
    return;
  }
  const [updated] = await ctx.db
    .update(quotes)
    .set({ depositPaidAt: ctx.now(), depositPaymentIntentId: paymentIntentId })
    .where(and(eq(quotes.id, quote.id), isNull(quotes.depositPaidAt)))
    .returning();
  if (!updated) return;
  await addTicketEvent(ctx.db, quote.ticketId, { note: `Deposit of ${money(quote.depositCents)} received`, visibleToCustomer: true });
  const [ticket] = await ctx.db.select().from(serviceTickets).where(eq(serviceTickets.id, quote.ticketId)).limit(1);
  const merchant = await loadMerchant(ctx.db, quote.merchantId);
  if (ticket && merchant) {
    await notifyCustomer(ctx, {
      userId: ticket.userId,
      merchantId: merchant.id,
      title: `${merchant.name}: deposit received`,
      body: `Thanks! ${merchant.name} received your ${money(quote.depositCents)} deposit for ticket #${ticket.number}.`,
      sms: false,
      data: { type: "deposit_paid", ticketId: ticket.id, quoteId: quote.id },
    });
  }
}

/** Latest approved quote for a ticket (used by invoicing). */
export async function approvedQuoteFor(db: DbOrTx, ticket: Ticket): Promise<Quote | null> {
  const [q] = await db.select().from(quotes).where(and(eq(quotes.ticketId, ticket.id), eq(quotes.merchantId, ticket.merchantId), eq(quotes.status, "approved"))).orderBy(desc(quotes.respondedAt)).limit(1);
  return q ?? null;
}

/** Job: mark sent quotes past their expiry as expired. */
export async function expireQuotes(ctx: AppContext): Promise<number> {
  const due = await ctx.db.select().from(quotes).where(and(eq(quotes.status, "sent"), isNotNull(quotes.expiresAt), lt(quotes.expiresAt, ctx.now()))).orderBy(asc(quotes.expiresAt)).limit(500);
  for (const q of due) await markExpired(ctx, q);
  return due.length;
}

export async function getQuoteByToken(db: DbOrTx, token: string): Promise<Quote> {
  if (!token || token.length < 16) throw notFound("Quote");
  const [q] = await db.select().from(quotes).where(eq(quotes.approvalToken, token)).limit(1);
  if (!q) throw notFound("Quote");
  return q;
}

/** Quote owned by a signed-in customer. */
export async function getMyQuote(db: DbOrTx, userId: string, quoteId: string): Promise<Quote> {
  const [row] = await db
    .select({ q: quotes })
    .from(quotes)
    .innerJoin(serviceTickets, eq(serviceTickets.id, quotes.ticketId))
    .where(and(eq(quotes.id, quoteId), eq(serviceTickets.userId, userId)))
    .limit(1);
  if (!row || row.q.status === "draft") throw notFound("Quote");
  return row.q;
}
