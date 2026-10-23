/**
 * Restaurant desk (desi2): Home and busy mode, balance reminders, the pre-order wait list (public join), the
 * "usual" order of a customer and the phone-number lookup behind "Take a phone order". Contract: @ll/shared restaurantApi.
 * Kitchen, splits and pre-order settings stay in routes/kitchen; the chat inbox in routes/whatsapp.
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { merchantMembers, merchants, users } from "@ll/db";
import { restaurantApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, type StaffRole } from "../../lib/auth.js";
import { notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { normalizePhone } from "../../services/channel-orders.js";
import { requirePermission } from "../../services/commerceShared.js";
import { requireFeature } from "../../services/features.js";
import { busyState, setBusy } from "../../services/busyMode.js";
import { joinWaitlist, listWaitlist, remindBalance } from "../../services/preorderWaitlist.js";
import { requireAnyRestaurantFeature, restaurantBadges, restaurantHome } from "../../services/restaurantHome.js";
import { memberByPhone, usualFor } from "../../services/usual.js";
import { rejectMalformedIds } from "../merchant/params.js";

type MerchantParams = { merchantId: string };

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);

    async function staffFor(req: FastifyRequest, minRole: StaffRole) {
      const { merchantId } = req.params as MerchantParams;
      return requireStaff(ctx, req, merchantId, minRole);
    }

    // ---------------------------------------------------------------- Home and busy mode
    app.get<{ Params: MerchantParams }>("/merchants/:merchantId/restaurant/home", async (req) => {
      const staff = await staffFor(req, "manager");
      return restaurantHome(ctx, staff.merchant);
    });

    app.get<{ Params: MerchantParams }>("/merchants/:merchantId/restaurant/badges", async (req) => {
      const staff = await staffFor(req, "manager");
      await requireAnyRestaurantFeature(ctx, staff.merchant);
      return restaurantBadges(ctx, staff.merchant);
    });

    app.get<{ Params: MerchantParams }>("/merchants/:merchantId/restaurant/busy", async (req) => {
      const staff = await staffFor(req, "staff");
      await requireAnyRestaurantFeature(ctx, staff.merchant);
      return busyState(ctx, staff.merchant);
    });

    app.put<{ Params: MerchantParams }>("/merchants/:merchantId/restaurant/busy", async (req) => {
      const staff = await staffFor(req, "manager");
      await requireAnyRestaurantFeature(ctx, staff.merchant);
      return setBusy(ctx, staff, parse(restaurantApi.busyBody, req.body));
    });

    // ---------------------------------------------------------------- balance reminders
    app.post<{ Params: MerchantParams & { orderId: string } }>("/merchants/:merchantId/orders/:orderId/remind-balance", async (req) => {
      const staff = await staffFor(req, "staff");
      await requireFeature(ctx.db, staff.merchant, "restaurant.degh_preorders");
      await requirePermission(ctx, staff, "orders.manage");
      return remindBalance(ctx, staff, req.params.orderId);
    });

    app.get<{ Params: MerchantParams; Querystring: { from?: string; to?: string } }>("/merchants/:merchantId/preorders/waitlist", async (req) => {
      const staff = await staffFor(req, "staff");
      const q = parse(restaurantApi.preordersQuery, req.query);
      const from = q.from ?? ctx.now().toISOString().slice(0, 10);
      const to = q.to ?? new Date(Date.parse(`${from}T12:00:00Z`) + 60 * 86_400_000).toISOString().slice(0, 10);
      return { items: await listWaitlist(ctx, staff.merchant, from, to) };
    });

    // ---------------------------------------------------------------- public wait list (no login)
    app.post<{ Params: { slug: string } }>("/public/shops/:slug/preorders/waitlist", async (req, reply) => {
      const [m] = await ctx.db.select().from(merchants).where(eq(merchants.slug, req.params.slug)).limit(1);
      if (!m || m.status === "closed") throw notFound("Shop");
      const out = await joinWaitlist(ctx, m, parse(restaurantApi.waitlistBody, req.body));
      return reply.status(out.alreadyWaiting ? 200 : 201).send(out);
    });

    // ---------------------------------------------------------------- the usual, and who is calling
    app.get<{ Params: MerchantParams & { memberId: string } }>("/merchants/:merchantId/customers/:memberId/usual", async (req): Promise<restaurantApi.UsualResponse> => {
      const staff = await staffFor(req, "staff");
      await requireAnyRestaurantFeature(ctx, staff.merchant);
      const rows = await ctx.db.select().from(merchantMembers).where(eq(merchantMembers.id, req.params.memberId)).limit(1);
      const member = rows[0];
      if (!member || member.merchantId !== staff.merchant.id) throw notFound("Customer");
      const [u] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, member.userId)).limit(1);
      const usual = await usualFor(ctx.db, staff.merchant.id, member.userId, ctx.now());
      return { memberId: member.id, name: u?.name ?? null, items: usual?.items ?? [], text: usual?.text ?? "", orders: usual?.orders ?? 0 };
    });

    app.get<{ Params: MerchantParams; Querystring: { phone?: string } }>("/merchants/:merchantId/phone/lookup", async (req): Promise<restaurantApi.PhoneLookupResponse> => {
      const staff = await staffFor(req, "staff");
      await requireAnyRestaurantFeature(ctx, staff.merchant);
      const raw = (req.query.phone ?? "").trim();
      if (raw.replace(/\D/g, "").length < 7) return { phone: raw, member: null, usual: null };
      const phone = normalizePhone(raw);
      const m = await memberByPhone(ctx.db, staff.merchant.id, phone);
      if (!m) return { phone, member: null, usual: null };
      return { phone, member: { id: m.memberId, userId: m.userId, name: m.name, visits: m.visits }, usual: await usualFor(ctx.db, staff.merchant.id, m.userId, ctx.now()) };
    });
  });
}
