/**
 * Appointments (Café & Retail: booking.appointments): services and prices, staff hours and time off, the
 * calendar, walk-ins, checkout with a tip, online booking with a deposit or card on file, reminders.
 * Contract: @ll/shared appointmentsApi. Docs: docs/engineering/api/appointments.md.
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { merchants } from "@ll/db";
import { appointmentsApi, type FeatureKey } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, requireUser, type StaffRole } from "../../lib/auth.js";
import { HttpError, notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { requirePermission } from "../../services/commerceShared.js";
import { requireFeature } from "../../services/features.js";
import * as svc from "../../services/appointments.js";
import * as booking from "../../services/appointments-booking.js";
import * as checkoutSvc from "../../services/appointments-checkout.js";
import { isOwnClientsOnly } from "../../services/barber.js";

type MerchantParams = { merchantId: string };
type ServiceParams = MerchantParams & { serviceId: string };
type StaffParams = MerchantParams & { userId: string };
type ApptParams = MerchantParams & { appointmentId: string };

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  async function staffFor(req: FastifyRequest, minRole: StaffRole = "staff", feature: FeatureKey = "booking.appointments", perm: "bookings.manage" | null = "bookings.manage") {
    const { merchantId } = req.params as MerchantParams;
    const staff = await requireStaff(ctx, req, merchantId, minRole);
    await requireFeature(ctx.db, staff.merchant, feature);
    if (perm) await requirePermission(ctx, staff, perm);
    return staff;
  }
  /** The price list is shared: appointment services need appointments, the repair price list needs tickets. */
  const featureFor = (kind: string | undefined): FeatureKey => (kind === "repair_line" ? "service.tickets" : "booking.appointments");

  // ---------------------------------------------------------------- services (price list)
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/services", async (req) => {
    const q = parse(appointmentsApi.listServicesQuery, req.query);
    const staff = await staffFor(req, "staff", featureFor(q.kind), null);
    return svc.listServices(ctx.db, staff.merchant.id, q);
  });

  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/services", async (req, reply) => {
    const body = parse(appointmentsApi.createServiceBody, req.body);
    const staff = await staffFor(req, "manager", featureFor(body.kind), null);
    return reply.status(201).send(await svc.createService(ctx.db, staff.merchant.id, body));
  });

  app.patch<{ Params: ServiceParams }>("/merchants/:merchantId/services/:serviceId", async (req) => {
    const { merchantId, serviceId } = req.params;
    const cur = await svc.getService(ctx.db, merchantId, serviceId).catch(() => null);
    const staff = await staffFor(req, "manager", featureFor(cur?.kind), null);
    return svc.updateService(ctx, staff.merchant.id, serviceId, parse(appointmentsApi.updateServiceBody, req.body));
  });

  app.delete<{ Params: ServiceParams }>("/merchants/:merchantId/services/:serviceId", async (req, reply) => {
    const { merchantId, serviceId } = req.params;
    const cur = await svc.getService(ctx.db, merchantId, serviceId).catch(() => null);
    const staff = await staffFor(req, "manager", featureFor(cur?.kind), null);
    await svc.deleteService(ctx.db, staff.merchant.id, serviceId);
    return reply.status(204).send();
  });

  // ---------------------------------------------------------------- staff hours, time off, services
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/appointments/staff", async (req) => {
    const staff = await staffFor(req);
    const q = req.query as { from?: string; to?: string };
    return svc.listBookableStaff(ctx.db, staff.merchant, ctx.now(), { from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined });
  });

  app.put<{ Params: StaffParams }>("/merchants/:merchantId/staff/:userId/hours", async (req) => {
    const staff = await staffFor(req, "manager");
    return { items: await svc.putStaffHours(ctx.db, staff.merchant, req.params.userId, parse(appointmentsApi.putStaffHoursBody, req.body)) };
  });

  app.post<{ Params: StaffParams }>("/merchants/:merchantId/staff/:userId/time-off", async (req, reply) => {
    const staff = await staffFor(req);
    return reply.status(201).send(await svc.createTimeOff(ctx.db, staff.merchant.id, req.params.userId, parse(appointmentsApi.createTimeOffBody, req.body)));
  });

  app.delete<{ Params: MerchantParams & { timeOffId: string } }>("/merchants/:merchantId/staff/time-off/:timeOffId", async (req, reply) => {
    const staff = await staffFor(req);
    await svc.deleteTimeOff(ctx.db, staff.merchant.id, req.params.timeOffId);
    return reply.status(204).send();
  });

  app.put<{ Params: StaffParams }>("/merchants/:merchantId/staff/:userId/services", async (req) => {
    const staff = await staffFor(req, "manager");
    return { items: await svc.putStaffServices(ctx.db, staff.merchant.id, req.params.userId, parse(appointmentsApi.putStaffServicesBody, req.body)) };
  });

  // ---------------------------------------------------------------- settings
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/appointments/settings", async (req) => {
    const staff = await staffFor(req, "staff", "booking.appointments", null);
    return svc.settingsDto(ctx, staff.merchant);
  });

  app.put<{ Params: MerchantParams }>("/merchants/:merchantId/appointments/settings", async (req) => {
    const staff = await staffFor(req, "manager", "booking.appointments", null);
    return svc.updateSettings(ctx, staff.merchant, parse(appointmentsApi.appointmentSettingsBody, req.body));
  });

  // ---------------------------------------------------------------- calendar
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/appointments", async (req) => {
    const staff = await staffFor(req);
    const q = parse(appointmentsApi.listAppointmentsQuery, req.query);
    // A chair renter who sees only their own clients gets only their own column (staff.payouts: own_clients_only).
    if (await isOwnClientsOnly(ctx, staff)) q.staffId = staff.user.id;
    return svc.listAppointments(ctx.db, staff.merchant, q, ctx.now());
  });

  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/appointments", async (req, reply) => {
    const staff = await staffFor(req);
    return reply.status(201).send(await svc.createAppointment(ctx, staff, parse(appointmentsApi.createAppointmentBody, req.body)));
  });

  app.get<{ Params: ApptParams }>("/merchants/:merchantId/appointments/:appointmentId", async (req) => {
    const staff = await staffFor(req);
    const detail = await svc.appointmentDetail(ctx.db, staff.merchant, req.params.appointmentId);
    if (detail.appointment.staffId !== staff.user.id && (await isOwnClientsOnly(ctx, staff))) throw new HttpError(403, "own_clients_only", "You see your own clients only.");
    return detail;
  });

  app.patch<{ Params: ApptParams }>("/merchants/:merchantId/appointments/:appointmentId", async (req) => {
    const staff = await staffFor(req);
    return svc.updateAppointment(ctx, staff, req.params.appointmentId, parse(appointmentsApi.updateAppointmentBody, req.body));
  });

  app.post<{ Params: ApptParams }>("/merchants/:merchantId/appointments/:appointmentId/status", async (req) => {
    const staff = await staffFor(req);
    return booking.setStatus(ctx, staff, req.params.appointmentId, parse(appointmentsApi.appointmentStatusBody, req.body));
  });

  app.post<{ Params: ApptParams }>("/merchants/:merchantId/appointments/:appointmentId/check-in", async (req) => {
    const staff = await staffFor(req);
    return booking.setStatus(ctx, staff, req.params.appointmentId, { status: "arrived", chargeFee: false });
  });

  app.post<{ Params: ApptParams }>("/merchants/:merchantId/appointments/:appointmentId/checkout", async (req) => {
    const staff = await staffFor(req);
    return checkoutSvc.checkout(ctx, staff, req.params.appointmentId, parse(appointmentsApi.checkoutBody, req.body));
  });

  // ---------------------------------------------------------------- public shop page
  async function shop(slug: string) {
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.slug, slug)).limit(1);
    if (!m || m.status === "closed") throw notFound("Shop");
    await requireFeature(ctx.db, m, "booking.appointments");
    return m;
  }

  app.get<{ Params: { slug: string } }>("/public/shops/:slug/services", async (req) => booking.publicServices(ctx, await shop(req.params.slug)));

  app.get<{ Params: { slug: string } }>("/public/shops/:slug/availability", async (req, reply) => {
    const m = await shop(req.params.slug);
    const q = parse(appointmentsApi.availabilityQuery, req.query);
    reply.header("cache-control", "public, max-age=30");
    return svc.computeAvailability(ctx, m, { serviceIds: q.serviceIds, staffId: q.staffId, from: q.from, to: q.to, locationId: q.locationId });
  });

  // ---------------------------------------------------------------- customer
  app.post("/me/appointments", async (req, reply) => {
    const user = requireUser(req);
    return reply.status(201).send(await booking.createMine(ctx, user.id, parse(appointmentsApi.createMyAppointmentBody, req.body)));
  });

  app.get("/me/appointments", async (req) => booking.listMine(ctx, requireUser(req).id));

  app.get<{ Params: { appointmentId: string } }>("/me/appointments/:appointmentId", async (req) => booking.getMine2(ctx, requireUser(req).id, req.params.appointmentId));

  app.post<{ Params: { appointmentId: string } }>("/me/appointments/:appointmentId/cancel", async (req) => booking.cancelMine(ctx, requireUser(req).id, req.params.appointmentId));

  app.post<{ Params: { appointmentId: string } }>("/me/appointments/:appointmentId/reschedule", async (req) =>
    booking.rescheduleMine(ctx, requireUser(req).id, req.params.appointmentId, parse(appointmentsApi.rescheduleMyAppointmentBody, req.body)),
  );
}
