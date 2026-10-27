/**
 * Barbershops, threading bars and beauty supply: the walk-in line (features `booking.walkin_queue`), payouts and chair rental
 * (`staff.payouts`), "my barber" and family members. Contract: @ll/shared barberApi. Docs: docs/engineering/api/barber.md.
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { merchants } from "@ll/db";
import { barberApi, type FeatureKey } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, requireUser, type StaffRole } from "../../lib/auth.js";
import { notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { requirePermission } from "../../services/commerceShared.js";
import { requireFeature } from "../../services/features.js";
import * as svc from "../../services/barber.js";

type MerchantParams = { merchantId: string };
type EntryParams = MerchantParams & { entryId: string };
type StaffParams = MerchantParams & { userId: string };

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  async function staffFor(req: FastifyRequest, minRole: StaffRole, feature: FeatureKey, perm: "bookings.manage" | null) {
    const { merchantId } = req.params as MerchantParams;
    const staff = await requireStaff(ctx, req, merchantId, minRole);
    await requireFeature(ctx.db, staff.merchant, feature);
    if (perm) await requirePermission(ctx, staff, perm);
    return staff;
  }
  const queueStaff = (req: FastifyRequest, minRole: StaffRole = "staff") => staffFor(req, minRole, "booking.walkin_queue", "bookings.manage");

  // ---------------------------------------------------------------- the line (staff)
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/queue", async (req) => svc.board(ctx, await queueStaff(req)));

  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/queue/settings", async (req) => svc.getSettings(ctx, (await staffFor(req, "staff", "booking.walkin_queue", null)).merchant.id));
  app.put<{ Params: MerchantParams }>("/merchants/:merchantId/queue/settings", async (req) => {
    const staff = await staffFor(req, "staff", "booking.walkin_queue", "bookings.manage");
    return svc.saveSettings(ctx, staff.merchant.id, parse(barberApi.queueSettingsBody, req.body));
  });

  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/queue", async (req, reply) => {
    const staff = await queueStaff(req);
    return reply.status(201).send(await svc.addByStaff(ctx, staff, parse(barberApi.staffAddBody, req.body)));
  });
  app.post<{ Params: EntryParams }>("/merchants/:merchantId/queue/:entryId/call", async (req) => svc.call(ctx, await queueStaff(req), req.params.entryId, parse(barberApi.callBody, req.body)));
  app.post<{ Params: EntryParams }>("/merchants/:merchantId/queue/:entryId/start", async (req) => svc.start(ctx, await queueStaff(req), req.params.entryId));
  app.post<{ Params: EntryParams }>("/merchants/:merchantId/queue/:entryId/skip", async (req) => svc.skip(ctx, await queueStaff(req), req.params.entryId));
  app.post<{ Params: EntryParams }>("/merchants/:merchantId/queue/:entryId/done", async (req) => svc.done(ctx, await queueStaff(req), req.params.entryId));
  app.post<{ Params: EntryParams }>("/merchants/:merchantId/queue/:entryId/remove", async (req) => svc.remove(ctx, await queueStaff(req), req.params.entryId, "left"));

  // ---------------------------------------------------------------- how people are paid and the payouts report
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/staff-pay", async (req) => svc.listStaffPay(ctx, (await staffFor(req, "manager", "staff.payouts", null)).merchant.id));
  app.put<{ Params: StaffParams }>("/merchants/:merchantId/staff/:userId/pay", async (req) => {
    const staff = await staffFor(req, "manager", "staff.payouts", null);
    return svc.putStaffPay(ctx, staff.merchant.id, req.params.userId, parse(barberApi.staffPayBody, req.body));
  });
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/payouts", async (req) => {
    const staff = await staffFor(req, "staff", "staff.payouts", null);
    return svc.payouts(ctx, staff, parse(barberApi.payoutsQuery, req.query), false);
  });
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/payouts/mine", async (req) => {
    const staff = await staffFor(req, "staff", "staff.payouts", null);
    return svc.payouts(ctx, staff, parse(barberApi.payoutsQuery, req.query), true);
  });
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/payouts.csv", async (req, reply) => {
    const staff = await staffFor(req, "staff", "staff.payouts", null);
    const r = await svc.payouts(ctx, staff, parse(barberApi.payoutsQuery, req.query), false);
    reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="${staff.merchant.slug}-payouts-${r.from}-${r.to}.csv"`);
    return svc.payoutsCsv(r);
  });

  // ---------------------------------------------------------------- public: join and follow the line
  async function shop(slug: string) {
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.slug, slug)).limit(1);
    if (!m || m.status === "closed") throw notFound("Shop");
    await requireFeature(ctx.db, m, "booking.walkin_queue");
    return m;
  }
  app.get<{ Params: { slug: string } }>("/public/shops/:slug/queue", async (req, reply) => {
    reply.header("cache-control", "no-store");
    return svc.publicQueue(ctx, await shop(req.params.slug));
  });
  app.post<{ Params: { slug: string } }>("/public/shops/:slug/queue", async (req, reply) => {
    const m = await shop(req.params.slug);
    const body = parse(barberApi.joinQueueBody, req.body);
    // The tablet at the door and a phone are the same form; "staff" entries only come from the staff route.
    return reply.status(201).send(await svc.join(ctx, m, { ...body, source: body.source === "tablet" ? "tablet" : "join" }, req.authUser ?? null));
  });
  app.get<{ Params: { token: string } }>("/public/queue/:token", async (req, reply) => {
    reply.header("cache-control", "no-store");
    return svc.statusByToken(ctx, req.params.token);
  });
  app.post<{ Params: { token: string } }>("/public/queue/:token/leave", async (req) => svc.leave(ctx, req.params.token));

  // ---------------------------------------------------------------- customer: family and my barber
  app.get("/me/family", async (req) => svc.listFamily(ctx, requireUser(req).id));
  app.post("/me/family", async (req, reply) => reply.status(201).send(await svc.addFamily(ctx, requireUser(req).id, parse(barberApi.familyBody, req.body))));
  app.delete<{ Params: { id: string } }>("/me/family/:id", async (req, reply) => {
    await svc.removeFamily(ctx, requireUser(req).id, req.params.id);
    return reply.status(204).send();
  });
  app.get<{ Params: { slug: string } }>("/me/shops/:slug/barber", async (req) => {
    const user = requireUser(req);
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.slug, req.params.slug)).limit(1);
    if (!m) throw notFound("Shop");
    return svc.getMyBarber(ctx, user.id, m);
  });
  app.put<{ Params: { slug: string } }>("/me/shops/:slug/barber", async (req) => {
    const user = requireUser(req);
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.slug, req.params.slug)).limit(1);
    if (!m) throw notFound("Shop");
    return svc.setMyBarber(ctx, user.id, m, parse(barberApi.preferredBody, req.body).staffId);
  });
}
