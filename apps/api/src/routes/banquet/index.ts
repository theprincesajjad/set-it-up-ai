/**
 * Banquet halls (Pro: restaurant.banquet): halls, availability, 72-hour holds,
 * confirmation after deposit, cancel, catering link.
 * Contract: @ll/shared restaurantApi (Banquet section).
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { halls, merchants } from "@ll/db";
import { restaurantApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, requireUser, type StaffRole } from "../../lib/auth.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { loadMerchant } from "../../services/commerceShared.js";
import { requireFeature } from "../../services/features.js";
import { findOrCreateCustomerByPhone } from "../../services/ledger.js";
import { requirePhone } from "../../services/merchant.js";
import * as svc from "../../services/banquet.js";

type MerchantParams = { merchantId: string };
type HallParams = MerchantParams & { hallId: string };
type BookingParams = MerchantParams & { bookingId: string };

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  async function staffFor(req: FastifyRequest, minRole: StaffRole = "staff") {
    const { merchantId } = req.params as MerchantParams;
    const staff = await requireStaff(ctx, req, merchantId, minRole);
    await requireFeature(ctx.db, staff.merchant, "restaurant.banquet");
    return staff;
  }
  const bookingOut = async (b: svc.HallBooking) => svc.bookingDtoFor(ctx.db, b);

  // ---------------------------------------------------------------- halls
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/banquet/halls", async (req) => {
    const staff = await staffFor(req);
    return svc.listHalls(ctx.db, staff.merchant.id);
  });

  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/banquet/halls", async (req, reply) => {
    const staff = await staffFor(req, "manager");
    return reply.status(201).send(await svc.createHall(ctx.db, staff.merchant.id, parse(restaurantApi.createHallBody, req.body)));
  });

  app.get<{ Params: HallParams }>("/merchants/:merchantId/banquet/halls/:hallId", async (req) => {
    const staff = await staffFor(req);
    return svc.hallDto(await svc.getHall(ctx.db, staff.merchant.id, req.params.hallId));
  });

  app.patch<{ Params: HallParams }>("/merchants/:merchantId/banquet/halls/:hallId", async (req) => {
    const staff = await staffFor(req, "manager");
    return svc.updateHall(ctx.db, staff.merchant.id, req.params.hallId, parse(restaurantApi.updateHallBody, req.body));
  });

  app.delete<{ Params: HallParams }>("/merchants/:merchantId/banquet/halls/:hallId", async (req, reply) => {
    const staff = await staffFor(req, "manager");
    await svc.deleteHall(ctx.db, staff.merchant.id, req.params.hallId);
    return reply.status(204).send();
  });

  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/banquet/availability", async (req) => {
    const staff = await staffFor(req);
    const q = parse(restaurantApi.hallAvailabilityQuery, req.query);
    return svc.availability(ctx, staff.merchant.id, { from: new Date(q.from), to: new Date(q.to), hallId: q.hallId });
  });

  // ---------------------------------------------------------------- bookings (staff)
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/banquet/bookings", async (req) => {
    const staff = await staffFor(req);
    return svc.listBookings(ctx.db, staff.merchant.id, parse(restaurantApi.listHallBookingsQuery, req.query));
  });

  app.get<{ Params: BookingParams }>("/merchants/:merchantId/banquet/bookings/:bookingId", async (req) => {
    const staff = await staffFor(req);
    return bookingOut(await svc.getBooking(ctx.db, staff.merchant.id, req.params.bookingId));
  });

  /** Staff hold on behalf of a customer (phone call, walk-in). */
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/banquet/bookings", async (req, reply) => {
    const staff = await staffFor(req);
    const body = parse(restaurantApi.createHoldBody, req.body);
    if (!body.customer) throw badRequest("Add the customer's phone number to hold a hall for them");
    const { user } = await findOrCreateCustomerByPhone(ctx.db, requirePhone(body.customer.phone), body.customer.name);
    const r = await svc.createHold(ctx, staff.merchant, user.id, body);
    return reply.status(201).send({ ...r, booking: await bookingOut(await svc.getBooking(ctx.db, staff.merchant.id, r.booking.id)) });
  });

  app.post<{ Params: BookingParams }>("/merchants/:merchantId/banquet/bookings/:bookingId/confirm", async (req) => {
    const staff = await staffFor(req);
    return bookingOut(await svc.confirm(ctx, staff.merchant.id, req.params.bookingId, parse(restaurantApi.confirmHallBookingBody, req.body ?? {})));
  });

  app.post<{ Params: BookingParams }>("/merchants/:merchantId/banquet/bookings/:bookingId/cancel", async (req) => {
    const staff = await staffFor(req);
    return bookingOut(await svc.cancel(ctx, { merchantId: staff.merchant.id, bookingId: req.params.bookingId }));
  });

  app.post<{ Params: BookingParams }>("/merchants/:merchantId/banquet/bookings/:bookingId/complete", async (req) => {
    const staff = await staffFor(req);
    return bookingOut(await svc.complete(ctx, staff.merchant.id, req.params.bookingId));
  });

  app.post<{ Params: BookingParams }>("/merchants/:merchantId/banquet/bookings/:bookingId/deposit", async (req) => {
    const staff = await staffFor(req);
    const b = await svc.getBooking(ctx.db, staff.merchant.id, req.params.bookingId);
    return { booking: await bookingOut(b), deposit: await svc.depositPayment(ctx, staff.merchant, b) };
  });

  /** Link a catering event to this booking (the catering side links back). Needs both features. */
  app.post<{ Params: BookingParams }>("/merchants/:merchantId/banquet/bookings/:bookingId/catering", async (req) => {
    const staff = await staffFor(req);
    await requireFeature(ctx.db, staff.merchant, "restaurant.catering");
    const { cateringEventId } = parse(restaurantApi.linkCateringBody, req.body);
    return bookingOut(await svc.linkCatering(ctx, staff.merchant.id, req.params.bookingId, cateringEventId));
  });

  // ---------------------------------------------------------------- customer
  app.post("/me/banquet/holds", async (req, reply) => {
    const user = requireUser(req);
    const body = parse(restaurantApi.createHoldBody, req.body);
    const [h] = await ctx.db.select({ merchantId: halls.merchantId }).from(halls).where(eq(halls.id, body.hallId)).limit(1);
    const merchant = h && (await loadMerchant(ctx.db, h.merchantId));
    if (!merchant || merchant.status === "closed") throw notFound("Hall");
    await requireFeature(ctx.db, merchant, "restaurant.banquet");
    // A customer can't attach someone else's catering event.
    const r = await svc.createHold(ctx, merchant, user.id, { ...body, customer: null, cateringEventId: null });
    return reply.status(201).send(r);
  });

  app.get("/me/banquet/bookings", async (req) => svc.listMyBookings(ctx.db, requireUser(req).id));

  app.get<{ Params: { bookingId: string } }>("/me/banquet/bookings/:bookingId", async (req) => {
    const b = await svc.getMyBooking(ctx.db, requireUser(req).id, req.params.bookingId);
    const merchant = await loadMerchant(ctx.db, b.merchantId);
    return { booking: await bookingOut(b), deposit: merchant ? await svc.depositPayment(ctx, merchant, b) : null };
  });

  app.post<{ Params: { bookingId: string } }>("/me/banquet/bookings/:bookingId/cancel", async (req) => {
    return bookingOut(await svc.cancel(ctx, { userId: requireUser(req).id, bookingId: req.params.bookingId }));
  });

  // ---------------------------------------------------------------- public
  async function shop(slug: string) {
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.slug, slug)).limit(1);
    if (!m || m.status === "closed") throw notFound("Shop");
    await requireFeature(ctx.db, m, "restaurant.banquet");
    return m;
  }

  app.get<{ Params: { slug: string } }>("/public/shops/:slug/banquet/halls", async (req) => {
    const m = await shop(req.params.slug);
    return svc.listHalls(ctx.db, m.id, { activeOnly: true });
  });

  app.get<{ Params: { slug: string } }>("/public/shops/:slug/banquet/availability", async (req) => {
    const m = await shop(req.params.slug);
    const q = parse(restaurantApi.hallAvailabilityQuery, req.query);
    // Busy windows only (no customer detail) — the response has none.
    return svc.availability(ctx, m.id, { from: new Date(q.from), to: new Date(q.to), hallId: q.hallId, activeOnly: true });
  });
}

