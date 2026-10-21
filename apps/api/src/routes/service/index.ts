/**
 * Service (Pro): tickets, quotes (e-signature approval), deposits, invoices.
 * Docs: docs/engineering/api/service.md. Contract: @ll/shared serviceApi.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { paginationQuery, serviceApi, type FeatureKey } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, requireUser, type StaffRole } from "../../lib/auth.js";
import { notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { loadMerchant, requirePermission, type StaffPermission } from "../../services/commerceShared.js";
import { requireFeature } from "../../services/features.js";
import * as invoicesSvc from "../../services/invoices.js";
import * as quotesSvc from "../../services/quotes.js";
import * as ticketsSvc from "../../services/tickets.js";

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

  // ---------------------------------------------------------------- tickets
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/tickets", async (req, reply) => {
    const staff = await staffFor(req, "staff", ["service.tickets"], "tickets.manage");
    const body = parse(serviceApi.createTicketBody, req.body);
    return reply.status(201).send(await ticketsSvc.createTicket(ctx, staff, body));
  });

  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/tickets", async (req) => {
    const staff = await staffFor(req, "staff", ["service.tickets"]);
    const q = parse(serviceApi.listTicketsQuery, req.query);
    return ticketsSvc.listTickets(ctx.db, staff.merchant, q);
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
    return invoicesSvc.listInvoices(ctx.db, staff.merchant, ctx.config.publicWebUrl, q);
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

  // ---------------------------------------------------------------- customer side
  app.get("/me/tickets", async (req) => {
    const user = requireUser(req);
    const q = parse(paginationQuery, req.query);
    return ticketsSvc.listMyTickets(ctx.db, user.id, q);
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
    return invoicesSvc.payInvoice(ctx, inv);
  });
}
