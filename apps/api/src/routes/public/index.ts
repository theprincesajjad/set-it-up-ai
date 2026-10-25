/**
 * Public (no login) commerce/service pages: menu, pickup slots, quote
 * approval by token (e-signature log), invoice pay by token.
 * Docs: docs/engineering/api/public.md.
 */
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { merchants, serviceTickets } from "@ll/db";
import { commerceApi, restaurantApi, serviceApi, tipsEnabledFor } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { HttpError, notFound } from "../../lib/errors.js";
import { checkUploadSignature, getStorage } from "../../providers/storage.js";
import { parse } from "../../lib/validate.js";
import { slotFeature, listSlots } from "../../services/bookings.js";
import { publicMenu } from "../../services/catalog.js";
import { loadMerchant, paymentsReady } from "../../services/commerceShared.js";
import { getMerchantFeatures, requireFeature, requireFeatureFrom } from "../../services/features.js";
import { getInvoiceByToken, invoiceDto, invoiceFeature, invoiceTipInfo, payInvoice, previewInvoicePoints } from "../../services/invoices.js";
import { depositPayment, getQuoteByToken, isExpired, markQuoteViewed, quoteDto, respondToQuote } from "../../services/quotes.js";
import { merchantTax } from "../../services/tax.js";
import { getTicketByStatusToken, publicTicketStatus } from "../../services/tickets.js";

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  async function merchantBySlug(slug: string) {
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.slug, slug)).limit(1);
    if (!m || m.status === "closed") throw notFound("Shop");
    return m;
  }

  const publicMerchant = (m: typeof merchants.$inferSelect) => ({ name: m.name, slug: m.slug, logoUrl: m.logoUrl, phone: m.phone, vertical: m.vertical });

  // ---------------------------------------------------------------- uploads (dev disk storage; hosted stores presign their own URLs)
  // Only signed, unexpired links are served (providers/storage.ts). The signature covers the key and the expiry, so
  // neither can be changed, and a key without a signature is not readable at all.
  app.get<{ Params: { merchantId: string; file: string }; Querystring: { exp?: string; sig?: string } }>("/public/uploads/:merchantId/:file", async (req, reply) => {
    const key = `${req.params.merchantId}/${req.params.file}`;
    const now = ctx.now();
    const verdict = checkUploadSignature(ctx.config.jwtSecret, key, req.query.exp, req.query.sig, now);
    if (verdict === "invalid") throw new HttpError(403, "invalid_link", "This photo link is not valid.");
    if (verdict === "expired") throw new HttpError(403, "link_expired", "This photo link has expired. Reload the page to get a new one.");
    const obj = await getStorage(ctx).get?.(key);
    if (!obj) throw notFound("Photo");
    const left = Math.max(0, Number(req.query.exp) - Math.floor(now.getTime() / 1000));
    return reply
      .header("content-type", obj.contentType)
      .header("cache-control", `private, max-age=${left}`)
      .header("x-content-type-options", "nosniff")
      .header("referrer-policy", "no-referrer")
      .send(obj.body);
  });

  // ---------------------------------------------------------------- menu & slots
  app.get<{ Params: { slug: string } }>("/public/shops/:slug/menu", async (req) => {
    const m = await merchantBySlug(req.params.slug);
    // Resolve the shop's features once: the gate, the menu's dietary/language switches and "can pay in app" all read them.
    const features = await getMerchantFeatures(ctx.db, m);
    requireFeatureFrom(features, "orders.order_ahead");
    return publicMenu(ctx.db, m, parse(restaurantApi.publicMenuQuery, req.query), ctx.now(), features);
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
  async function quoteView(token: string, markView = true): Promise<serviceApi.PublicQuoteResponse> {
    let quote = await getQuoteByToken(ctx.db, token);
    if (quote.status === "draft") throw notFound("Quote");
    const merchant = await loadMerchant(ctx.db, quote.merchantId);
    if (!merchant) throw notFound("Quote");
    await requireFeature(ctx.db, merchant, "service.quote_approval");
    // The customer opening the link is the "opened, not approved" signal on the shop's board (stamped once).
    if (markView) quote = await markQuoteViewed(ctx, quote);
    const [ticket] = await ctx.db.select().from(serviceTickets).where(and(eq(serviceTickets.id, quote.ticketId), eq(serviceTickets.merchantId, merchant.id))).limit(1);
    if (!ticket) throw notFound("Quote");
    const expired = isExpired(quote, ctx.now());
    const d = ticket.itemDetails;
    const event = d.eventType ? { type: d.eventType, date: d.eventDate ?? null, start: d.eventStart ?? null, where: d.eventWhere ?? null, trial: d.trial ?? null, balanceDueOn: d.balanceDueOn ?? null } : null;
    return {
      merchant: publicMerchant(merchant),
      ticket: { number: ticket.number, itemKind: ticket.itemKind as serviceApi.ItemKind, itemDetails: ticket.itemDetails, issue: ticket.issue, status: ticket.status },
      event,
      promisedAt: ticket.promisedAt ? ticket.promisedAt.toISOString() : null,
      taxLabel: quote.taxCents > 0 ? (await merchantTax(ctx.db, merchant, quote.subtotalCents)).label : null,
      terms: merchant.intakeTerms?.trim() || null,
      quote: { ...quoteDto(quote, ctx.config.publicWebUrl, false), status: expired ? "expired" : quote.status },
      expired,
      canRespond: quote.status === "sent" && !expired,
      depositDue: quote.status === "approved" && quote.depositCents > 0 && !quote.depositPaidAt,
    };
  }

  // `?preview=1` is the staff "Preview as customer" link: it must not count as the customer opening the quote.
  app.get<{ Params: { token: string }; Querystring: { preview?: string } }>("/public/quotes/:token", async (req) => quoteView(req.params.token, req.query.preview !== "1"));

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
    const tipsOn = tipsEnabledFor(merchant.vertical, merchant.tipsEnabled);
    return {
      merchant: publicMerchant(merchant),
      ticket: ticket ? { number: ticket.number, itemKind: ticket.itemKind as serviceApi.ItemKind, itemDetails: ticket.itemDetails } : null,
      invoice: invoiceDto(inv, ctx.config.publicWebUrl),
      canPay: inv.status === "open" && inv.amountDueCents >= 50 && (await paymentsReady(ctx.db, merchant)),
      tip: { enabled: tipsOn, presets: merchant.tipPresets, baseCents: inv.subtotalCents, staff: tipsOn ? (await invoiceTipInfo(ctx.db, inv)).staff : null },
      taxLabel: inv.taxCents > 0 ? (await merchantTax(ctx.db, merchant, inv.subtotalCents)).label : null,
      pointsPreview: inv.status === "open" ? await previewInvoicePoints(ctx.db, inv) : inv.pointsEarned,
    };
  });

  /** Ticket status page by its own token: no sign-in, only what the customer may see. */
  app.get<{ Params: { token: string } }>("/public/tickets/:token", async (req): Promise<serviceApi.PublicTicketStatusResponse> => {
    const ticket = await getTicketByStatusToken(ctx.db, req.params.token, ctx.now());
    return publicTicketStatus(ctx, ticket);
  });

  app.post<{ Params: { token: string } }>("/public/invoices/:token/pay", async (req) => {
    const inv = await getInvoiceByToken(ctx.db, req.params.token);
    const body = parse(serviceApi.payInvoiceBody, req.body ?? {});
    return payInvoice(ctx, inv, { tipCents: body.tipCents });
  });
}
