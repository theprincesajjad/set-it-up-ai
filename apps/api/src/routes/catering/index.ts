/**
 * Catering & events (Growth: restaurant.catering): staff pipeline, public
 * inquiry + token approval, customer "my events".
 * Contract: @ll/shared restaurantApi (Catering section).
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { merchants } from "@ll/db";
import { restaurantApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, requireUser, type StaffRole } from "../../lib/auth.js";
import { notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { loadMerchant } from "../../services/commerceShared.js";
import { requireFeature } from "../../services/features.js";
import * as banquetSvc from "../../services/banquet.js";
import * as svc from "../../services/catering.js";

type MerchantParams = { merchantId: string };
type EventParams = MerchantParams & { eventId: string };

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  async function staffFor(req: FastifyRequest, minRole: StaffRole = "staff") {
    const { merchantId } = req.params as MerchantParams;
    const staff = await requireStaff(ctx, req, merchantId, minRole);
    await requireFeature(ctx.db, staff.merchant, "restaurant.catering");
    return staff;
  }
  const out = async (e: svc.CateringEvent) => svc.staffDto(ctx, e);

  // ---------------------------------------------------------------- staff pipeline
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/catering", async (req) => {
    const staff = await staffFor(req);
    return svc.listEvents(ctx, staff.merchant, parse(restaurantApi.listCateringQuery, req.query));
  });

  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/catering/calendar", async (req) => {
    const staff = await staffFor(req);
    return svc.calendar(ctx, staff.merchant, parse(restaurantApi.cateringCalendarQuery, req.query));
  });

  app.get<{ Params: EventParams }>("/merchants/:merchantId/catering/:eventId", async (req) => {
    const staff = await staffFor(req);
    return out(await svc.getMerchantEvent(ctx.db, staff.merchant.id, req.params.eventId));
  });

  app.patch<{ Params: EventParams }>("/merchants/:merchantId/catering/:eventId", async (req) => {
    const staff = await staffFor(req);
    return out(await svc.updateEvent(ctx, staff, req.params.eventId, parse(restaurantApi.updateCateringBody, req.body)));
  });

  /** Staff-entered inquiry (phone / walk-in): same body as the public form. */
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/catering", async (req, reply) => {
    const staff = await staffFor(req);
    const body = parse(restaurantApi.cateringPublicInquiryBody, req.body);
    const event = await svc.createPublicInquiry(ctx, staff.merchant, body, req.ip);
    return reply.status(201).send(await out(event));
  });

  app.put<{ Params: EventParams }>("/merchants/:merchantId/catering/:eventId/menu", async (req) => {
    const staff = await staffFor(req);
    return out(await svc.setMenu(ctx, staff, req.params.eventId, parse(restaurantApi.cateringMenuBody, req.body)));
  });

  app.post<{ Params: EventParams }>("/merchants/:merchantId/catering/:eventId/tasting", async (req) => {
    const staff = await staffFor(req);
    return out(await svc.scheduleTasting(ctx, staff, req.params.eventId, parse(restaurantApi.cateringTastingBody, req.body)));
  });

  app.post<{ Params: EventParams }>("/merchants/:merchantId/catering/:eventId/send-quote", async (req) => {
    const staff = await staffFor(req);
    return out(await svc.sendQuote(ctx, staff, req.params.eventId, parse(restaurantApi.cateringSendQuoteBody, req.body ?? {})));
  });

  app.post<{ Params: EventParams }>("/merchants/:merchantId/catering/:eventId/deposit/mark-paid", async (req) => {
    const staff = await staffFor(req);
    parse(restaurantApi.cateringMarkDepositBody, req.body ?? {});
    return out(await svc.markDepositPaid(ctx, staff, req.params.eventId));
  });

  app.post<{ Params: EventParams }>("/merchants/:merchantId/catering/:eventId/invoice", async (req, reply) => {
    const staff = await staffFor(req);
    return reply.status(201).send(await svc.convertToInvoice(ctx, staff, req.params.eventId, parse(restaurantApi.cateringInvoiceBody, req.body ?? {})));
  });

  app.post<{ Params: EventParams }>("/merchants/:merchantId/catering/:eventId/complete", async (req) => {
    const staff = await staffFor(req);
    return out(await svc.completeEvent(ctx, staff, req.params.eventId));
  });

  app.post<{ Params: EventParams }>("/merchants/:merchantId/catering/:eventId/cancel", async (req) => {
    const staff = await staffFor(req);
    return out(await svc.cancelEvent(ctx, staff, req.params.eventId, parse(restaurantApi.cateringCancelBody, req.body ?? {})));
  });

  /** Link a hall booking to this event (the banquet side links back). Needs both features. */
  app.post<{ Params: EventParams }>("/merchants/:merchantId/catering/:eventId/hall-booking", async (req) => {
    const staff = await staffFor(req);
    await requireFeature(ctx.db, staff.merchant, "restaurant.banquet");
    const { hallBookingId } = parse(restaurantApi.linkHallBookingBody, req.body);
    await svc.getMerchantEvent(ctx.db, staff.merchant.id, req.params.eventId);
    await banquetSvc.linkCatering(ctx, staff.merchant.id, hallBookingId, req.params.eventId);
    return out(await svc.getMerchantEvent(ctx.db, staff.merchant.id, req.params.eventId));
  });

  // ---------------------------------------------------------------- customer
  app.post("/me/catering", async (req, reply) => {
    const user = requireUser(req);
    const { merchantId, ...body } = parse(restaurantApi.cateringMyInquiryBody, req.body);
    const merchant = await loadMerchant(ctx.db, merchantId);
    if (!merchant || merchant.status === "closed") throw notFound("Shop");
    const event = await svc.createInquiry(ctx, merchant, user.id, body);
    return reply.status(201).send(await svc.myDto(ctx, event));
  });

  app.get("/me/catering", async (req) => svc.listMyEvents(ctx, requireUser(req).id));

  app.get<{ Params: { eventId: string } }>("/me/catering/:eventId", async (req) => svc.getMyEvent(ctx, requireUser(req).id, req.params.eventId));

  // ---------------------------------------------------------------- public (no login)
  app.post<{ Params: { slug: string } }>("/public/shops/:slug/catering/inquiries", async (req, reply) => {
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.slug, req.params.slug)).limit(1);
    if (!m || m.status === "closed") throw notFound("Shop");
    const body = parse(restaurantApi.cateringPublicInquiryBody, req.body);
    const event = await svc.createPublicInquiry(ctx, m, body, req.ip);
    // The customer gets a thank-you reference, never the staff view or the approval token.
    return reply.status(201).send({ id: event.id, number: event.number, status: event.status, eventDate: event.eventDate, headcount: event.headcount });
  });

  async function publicView(token: string): Promise<restaurantApi.PublicCateringResponse> {
    const event = await svc.getEventByToken(ctx.db, token);
    const merchant = await loadMerchant(ctx.db, event.merchantId);
    if (!merchant) throw notFound("Catering quote");
    await requireFeature(ctx.db, merchant, "restaurant.catering");
    return {
      merchant: { name: merchant.name, slug: merchant.slug, logoUrl: merchant.logoUrl, phone: merchant.phone },
      event: svc.cateringDto(event, ctx.config.publicWebUrl, false),
      canApprove: event.status === "quoted" && !event.approvedAt,
      depositDue: event.status === "quoted" && !!event.approvedAt && event.depositCents > 0 && !event.depositPaidAt,
    };
  }

  app.get<{ Params: { token: string } }>("/public/catering/:token", async (req) => publicView(req.params.token));

  app.post<{ Params: { token: string } }>("/public/catering/:token/approve", async (req) => {
    const body = parse(restaurantApi.cateringApproveBody, req.body);
    const event = await svc.getEventByToken(ctx.db, req.params.token);
    return svc.approveEvent(ctx, event, { signatureName: body.signatureName, ip: req.ip, userAgent: req.headers["user-agent"] ?? null });
  });
}
