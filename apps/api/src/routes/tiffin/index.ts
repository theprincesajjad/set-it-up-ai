/**
 * Tiffin (meal subscriptions): merchant, customer and public sides.
 * Contract: @ll/shared tiffinApi. Logic: services/tiffin.ts.
 * Merchant routes need restaurant.tiffin; public browsing needs the shop to have it.
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { merchants } from "@ll/db";
import { tiffinApi, uuidSchema } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, requireUser, type StaffRole } from "../../lib/auth.js";
import { notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { requireFeature } from "../../services/features.js";
import * as svc from "../../services/tiffin.js";
import { z } from "zod";

type M = { merchantId: string };
const dateParam = z.iso.date();

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  async function staffFor(req: FastifyRequest, minRole: StaffRole) {
    const { merchantId } = req.params as M;
    parse(uuidSchema, merchantId);
    const staff = await requireStaff(ctx, req, merchantId, minRole);
    await requireFeature(ctx.db, staff.merchant, "restaurant.tiffin");
    return staff;
  }
  const uid = (v: string) => parse(uuidSchema, v);
  const base = "/merchants/:merchantId/tiffin";

  // ------------------------------------------------------------ merchant: plans
  app.get<{ Params: M }>(`${base}/plans`, async (req) => svc.listPlans(ctx.db, (await staffFor(req, "staff")).merchant.id));
  app.post<{ Params: M }>(`${base}/plans`, async (req, reply) => {
    const staff = await staffFor(req, "manager");
    return reply.status(201).send(await svc.createPlan(ctx.db, staff.merchant.id, parse(tiffinApi.createPlanBody, req.body)));
  });
  app.patch<{ Params: M & { planId: string } }>(`${base}/plans/:planId`, async (req) => {
    const staff = await staffFor(req, "manager");
    return svc.updatePlan(ctx.db, staff.merchant.id, uid(req.params.planId), parse(tiffinApi.updatePlanBody, req.body));
  });
  app.delete<{ Params: M & { planId: string } }>(`${base}/plans/:planId`, async (req) => {
    const staff = await staffFor(req, "manager");
    return svc.deletePlan(ctx.db, staff.merchant.id, uid(req.params.planId));
  });

  // ------------------------------------------------------------ merchant: menus
  app.get<{ Params: M }>(`${base}/menus`, async (req) => {
    const staff = await staffFor(req, "staff");
    return svc.listMenus(ctx.db, staff.merchant.id, parse(tiffinApi.listMenusQuery, req.query));
  });
  app.put<{ Params: M }>(`${base}/menus`, async (req) => {
    const staff = await staffFor(req, "manager");
    return svc.putMenus(ctx.db, staff.merchant.id, parse(tiffinApi.putMenusBody, req.body));
  });
  app.delete<{ Params: M & { menuId: string } }>(`${base}/menus/:menuId`, async (req) => {
    const staff = await staffFor(req, "manager");
    return svc.deleteMenu(ctx.db, staff.merchant.id, uid(req.params.menuId));
  });

  // ------------------------------------------------------------ merchant: routes
  app.get<{ Params: M }>(`${base}/routes`, async (req) => svc.listRoutes(ctx.db, (await staffFor(req, "staff")).merchant.id));
  app.post<{ Params: M }>(`${base}/routes`, async (req, reply) => {
    const staff = await staffFor(req, "manager");
    return reply.status(201).send(await svc.createRoute(ctx.db, staff.merchant.id, parse(tiffinApi.createRouteBody, req.body)));
  });
  app.post<{ Params: M }>(`${base}/routes/auto-assign`, async (req) => {
    const staff = await staffFor(req, "manager");
    return svc.autoAssignRoutes(ctx.db, staff.merchant.id, parse(tiffinApi.assignRoutesBody, req.body ?? {}));
  });
  app.patch<{ Params: M & { routeId: string } }>(`${base}/routes/:routeId`, async (req) => {
    const staff = await staffFor(req, "manager");
    return svc.updateRoute(ctx.db, staff.merchant.id, uid(req.params.routeId), parse(tiffinApi.updateRouteBody, req.body));
  });
  app.delete<{ Params: M & { routeId: string } }>(`${base}/routes/:routeId`, async (req) => {
    const staff = await staffFor(req, "manager");
    return svc.deleteRoute(ctx.db, staff.merchant.id, uid(req.params.routeId));
  });
  app.put<{ Params: M & { routeId: string } }>(`${base}/routes/:routeId/stops`, async (req) => {
    const staff = await staffFor(req, "manager");
    return svc.reorderStops(ctx.db, staff.merchant.id, uid(req.params.routeId), parse(tiffinApi.reorderStopsBody, req.body));
  });

  // ------------------------------------------------------------ merchant: subscribers
  app.get<{ Params: M }>(`${base}/subscribers`, async (req) => {
    const staff = await staffFor(req, "staff");
    return svc.listSubscribers(ctx.db, staff.merchant.id, parse(tiffinApi.listSubscribersQuery, req.query));
  });
  app.get<{ Params: M & { subId: string } }>(`${base}/subscribers/:subId`, async (req) => {
    const staff = await staffFor(req, "staff");
    return svc.getSubscriber(ctx.db, staff.merchant.id, uid(req.params.subId));
  });
  app.get<{ Params: M & { subId: string } }>(`${base}/subscribers/:subId/charges`, async (req) => {
    const staff = await staffFor(req, "staff");
    return svc.listSubscriberCharges(ctx.db, staff.merchant.id, uid(req.params.subId));
  });
  app.patch<{ Params: M & { subId: string } }>(`${base}/subscribers/:subId`, async (req) => {
    const staff = await staffFor(req, "manager");
    return svc.updateSubscriber(ctx.db, staff.merchant.id, uid(req.params.subId), parse(tiffinApi.updateSubscriberBody, req.body));
  });
  app.post<{ Params: M & { subId: string } }>(`${base}/subscribers/:subId/pause`, async (req) => {
    const staff = await staffFor(req, "manager");
    return svc.merchantPause(ctx, staff.merchant.id, uid(req.params.subId), parse(tiffinApi.pauseBody, req.body));
  });
  app.post<{ Params: M & { subId: string } }>(`${base}/subscribers/:subId/resume`, async (req) => {
    const staff = await staffFor(req, "manager");
    return svc.merchantResume(ctx, staff.merchant.id, uid(req.params.subId));
  });
  app.post<{ Params: M & { subId: string } }>(`${base}/subscribers/:subId/cancel`, async (req) => {
    const staff = await staffFor(req, "manager");
    return svc.merchantCancel(ctx, staff.merchant.id, uid(req.params.subId), parse(tiffinApi.cancelBody, req.body ?? {}));
  });
  app.post<{ Params: M & { subId: string } }>(`${base}/subscribers/:subId/skips`, async (req) => {
    const staff = await staffFor(req, "staff");
    return svc.merchantSkip(ctx, staff.merchant.id, uid(req.params.subId), parse(tiffinApi.skipBody, req.body));
  });

  // ------------------------------------------------------------ merchant: kitchen, manifest, revenue
  app.get<{ Params: M }>(`${base}/kitchen`, async (req) => {
    const staff = await staffFor(req, "staff");
    const q = parse(tiffinApi.kitchenQuery, req.query);
    return svc.kitchen(ctx, staff.merchant.id, q.date ?? svc.todayOf(ctx));
  });
  app.get<{ Params: M }>(`${base}/manifest`, async (req) => {
    const staff = await staffFor(req, "staff");
    const q = parse(tiffinApi.manifestQuery, req.query);
    return svc.manifest(ctx, staff.merchant.id, q.date ?? svc.todayOf(ctx), q.routeId);
  });
  app.post<{ Params: M }>(`${base}/deliveries/status`, async (req) => {
    const staff = await staffFor(req, "staff");
    return svc.setDeliveryStatus(ctx, staff.merchant.id, parse(tiffinApi.setDeliveryStatusBody, req.body));
  });
  app.get<{ Params: M }>(`${base}/revenue`, async (req) => {
    const staff = await staffFor(req, "manager");
    return svc.revenue(ctx, staff.merchant.id, parse(tiffinApi.revenueQuery, req.query).month);
  });

  // ------------------------------------------------------------ public
  app.get<{ Params: { slug: string } }>("/public/shops/:slug/tiffin/plans", async (req) => {
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.slug, req.params.slug)).limit(1);
    if (!m || m.status === "closed") throw notFound("Shop");
    return svc.publicPlans(ctx, m, parse(tiffinApi.publicPlansQuery, req.query));
  });

  // ------------------------------------------------------------ customer
  type S = { subId: string };
  app.post("/me/tiffin/subscriptions", async (req, reply) => {
    const user = requireUser(req);
    return reply.status(201).send(await svc.subscribe(ctx, user.id, parse(tiffinApi.subscribeBody, req.body)));
  });
  app.get("/me/tiffin/subscriptions", async (req) => svc.mySubscriptions(ctx, requireUser(req).id, parse(tiffinApi.mySubscriptionsQuery, req.query)));
  app.get("/me/tiffin/upcoming", async (req) => svc.myUpcoming(ctx, requireUser(req).id, parse(tiffinApi.upcomingQuery, req.query)));
  app.get<{ Params: S }>("/me/tiffin/subscriptions/:subId", async (req) => svc.mySubscription(ctx, requireUser(req).id, uid(req.params.subId)));
  app.patch<{ Params: S }>("/me/tiffin/subscriptions/:subId", async (req) => svc.myUpdate(ctx, requireUser(req).id, uid(req.params.subId), parse(tiffinApi.updateMySubscriptionBody, req.body)));
  app.post<{ Params: S }>("/me/tiffin/subscriptions/:subId/skips", async (req) => svc.mySkip(ctx, requireUser(req).id, uid(req.params.subId), parse(tiffinApi.skipBody, req.body)));
  app.delete<{ Params: S & { date: string } }>("/me/tiffin/subscriptions/:subId/skips/:date", async (req) =>
    svc.myUnskip(ctx, requireUser(req).id, uid(req.params.subId), parse(dateParam, req.params.date)),
  );
  /** Change the card on file: returns a SetupIntent client secret (web confirms it; the app opens /pay/setup/<id>?cs=). */
  app.post<{ Params: S }>("/me/tiffin/subscriptions/:subId/payment-method", async (req) => svc.myPaymentMethodSetup(ctx, requireUser(req).id, uid(req.params.subId)));
  app.post<{ Params: S }>("/me/tiffin/subscriptions/:subId/pause", async (req) => svc.myPause(ctx, requireUser(req).id, uid(req.params.subId), parse(tiffinApi.pauseBody, req.body)));
  app.post<{ Params: S }>("/me/tiffin/subscriptions/:subId/resume", async (req) => svc.myResume(ctx, requireUser(req).id, uid(req.params.subId)));
  app.post<{ Params: S }>("/me/tiffin/subscriptions/:subId/cancel", async (req) => svc.myCancel(ctx, requireUser(req).id, uid(req.params.subId), parse(tiffinApi.cancelBody, req.body ?? {})));
  app.post<{ Params: S }>("/me/tiffin/subscriptions/:subId/retry-payment", async (req) => svc.retryPayment(ctx, requireUser(req).id, uid(req.params.subId)));
}
