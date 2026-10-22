/**
 * Public (no login) commerce/service pages: menu, pickup slots, quote
 * approval by token (e-signature log), invoice pay by token.
 * Docs: docs/engineering/api/public.md.
 */
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { merchants, serviceTickets } from "@ll/db";
import { commerceApi, restaurantApi, serviceApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { slotFeature, listSlots } from "../../services/bookings.js";
import { publicMenu } from "../../services/catalog.js";
import { loadMerchant, paymentsReady } from "../../services/commerceShared.js";
import { requireFeature } from "../../services/features.js";
import { getInvoiceByToken, invoiceDto, invoiceFeature, payInvoice } from "../../services/invoices.js";
import { depositPayment, getQuoteByToken, isExpired, quoteDto, respondToQuote } from "../../services/quotes.js";

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  async function merchantBySlug(slug: string) {
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.slug, slug)).limit(1);
    if (!m || m.status === "closed") throw notFound("Shop");
    return m;
  }

  const publicMerchant = (m: typeof merchants.$inferSelect) => ({ name: m.name, slug: m.slug, logoUrl: m.logoUrl, phone: m.phone });

  // ---------------------------------------------------------------- menu & slots
  app.get<{ Params: { slug: string } }>("/public/shops/:slug/menu", async (req) => {
    const m = await merchantBySlug(req.params.slug);
    await requireFeature(ctx.db, m, "orders.order_ahead");
    return publicMenu(ctx.db, m, parse(restaurantApi.publicMenuQuery, req.query));
  });

  app.get<{ Params: { slug: string } }>("/public/shops/:slug/slots", async (req) => {
    const m = await merchantBySlug(req.params.slug);
    const q = parse(commerceApi.listSlotsQuery, req.query);
    const kind = q.kind ?? "pickup";
    await requireFeature(ctx.db, m, slotFeature(kind));
    const now = ctx.now();
    const from = q.from && new Date(q.from) > now ? new Date(q.from) : now;
    const to = q.to ? new Date(q.to) : new Date(from.getTime() + 7 * 86_400_000);
    return { items: await listSlots(ctx.db, m.id, { kind, locationId: q.locationId, from, to, onlyAvailable: true }), nextCursor: null };
  });

  // ---------------------------------------------------------------- quotes
  async function quoteView(token: string): Promise<serviceApi.PublicQuoteResponse> {
    const quote = await getQuoteByToken(ctx.db, token);
    if (quote.status === "draft") throw notFound("Quote");
    const merchant = await loadMerchant(ctx.db, quote.merchantId);
    if (!merchant) throw notFound("Quote");
    await requireFeature(ctx.db, merchant, "service.quote_approval");
    const [ticket] = await ctx.db.select().from(serviceTickets).where(and(eq(serviceTickets.id, quote.ticketId), eq(serviceTickets.merchantId, merchant.id))).limit(1);
    if (!ticket) throw notFound("Quote");
    const expired = isExpired(quote, ctx.now());
    return {
      merchant: publicMerchant(merchant),
      ticket: { number: ticket.number, itemKind: ticket.itemKind as serviceApi.ItemKind, itemDetails: ticket.itemDetails, issue: ticket.issue, status: ticket.status },
      quote: { ...quoteDto(quote, ctx.config.publicWebUrl, false), status: expired ? "expired" : quote.status },
      expired,
      canRespond: quote.status === "sent" && !expired,
      depositDue: quote.status === "approved" && quote.depositCents > 0 && !quote.depositPaidAt,
    };
  }

  app.get<{ Params: { token: string } }>("/public/quotes/:token", async (req) => quoteView(req.params.token));

  app.post<{ Params: { token: string } }>("/public/quotes/:token/approve", async (req) => {
    const body = parse(serviceApi.approveQuoteBody, req.body);
    const quote = await getQuoteByToken(ctx.db, req.params.token);
    if (quote.status === "draft") throw notFound("Quote");
    return respondToQuote(ctx, quote, { action: "approve", signatureName: body.signatureName, ip: req.ip, userAgent: req.headers["user-agent"] ?? null });
  });

  app.post<{ Params: { token: string } }>("/public/quotes/:token/decline", async (req) => {
    const body = parse(serviceApi.declineQuoteBody, req.body ?? {});
    const quote = await getQuoteByToken(ctx.db, req.params.token);
    if (quote.status === "draft") throw notFound("Quote");
    return respondToQuote(ctx, quote, { action: "decline", reason: body.reason, ip: req.ip, userAgent: req.headers["user-agent"] ?? null });
  });

  /** Resume a deposit payment (e.g. the customer closed the page). */
  app.post<{ Params: { token: string } }>("/public/quotes/:token/deposit", async (req) => {
    const quote = await getQuoteByToken(ctx.db, req.params.token);
    const merchant = await loadMerchant(ctx.db, quote.merchantId);
    if (!merchant || quote.status === "draft") throw notFound("Quote");
    await requireFeature(ctx.db, merchant, "service.deposits");
    return { deposit: await depositPayment(ctx, merchant, quote) };
  });

  // ---------------------------------------------------------------- invoices
  app.get<{ Params: { token: string } }>("/public/invoices/:token", async (req): Promise<serviceApi.PublicInvoiceResponse> => {
    const inv = await getInvoiceByToken(ctx.db, req.params.token);
    const merchant = await loadMerchant(ctx.db, inv.merchantId);
    if (!merchant) throw notFound("Invoice");
    await requireFeature(ctx.db, merchant, invoiceFeature(inv));
    const [ticket] = inv.ticketId ? await ctx.db.select().from(serviceTickets).where(eq(serviceTickets.id, inv.ticketId)).limit(1) : [];
    return {
      merchant: publicMerchant(merchant),
      ticket: ticket ? { number: ticket.number, itemKind: ticket.itemKind as serviceApi.ItemKind, itemDetails: ticket.itemDetails } : null,
      invoice: invoiceDto(inv, ctx.config.publicWebUrl),
      canPay: inv.status === "open" && inv.amountDueCents >= 50 && (await paymentsReady(ctx.db, merchant)),
    };
  });

  app.post<{ Params: { token: string } }>("/public/invoices/:token/pay", async (req) => {
    const inv = await getInvoiceByToken(ctx.db, req.params.token);
    return payInvoice(ctx, inv);
  });
}
