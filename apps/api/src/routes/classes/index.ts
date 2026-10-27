/**
 * Classes and memberships (Café & Retail: booking.classes, memberships.recurring): the class schedule with
 * capacity and a waitlist, packs, intro offers and drop-ins, recurring memberships, late-cancel fees and door check-in.
 * Contract: @ll/shared classesApi. Docs: docs/engineering/api/classes.md.
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { merchants } from "@ll/db";
import { classesApi, type FeatureKey } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, requireUser, type StaffRole } from "../../lib/auth.js";
import { notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { requirePermission } from "../../services/commerceShared.js";
import { requireFeature } from "../../services/features.js";
import * as svc from "../../services/classes.js";
import * as mem from "../../services/class-memberships.js";

type MerchantParams = { merchantId: string };
type IdParams = MerchantParams & { id: string };

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  async function staffFor(req: FastifyRequest, minRole: StaffRole = "staff", feature: FeatureKey = "booking.classes") {
    const { merchantId } = req.params as MerchantParams;
    const staff = await requireStaff(ctx, req, merchantId, minRole);
    await requireFeature(ctx.db, staff.merchant, feature);
    await requirePermission(ctx, staff, "bookings.manage");
    return staff;
  }
  /** Class endpoints an Instructor login may also use (their own classes only; the service checks which). */
  const teacherFor = (req: FastifyRequest) => staffFor(req, "instructor");
  const base = "/merchants/:merchantId/classes";

  // ---------------------------------------------------------------- settings and class types
  app.get<{ Params: MerchantParams }>(`${base}/settings`, async (req) => svc.getSettings(ctx.db, (await staffFor(req)).merchant.id));
  app.put<{ Params: MerchantParams }>(`${base}/settings`, async (req) => svc.putSettings(ctx, (await staffFor(req, "manager")).merchant.id, parse(classesApi.classSettingsBody, req.body)));

  app.get<{ Params: MerchantParams }>(`${base}/types`, async (req) => svc.listTypes(ctx.db, (await staffFor(req)).merchant.id));
  app.post<{ Params: MerchantParams }>(`${base}/types`, async (req, reply) => reply.status(201).send(await svc.createType(ctx, (await staffFor(req, "manager")).merchant.id, parse(classesApi.createClassTypeBody, req.body))));
  app.patch<{ Params: IdParams }>(`${base}/types/:id`, async (req) => svc.updateType(ctx, (await staffFor(req, "manager")).merchant.id, req.params.id, parse(classesApi.updateClassTypeBody, req.body)));

  // ---------------------------------------------------------------- schedule
  app.get<{ Params: MerchantParams }>(`${base}/sessions`, async (req) => {
    const staff = await teacherFor(req);
    return svc.listSessions(ctx, staff.merchant, parse(classesApi.listSessionsQuery, req.query), undefined, staff.role === "instructor" ? staff.user.id : undefined);
  });
  app.post<{ Params: MerchantParams }>(`${base}/sessions`, async (req, reply) => {
    const staff = await staffFor(req, "manager");
    return reply.status(201).send(await svc.createSessions(ctx, staff.merchant, parse(classesApi.createSessionBody, req.body)));
  });
  app.patch<{ Params: IdParams }>(`${base}/sessions/:id`, async (req) => svc.updateSession(ctx, (await staffFor(req, "manager")).merchant, req.params.id, parse(classesApi.updateSessionBody, req.body)));
  app.post<{ Params: IdParams }>(`${base}/sessions/:id/cancel`, async (req) => svc.cancelSession(ctx, (await staffFor(req, "manager")).merchant, req.params.id, parse(classesApi.cancelSessionBody, req.body ?? {}).reason));
  app.get<{ Params: IdParams }>(`${base}/sessions/:id/roster`, async (req) => {
    const staff = await teacherFor(req);
    await svc.requireOwnSession(ctx, staff, req.params.id);
    return svc.roster(ctx, staff.merchant, req.params.id);
  });
  app.post<{ Params: IdParams }>(`${base}/sessions/:id/bookings`, async (req, reply) => reply.status(201).send(await svc.staffBook(ctx, await staffFor(req), req.params.id, parse(classesApi.staffBookBody, req.body))));

  // ---------------------------------------------------------------- bookings and the door
  app.post<{ Params: IdParams }>(`${base}/bookings/:id/check-in`, async (req) => svc.checkInRow(ctx, await teacherFor(req), req.params.id));
  app.post<{ Params: IdParams }>(`${base}/bookings/:id/mark`, async (req) => svc.markBooking(ctx, (await staffFor(req)).merchant, req.params.id, parse(classesApi.markBookingBody, req.body).status));
  app.post<{ Params: IdParams }>(`${base}/bookings/:id/cancel`, async (req) => svc.staffCancel(ctx, (await staffFor(req)).merchant, req.params.id, parse(classesApi.staffCancelBookingBody, req.body ?? {})));
  app.post<{ Params: IdParams }>(`${base}/bookings/:id/book-in`, async (req) => svc.bookInNow(ctx, (await staffFor(req)).merchant, req.params.id, parse(classesApi.bookInBody, req.body ?? {})));
  app.post<{ Params: IdParams }>(`${base}/bookings/:id/move`, async (req) => svc.moveWaitlist(ctx, (await staffFor(req)).merchant, req.params.id, parse(classesApi.moveWaitlistBody, req.body).position));
  app.post<{ Params: MerchantParams }>(`${base}/check-in`, async (req) => {
    const staff = await teacherFor(req);
    const body = parse(classesApi.checkInBody, req.body);
    const header = req.headers["idempotency-key"];
    return svc.checkIn(ctx, staff, { ...body, idempotencyKey: body.idempotencyKey ?? (typeof header === "string" ? header : undefined) });
  });
  app.get<{ Params: MerchantParams }>(`${base}/door`, async (req) => {
    const staff = await teacherFor(req);
    return svc.door(ctx, staff, (req.query as { sessionId?: string }).sessionId);
  });

  // ---------------------------------------------------------------- offers, members, sales
  app.get<{ Params: MerchantParams }>(`${base}/products`, async (req) => mem.listProducts(ctx, (await staffFor(req)).merchant.id));
  app.post<{ Params: MerchantParams }>(`${base}/products`, async (req, reply) => reply.status(201).send(await mem.createProduct(ctx, (await staffFor(req, "manager")).merchant.id, parse(classesApi.createProductBody, req.body))));
  app.patch<{ Params: IdParams }>(`${base}/products/:id`, async (req) => mem.updateProduct(ctx, (await staffFor(req, "manager")).merchant.id, req.params.id, parse(classesApi.updateProductBody, req.body)));
  app.post<{ Params: MerchantParams }>(`${base}/sales`, async (req, reply) => reply.status(201).send(await mem.recordSale(ctx, await staffFor(req), parse(classesApi.recordSaleBody, req.body))));
  app.get<{ Params: MerchantParams }>(`${base}/summary`, async (req) => mem.summary(ctx, (await staffFor(req)).merchant));
  app.get<{ Params: MerchantParams }>(`${base}/members`, async (req) => mem.listMembers(ctx, (await staffFor(req, "manager", "memberships.recurring")).merchant, parse(classesApi.listMembersQuery, req.query)));
  app.post<{ Params: IdParams }>(`${base}/memberships/:id/cancel`, async (req) => mem.studioCancel(ctx, (await staffFor(req, "manager", "memberships.recurring")).merchant, req.params.id, parse(classesApi.studioCancelBody, req.body ?? {})));
  app.post<{ Params: IdParams }>(`${base}/memberships/:id/freeze`, async (req) => mem.studioFreeze(ctx, (await staffFor(req, "manager", "memberships.recurring")).merchant, req.params.id, parse(classesApi.studioFreezeBody, req.body)));

  // ---------------------------------------------------------------- public studio page
  app.get<{ Params: { slug: string } }>("/public/shops/:slug/classes", async (req, reply) => {
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.slug, req.params.slug)).limit(1);
    if (!m || m.status === "closed") throw notFound("Studio");
    // Spots left change by the minute and a signed-in viewer gets their own booking state: never cached (a cached anonymous copy would hide it after sign-in).
    reply.header("cache-control", "no-store");
    return svc.publicClasses(ctx, m, parse(classesApi.publicClassesQuery, req.query), req.authUser?.id);
  });

  // ---------------------------------------------------------------- customer
  app.get("/me/classes", async (req) => mem.myClasses(ctx, requireUser(req).id, (req.query as { merchantId?: string }).merchantId));
  app.post("/me/classes/bookings", async (req, reply) => reply.status(201).send(await svc.bookMine(ctx, requireUser(req).id, parse(classesApi.bookClassBody, req.body))));
  app.post<{ Params: { id: string } }>("/me/classes/bookings/:id/cancel", async (req) => svc.cancelMine(ctx, requireUser(req).id, req.params.id));
  app.post("/me/classes/purchases", async (req, reply) => reply.status(201).send(await mem.purchasePack(ctx, requireUser(req).id, parse(classesApi.purchaseBody, req.body).productId)));
  app.get<{ Params: { id: string } }>("/me/classes/products/:id/agreement", async (req) => mem.agreementFor(ctx, requireUser(req).id, req.params.id, (req.query as { startDate?: string }).startDate));
  app.post("/me/classes/memberships", async (req, reply) => reply.status(201).send(await mem.joinMembership(ctx, requireUser(req).id, parse(classesApi.joinMembershipBody, req.body))));
  app.post<{ Params: { id: string } }>("/me/classes/memberships/:id/freeze", async (req) => mem.freezeMine(ctx, requireUser(req).id, req.params.id, parse(classesApi.freezeBody, req.body)));
  app.post<{ Params: { id: string } }>("/me/classes/memberships/:id/cancel", async (req) => mem.cancelMine(ctx, requireUser(req).id, req.params.id, parse(classesApi.cancelMembershipBody, req.body ?? {})));
  app.post<{ Params: { id: string } }>("/me/classes/memberships/:id/keep", async (req) => mem.keepMine(ctx, requireUser(req).id, req.params.id));
  app.post<{ Params: { id: string } }>("/me/classes/memberships/:id/decline-renewal", async (req) => mem.declineRenewalMine(ctx, requireUser(req).id, req.params.id, true));
  app.post<{ Params: { id: string } }>("/me/classes/memberships/:id/pay", async (req) => mem.payMine(ctx, requireUser(req).id, req.params.id));
  app.post<{ Params: { id: string } }>("/me/classes/passes/:id/pay", async (req) => mem.payPassMine(ctx, requireUser(req).id, req.params.id));
  app.post<{ Params: { id: string } }>("/me/classes/passes/:id/cancel", async (req) => mem.cancelPassMine(ctx, requireUser(req).id, req.params.id));
  app.post<{ Params: { id: string } }>("/me/classes/memberships/:id/card", async (req) => mem.cardSetupMine(ctx, requireUser(req).id, req.params.id));
}
