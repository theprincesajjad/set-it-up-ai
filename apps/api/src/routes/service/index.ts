/**
 * Service (Pro): tickets, quotes (e-signature approval), deposits, invoices.
 * Docs: docs/engineering/api/service.md. Contract: @ll/shared serviceApi.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { paginationQuery, serviceApi, type FeatureKey } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, requireUser, type StaffRole } from "../../lib/auth.js";
import { HttpError, badRequest, notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { loadMerchant, requirePermission, type StaffPermission } from "../../services/commerceShared.js";
import { requireFeature } from "../../services/features.js";
import * as invoicesSvc from "../../services/invoices.js";
import * as quotesSvc from "../../services/quotes.js";
import * as pickupSvc from "../../services/pickup.js";
import * as rebookingSvc from "../../services/rebooking.js";
import * as serviceSettingsSvc from "../../services/service-settings.js";
import * as ticketsSvc from "../../services/tickets.js";
import { IMAGE_TYPES, MAX_UPLOAD_BYTES, UPLOAD_PATH, getStorage, sniffImage, uploadSigner } from "../../providers/storage.js";

type MerchantParams = { merchantId: string };
type TicketParams = MerchantParams & { ticketId: string };

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  async function staffFor(req: FastifyRequest, minRole: StaffRole, features: FeatureKey[], perm?: StaffPermission) {
    const { merchantId } = req.params as MerchantParams;
    const staff = await requireStaff(ctx, req, merchantId, minRole);
    for (const f of features) await requireFeature(ctx.db, staff.merchant, f);
    if (perm) await requirePermission(ctx, staff, perm);
    return staff;
  }

  // ---------------------------------------------------------------- uploads (ticket photos)
  // Raw image bytes in the body (Content-Type: image/jpeg, image/png, image/webp, image/heic). 5 MB, checked against the file's own header.
  app.addContentTypeParser(Object.keys(IMAGE_TYPES), { parseAs: "buffer", bodyLimit: MAX_UPLOAD_BYTES }, (_req, body, done) => done(null, body));

  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/uploads", async (req, reply): Promise<serviceApi.UploadResponse> => {
    const staff = await requireStaff(ctx, req, req.params.merchantId, "staff");
    const type = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
    const body = req.body;
    if (!(type in IMAGE_TYPES) || !Buffer.isBuffer(body)) throw new HttpError(415, "unsupported_media_type", "Upload a JPEG, PNG, WebP or HEIC photo.");
    if (body.length > MAX_UPLOAD_BYTES) throw new HttpError(413, "too_large", "That photo is over 5 MB. Try a smaller one.");
    const real = sniffImage(body);
    if (!real) throw badRequest("That file isn't a photo we can read.");
    const stored = await getStorage(ctx).put({ merchantId: staff.merchant.id, contentType: real, body });
    // The URL is signed and short-lived: the photo form sends it back and the API stores only the permanent path.
    return reply.status(201).send({ url: uploadSigner(ctx)(`${UPLOAD_PATH}${stored.key}`), contentType: real, bytes: body.length });
  });

  // ---------------------------------------------------------------- shop settings: terms, warranty, tips
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/service-settings", async (req) => {
    const staff = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return serviceSettingsSvc.serviceSettingsDto(staff.merchant);
  });

  app.put<{ Params: MerchantParams }>("/merchants/:merchantId/service-settings", async (req) => {
    const staff = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return serviceSettingsSvc.updateServiceSettings(ctx, staff.merchant, parse(serviceApi.serviceSettingsBody, req.body ?? {}));
  });

  // ---------------------------------------------------------------- tickets
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/tickets/summary", async (req) => {
    const staff = await staffFor(req, "staff", ["service.tickets"]);
    return ticketsSvc.ticketSummary(ctx.db, staff.merchant, ctx.now());
  });

  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/uncollected", async (req) => {
    const staff = await staffFor(req, "staff", ["service.tickets"]);
    return pickupSvc.listUncollected(ctx, staff.merchant);
  });

  app.post<{ Params: TicketParams }>("/merchants/:merchantId/tickets/:ticketId/lien-notice", async (req) => {
    const staff = await staffFor(req, "manager", ["service.tickets"], "tickets.manage");
    const body = parse(serviceApi.lienNoticeBody, req.body ?? {});
    return pickupSvc.recordLienNotice(ctx, staff, req.params.ticketId, body);
  });

  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/tickets", async (req, reply) => {
    const staff = await staffFor(req, "staff", ["service.tickets"], "tickets.manage");
    const body = parse(serviceApi.createTicketBody, req.body);
    return reply.status(201).send(await ticketsSvc.createTicket(ctx, staff, body));
  });

  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/tickets", async (req) => {
    const staff = await staffFor(req, "staff", ["service.tickets"]);
    const q = parse(serviceApi.listTicketsQuery, req.query);
    return ticketsSvc.listTickets(ctx.db, staff.merchant, q, { now: ctx.now, publicWebUrl: ctx.config.publicWebUrl, signUpload: uploadSigner(ctx) });
  });

  app.get<{ Params: TicketParams }>("/merchants/:merchantId/tickets/:ticketId", async (req) => {
    const staff = await staffFor(req, "staff", ["service.tickets"]);
    const ticket = await ticketsSvc.getMerchantTicket(ctx.db, staff.merchant.id, req.params.ticketId);
    return ticketsSvc.getTicketDetail(ctx, staff.merchant, ticket, false);
  });

  app.patch<{ Params: TicketParams }>("/merchants/:merchantId/tickets/:ticketId", async (req) => {
    const staff = await staffFor(req, "staff", ["service.tickets"], "tickets.manage");
    const body = parse(serviceApi.updateTicketBody, req.body);
    return ticketsSvc.updateTicket(ctx, staff, req.params.ticketId, body);
  });

  app.post<{ Params: TicketParams }>("/merchants/:merchantId/tickets/:ticketId/status", async (req) => {
    const staff = await staffFor(req, "staff", ["service.tickets"], "tickets.manage");
    const body = parse(serviceApi.ticketStatusBody, req.body);
    return ticketsSvc.setTicketStatus(ctx, staff, req.params.ticketId, body);
  });

  app.post<{ Params: TicketParams }>("/merchants/:merchantId/tickets/:ticketId/events", async (req, reply) => {
    const staff = await staffFor(req, "staff", ["service.tickets"], "tickets.manage");
    const body = parse(serviceApi.ticketEventBody, req.body);
    return reply.status(201).send(await ticketsSvc.addNote(ctx, staff, req.params.ticketId, body));
  });

  // ---------------------------------------------------------------- quotes
  app.post<{ Params: TicketParams }>("/merchants/:merchantId/tickets/:ticketId/quotes", async (req, reply) => {
    const staff = await staffFor(req, "staff", ["service.tickets", "service.quote_approval"], "quotes.send");
    const body = parse(serviceApi.createQuoteBody, req.body);
    return reply.status(201).send(await quotesSvc.createQuote(ctx, staff, req.params.ticketId, body));
  });

  app.post<{ Params: TicketParams }>("/merchants/:merchantId/tickets/:ticketId/quotes/preview", async (req) => {
    const staff = await staffFor(req, "staff", ["service.tickets", "service.quote_approval"], "quotes.send");
    await ticketsSvc.getMerchantTicket(ctx.db, staff.merchant.id, req.params.ticketId);
    const body = parse(serviceApi.previewQuoteBody, req.body ?? {});
    return quotesSvc.previewQuote(ctx.db, staff.merchant, body);
  });

  app.post<{ Params: MerchantParams & { quoteId: string } }>("/merchants/:merchantId/quotes/:quoteId/authorize-by-phone", async (req) => {
    const staff = await staffFor(req, "staff", ["service.tickets", "service.quote_approval"], "quotes.send");
    const body = parse(serviceApi.authorizeQuoteByPhoneBody, req.body ?? {});
    return quotesSvc.authorizeQuoteByPhone(ctx, staff, req.params.quoteId, body);
  });

  app.post<{ Params: MerchantParams & { quoteId: string } }>("/merchants/:merchantId/quotes/:quoteId/send", async (req) => {
    const staff = await staffFor(req, "staff", ["service.tickets", "service.quote_approval"], "quotes.send");
    return quotesSvc.sendQuote(ctx, staff, req.params.quoteId);
  });

  // ---------------------------------------------------------------- invoices
  app.post<{ Params: TicketParams }>("/merchants/:merchantId/tickets/:ticketId/invoices", async (req, reply) => {
    const staff = await staffFor(req, "staff", ["service.tickets", "service.invoices"], "invoices.manage");
    const body = parse(serviceApi.createInvoiceBody, req.body ?? {});
    return reply.status(201).send(await invoicesSvc.createInvoice(ctx, staff, req.params.ticketId, body));
  });

  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/invoices", async (req) => {
    const staff = await staffFor(req, "staff", ["service.invoices"]);
    const q = parse(serviceApi.listInvoicesQuery, req.query);
    return invoicesSvc.listInvoices(ctx.db, staff.merchant, ctx.config.publicWebUrl, q, ctx.now());
  });

  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/invoices/summary", async (req) => {
    const staff = await staffFor(req, "staff", ["service.invoices"]);
    return invoicesSvc.invoiceSummary(ctx.db, staff.merchant, ctx.now());
  });

  app.get<{ Params: MerchantParams & { invoiceId: string } }>("/merchants/:merchantId/invoices/:invoiceId", async (req) => {
    const staff = await staffFor(req, "staff", ["service.invoices"]);
    return invoicesSvc.invoiceDto(await invoicesSvc.getMerchantInvoice(ctx.db, staff.merchant.id, req.params.invoiceId), ctx.config.publicWebUrl);
  });

  app.post<{ Params: MerchantParams & { invoiceId: string } }>("/merchants/:merchantId/invoices/:invoiceId/send", async (req) => {
    const staff = await staffFor(req, "staff", ["service.invoices"], "invoices.manage");
    return invoicesSvc.sendInvoice(ctx, staff, req.params.invoiceId);
  });

  app.post<{ Params: MerchantParams & { invoiceId: string } }>("/merchants/:merchantId/invoices/:invoiceId/mark-paid", async (req) => {
    const staff = await staffFor(req, "staff", ["service.invoices"], "invoices.manage");
    const body = parse(serviceApi.markInvoicePaidBody, req.body ?? {});
    return invoicesSvc.markInvoicePaid(ctx, staff, req.params.invoiceId, body);
  });

  app.post<{ Params: MerchantParams & { invoiceId: string } }>("/merchants/:merchantId/invoices/:invoiceId/void", async (req) => {
    const staff = await staffFor(req, "manager", ["service.invoices"], "invoices.void");
    return invoicesSvc.voidInvoice(ctx, staff, req.params.invoiceId);
  });

  // ---------------------------------------------------------------- rebooking (service.rebooking)
  type RebookParams = MerchantParams & { userId: string; serviceId: string };

  // ---- phase-pro: p3 ----
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/rebooking/results", async (req) => {
    const staff = await staffFor(req, "staff", ["service.rebooking"]);
    return rebookingSvc.rebookingResults(ctx, staff.merchant);
  });

  /** Public: a book-again link's welcome (first name, service, stylist). The link's id is the key; nothing else about the client is returned. */
  app.get<{ Params: { slug: string; nudgeId: string } }>("/public/shops/:slug/rebook/:nudgeId", async (req) => rebookingSvc.rebookWelcome(ctx, req.params.slug, req.params.nudgeId));
  // ---- end phase-pro: p3 ----

  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/rebooking", async (req) => {
    const staff = await staffFor(req, "staff", ["service.rebooking"]);
    const q = parse(serviceApi.rebookingQuery, req.query);
    return rebookingSvc.rebookingOverview(ctx, staff.merchant, q.state);
  });

  app.post<{ Params: RebookParams }>("/merchants/:merchantId/rebooking/:userId/:serviceId/send", async (req) => {
    const staff = await staffFor(req, "staff", ["service.rebooking"], "bookings.manage");
    return rebookingSvc.sendNudge(ctx, staff.merchant, req.params.userId, req.params.serviceId);
  });

  app.post<{ Params: RebookParams }>("/merchants/:merchantId/rebooking/:userId/:serviceId/skip", async (req, reply) => {
    const staff = await staffFor(req, "staff", ["service.rebooking"], "bookings.manage");
    await rebookingSvc.skipNudge(ctx, staff.merchant, req.params.userId, req.params.serviceId);
    return reply.status(204).send();
  });

  app.post<{ Params: RebookParams }>("/merchants/:merchantId/rebooking/:userId/:serviceId/snooze", async (req, reply) => {
    const staff = await staffFor(req, "staff", ["service.rebooking"], "bookings.manage");
    const body = parse(serviceApi.rebookingActionBody, req.body ?? {});
    await rebookingSvc.snoozeNudge(ctx, staff.merchant, req.params.userId, req.params.serviceId, body.snoozeDays);
    return reply.status(204).send();
  });

  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/rebooking/send-all", async (req) => {
    const staff = await staffFor(req, "manager", ["service.rebooking"], "bookings.manage");
    return rebookingSvc.sendAllDue(ctx, staff.merchant);
  });

  app.put<{ Params: MerchantParams }>("/merchants/:merchantId/rebooking/settings", async (req) => {
    const staff = await staffFor(req, "manager", ["service.rebooking"], "bookings.manage");
    const body = parse(serviceApi.rebookingSettingsBody, req.body);
    // phase-pro: p3 -- any mode; "auto" is checked against the plan inside setRebookingMode (402 with the Pro offer)
    if (body.mode) return rebookingSvc.setRebookingMode(ctx, staff.merchant, body.mode);
    return rebookingSvc.setAuto(ctx, staff.merchant, !!body.auto);
  });

  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/rebooking/rules", async (req) => {
    const staff = await staffFor(req, "staff", ["service.rebooking"]);
    return { items: await rebookingSvc.listRules(ctx, staff.merchant) };
  });

  app.put<{ Params: MerchantParams & { serviceId: string } }>("/merchants/:merchantId/rebooking/rules/:serviceId", async (req) => {
    const staff = await staffFor(req, "manager", ["service.rebooking"], "bookings.manage");
    const body = parse(serviceApi.rebookRuleBody, req.body);
    return rebookingSvc.setRule(ctx, staff.merchant, req.params.serviceId, body);
  });

  // ---------------------------------------------------------------- customer side
  app.get("/me/tickets", async (req) => {
    const user = requireUser(req);
    const q = parse(paginationQuery, req.query);
    return ticketsSvc.listMyTickets(ctx.db, user.id, q, uploadSigner(ctx));
  });

  app.get<{ Params: { ticketId: string } }>("/me/tickets/:ticketId", async (req) => {
    const user = requireUser(req);
    const { ticket, merchant } = await ticketsSvc.getMyTicket(ctx.db, user.id, req.params.ticketId);
    return ticketsSvc.getTicketDetail(ctx, merchant, ticket, true);
  });

  app.post<{ Params: { quoteId: string } }>("/me/quotes/:quoteId/approve", async (req) => {
    const user = requireUser(req);
    const body = parse(serviceApi.approveQuoteBody, req.body);
    const quote = await quotesSvc.getMyQuote(ctx.db, user.id, req.params.quoteId);
    return quotesSvc.respondToQuote(ctx, quote, { action: "approve", signatureName: body.signatureName, ip: req.ip, userAgent: req.headers["user-agent"] ?? null });
  });

  app.post<{ Params: { quoteId: string } }>("/me/quotes/:quoteId/decline", async (req) => {
    const user = requireUser(req);
    const body = parse(serviceApi.declineQuoteBody, req.body ?? {});
    const quote = await quotesSvc.getMyQuote(ctx.db, user.id, req.params.quoteId);
    return quotesSvc.respondToQuote(ctx, quote, { action: "decline", reason: body.reason, ip: req.ip, userAgent: req.headers["user-agent"] ?? null });
  });

  app.post<{ Params: { quoteId: string } }>("/me/quotes/:quoteId/deposit", async (req) => {
    const user = requireUser(req);
    const quote = await quotesSvc.getMyQuote(ctx.db, user.id, req.params.quoteId);
    const merchant = await loadMerchant(ctx.db, quote.merchantId);
    if (!merchant) throw notFound("Quote");
    await requireFeature(ctx.db, merchant, "service.deposits");
    return { deposit: await quotesSvc.depositPayment(ctx, merchant, quote) };
  });

  app.post<{ Params: { invoiceId: string } }>("/me/invoices/:invoiceId/pay", async (req) => {
    const user = requireUser(req);
    const inv = await invoicesSvc.getMyInvoice(ctx.db, user.id, req.params.invoiceId);
    const body = parse(serviceApi.payInvoiceBody, req.body ?? {});
    return invoicesSvc.payInvoice(ctx, inv, { tipCents: body.tipCents });
  });
}
