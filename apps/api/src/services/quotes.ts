/**
 * Quotes (Pro: service.quote_approval) with an e-signature log, and deposits
 * (service.deposits) collected on approval through a PaymentIntent.
 *
 * Flow: draft → sent (public link /q/<token>) → approved | declined | expired.
 * A new quote on the same ticket supersedes any draft/sent one.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, ne } from "drizzle-orm";
import { merchantCategories, quotes, serviceTickets, type DbOrTx, type LineItem, type QuoteAuthorization } from "@ll/db";
import { maxAuthorizedCents, t, type serviceApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { randomToken } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { platformFeeFor } from "./fees.js";
import { createConnectPayment, retrieveConnectPayment } from "./payments.js";
import { iso, itemLabel, loadMerchant, money, notifyCustomer, requirePaymentsReady } from "./commerceShared.js";
import { getMerchantFeatures, requireFeature } from "./features.js";
import { customerLocale, withLang } from "./service-messages.js";
import { merchantTax } from "./tax.js";
import { assertEstimateComplete } from "./auto-estimate.js";
import { TERMINAL_TICKET_STATUSES, addTicketEvent, ensureStatusToken, getMerchantTicket, setTicketStatusRaw, type Ticket } from "./tickets.js";

export type Quote = typeof quotes.$inferSelect;
type Merchant = NonNullable<Awaited<ReturnType<typeof loadMerchant>>>;

export function lineItemDto(l: LineItem): serviceApi.LineItemDto {
  return { description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, kind: l.kind ?? "other", categoryId: l.categoryId ?? null, totalCents: l.quantity * l.unitPriceCents, ...(l.condition ? { condition: l.condition } : {}) };
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
    firstViewedAt: iso(q.firstViewedAt),
    authorizedBy: q.authorizedBy ?? null,
    maxAuthorizedCents: maxAuthorizedCents(q.totalCents),
  };
}

/**
 * Sales tax base: the lines that carry tax (`taxable !== false`). Credits (reward discounts) come off the taxable lines in
 * proportion, so a discount on a mixed bill never turns a non-taxable line taxable or the other way round.
 */
export function taxableBase(lines: { quantity: number; unitPriceCents: number; taxable?: boolean }[]): number {
  let positive = 0;
  let taxablePositive = 0;
  let credits = 0;
  for (const l of lines) {
    const v = l.quantity * l.unitPriceCents;
    if (v < 0) credits += v;
    else {
      positive += v;
      if (l.taxable !== false) taxablePositive += v;
    }
  }
  if (positive <= 0) return 0;
  return Math.max(0, Math.round((taxablePositive * (positive + credits)) / positive));
}

/** Normalize line items and compute subtotal / tax / total. A line with `taxable: false` carries no tax. */
export async function priceLineItems(db: DbOrTx, merchant: Pick<Merchant, "id" | "neighbourhoodId" | "taxRegistered">, input: (z.infer<typeof serviceApi.lineItemSchema> & { taxable?: boolean })[]) {
  const catIds = [...new Set(input.map((l) => l.categoryId).filter((c): c is string => !!c))];
  if (catIds.length) {
    const found = await db.select({ id: merchantCategories.id }).from(merchantCategories).where(and(eq(merchantCategories.merchantId, merchant.id), inArray(merchantCategories.id, catIds)));
    if (found.length !== catIds.length) throw badRequest("Unknown category on a line item");
  }
  const lineItems: LineItem[] = input.map((l) => ({ description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, kind: l.kind, categoryId: l.categoryId ?? null, ...(l.serviceId ? { serviceId: l.serviceId } : {}), ...(l.taxable === false ? { taxable: false } : {}), ...(l.kind === "part" && l.condition ? { condition: l.condition } : {}) }));
  const subtotalCents = lineItems.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
  if (subtotalCents < 0) throw badRequest("Credits can't be more than the lines they apply to");
  // Tax comes from the shop's province and tax registration, never from the client.
  const tax = await merchantTax(db, merchant, taxableBase(lineItems));
  return { lineItems, subtotalCents, taxCents: tax.taxCents, totalCents: subtotalCents + tax.taxCents, taxLines: tax.lines.map((l) => ({ label: l.label, cents: l.cents })), taxLabel: tax.label };
}

/** Totals for a quote that is still being built: the server's tax and deposit, and the 10% cap the customer will be shown. */
export async function previewQuote(db: DbOrTx, merchant: Merchant, body: z.infer<typeof serviceApi.previewQuoteBody>): Promise<serviceApi.QuotePreviewResponse> {
  if (!body.lineItems.length) return { subtotalCents: 0, taxCents: 0, taxLabel: (await merchantTax(db, merchant, 0)).label, taxLines: [], totalCents: 0, depositCents: 0, maxAuthorizedCents: 0 };
  const priced = await priceLineItems(db, merchant, body.lineItems);
  const depositCents = Math.min(priced.totalCents, Math.max(0, body.depositCents ?? (body.depositPercent ? Math.round((priced.totalCents * body.depositPercent) / 100) : 0)));
  return { subtotalCents: priced.subtotalCents, taxCents: priced.taxCents, taxLabel: priced.taxLabel, taxLines: priced.taxLines, totalCents: priced.totalCents, depositCents, maxAuthorizedCents: maxAuthorizedCents(priced.totalCents) };
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
        createdAt: now,
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
  assertEstimateComplete(ticket, quote);
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
  const locale = await customerLocale(ctx.db, ticket.userId);
  const url = withLang(`${ctx.config.publicWebUrl}/q/${updated.approvalToken}`, locale);
  const item = itemLabel(ticket.itemKind, ticket.itemDetails);
  const deposit = updated.depositCents > 0 ? t(locale, "sv.msg.depositClause", { amount: money(updated.depositCents) }) : "";
  await notifyCustomer(ctx, {
    userId: ticket.userId,
    merchantId: merchant.id,
    title: t(locale, "sv.msg.quoteReadyTitle", { shop: merchant.name }),
    body: t(locale, "sv.msg.quoteReady", { item, n: ticket.number, total: money(updated.totalCents), deposit, url }),
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
        ? { status: "approved", respondedAt: now, signatureName, signatureIp: args.ip ?? null, signatureUserAgent: args.userAgent?.slice(0, 500) ?? null, authorizedBy: { method: "link" as const, name: signatureName!, at: now.toISOString() } }
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
  const pi = quote.depositPaymentIntentId
    ? await retrieveConnectPayment(ctx, merchant, quote.depositPaymentIntentId)
    : await createConnectPayment(ctx, merchant, {
        amountCents: quote.depositCents,
        connectedAccountId: accountId,
        applicationFeeCents: platformFeeFor("deposit", quote.depositCents, merchant),
        description: `${merchant.name} deposit`,
        metadata: { ll_kind: "deposit", ll_id: quote.id, merchant_id: merchant.id, ticket_id: quote.ticketId },
        idempotencyKey: `deposit:${quote.id}`,
      });
  if (!quote.depositPaymentIntentId) await ctx.db.update(quotes).set({ depositPaymentIntentId: pi.id }).where(eq(quotes.id, quote.id));
  return { paymentIntentId: pi.id, clientSecret: pi.clientSecret, amountCents: pi.amountCents };
}

export async function onDepositPayment(ctx: AppContext, quoteId: string, paymentIntentId: string, outcome: "succeeded" | "failed" | "processing") {
  const [quote] = await ctx.db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1);
  if (!quote) return;
  if (quote.depositPaymentIntentId && quote.depositPaymentIntentId !== paymentIntentId) return;
  if (outcome === "processing") {
    // A bank debit in flight: the deposit isn't received yet, and the same PaymentIntent is reused so it can't be charged twice.
    if (quote.depositPaidAt || quote.depositProcessingAt) return;
    const [marked] = await ctx.db.update(quotes).set({ depositProcessingAt: ctx.now() }).where(and(eq(quotes.id, quote.id), isNull(quotes.depositProcessingAt), isNull(quotes.depositPaidAt))).returning({ id: quotes.id });
    if (!marked) return;
    await addTicketEvent(ctx.db, quote.ticketId, { note: `Deposit of ${money(quote.depositCents)} is processing. Bank debits can take a few business days.`, visibleToCustomer: true });
    const [ticket] = await ctx.db.select().from(serviceTickets).where(eq(serviceTickets.id, quote.ticketId)).limit(1);
    const merchant = await loadMerchant(ctx.db, quote.merchantId);
    if (ticket && merchant) {
      await notifyCustomer(ctx, {
        userId: ticket.userId,
        merchantId: merchant.id,
        title: `${merchant.name}: deposit payment is processing`,
        body: `Your ${money(quote.depositCents)} deposit for ticket #${ticket.number} is processing. We'll let you know when ${merchant.name} receives it.`,
        sms: false,
        data: { type: "deposit_processing", ticketId: ticket.id, quoteId: quote.id },
      });
    }
    return;
  }
  if (outcome === "failed") {
    if (quote.depositProcessingAt) await ctx.db.update(quotes).set({ depositProcessingAt: null }).where(eq(quotes.id, quote.id));
    await addTicketEvent(ctx.db, quote.ticketId, { note: "Deposit payment failed", visibleToCustomer: false });
    return;
  }
  const [updated] = await ctx.db
    .update(quotes)
    .set({ depositPaidAt: ctx.now(), depositPaymentIntentId: paymentIntentId, depositProcessingAt: null })
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

// ---------------------------------------------------------------------------
// "Opened" signal and phone approval
// ---------------------------------------------------------------------------
/**
 * Public link opened by the customer: stamp the first time only (conditional update, so two tabs or a retry never move it)
 * and leave an internal timeline note for staff. Staff previews never call this.
 */
export async function markQuoteViewed(ctx: AppContext, quote: Quote): Promise<Quote> {
  if (quote.firstViewedAt || quote.status === "draft") return quote;
  const [row] = await ctx.db.update(quotes).set({ firstViewedAt: ctx.now() }).where(and(eq(quotes.id, quote.id), isNull(quotes.firstViewedAt))).returning();
  if (!row) return { ...quote, firstViewedAt: quote.firstViewedAt };
  await addTicketEvent(ctx.db, quote.ticketId, { note: "Quote opened by the customer", visibleToCustomer: false });
  return row;
}

/**
 * The customer said yes by phone. Records who, their number and when (name, date, time and phone are what Ontario's
 * auto-repair rules ask for on a spoken authorisation, and we keep them for every kind of ticket). Idempotent: a second
 * call on an approved quote returns it unchanged. A draft, sent or expired quote can be approved this way.
 */
export async function authorizeQuoteByPhone(ctx: AppContext, staff: StaffContext, quoteId: string, body: z.infer<typeof serviceApi.authorizeQuoteByPhoneBody>) {
  const merchant = staff.merchant;
  const quote = await getMerchantQuote(ctx.db, merchant.id, quoteId);
  if (quote.status === "approved") return { quote: quoteDto(quote, ctx.config.publicWebUrl, true), ticketStatus: (await getMerchantTicket(ctx.db, merchant.id, quote.ticketId)).status, deposit: null };
  if (quote.status !== "draft" && quote.status !== "sent" && quote.status !== "expired") throw conflict(quote.status === "superseded" ? "This quote was replaced by a newer one" : `This quote was already ${quote.status}`);
  const ticket = await getMerchantTicket(ctx.db, merchant.id, quote.ticketId);
  if (TERMINAL_TICKET_STATUSES.includes(ticket.status)) throw conflict(`Ticket is ${ticket.status.replace("_", " ")}`);
  const now = ctx.now();
  const auth: QuoteAuthorization = { method: "phone", name: body.name.trim(), phone: body.phone?.trim() || null, note: body.note?.trim() || null, at: now.toISOString(), staffId: staff.user.id };
  const [updated] = await ctx.db
    .update(quotes)
    .set({ status: "approved", respondedAt: now, signatureName: auth.name, sentAt: quote.sentAt ?? now, authorizedBy: auth })
    .where(and(eq(quotes.id, quote.id), inArray(quotes.status, ["draft", "sent", "expired"])))
    .returning();
  if (!updated) throw conflict("This quote was just updated. Refresh and try again.");
  await ctx.db.update(quotes).set({ status: "superseded" }).where(and(eq(quotes.ticketId, ticket.id), eq(quotes.merchantId, merchant.id), inArray(quotes.status, ["draft", "sent"]), ne(quotes.id, quote.id)));
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: merchant.timezone, dateStyle: "medium", timeStyle: "short" }).format(now);
  const newTicket = await setTicketStatusRaw(ctx.db, now, ticket, "approved", {
    note: `Approved by phone, ${auth.name}, ${local}${auth.phone ? `, ${auth.phone}` : ""}${auth.note ? `. ${auth.note}` : ""} (${money(quote.totalCents)})`,
    visibleToCustomer: true,
    actorUserId: staff.user.id,
  });
  // A deposit, if one is due, is paid from the same link as always; the text carries it.
  const locale = await customerLocale(ctx.db, ticket.userId);
  const url = withLang(`${ctx.config.publicWebUrl}/q/${updated.approvalToken}`, locale);
  const deposit = await depositPayment(ctx, merchant, updated).catch(() => null);
  const depositDue = updated.depositCents > 0 && !updated.depositPaidAt;
  await notifyCustomer(ctx, {
    userId: ticket.userId,
    merchantId: merchant.id,
    title: t(locale, "sv.msg.quoteReadyTitle", { shop: merchant.name }),
    body: depositDue
      ? t(locale, "sv.msg.phoneApprovedDeposit", { name: auth.name, shop: merchant.name, n: ticket.number, amount: money(updated.depositCents), url })
      : t(locale, "sv.msg.phoneApproved", { name: auth.name, shop: merchant.name, n: ticket.number, url: withLang(`${ctx.config.publicWebUrl}/t/${(await ensureStatusToken(ctx.db, ticket)).statusToken}`, locale) }),
    data: { type: "quote_sent", ticketId: ticket.id, quoteId: updated.id, url },
  });
  return { quote: quoteDto(updated, ctx.config.publicWebUrl, true), ticketStatus: newTicket.status, deposit };
}
