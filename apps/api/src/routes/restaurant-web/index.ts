/**
 * Customer web pages for restaurants (desi1): shop page summary, pre-order availability and the
 * shop-level halal certification (owner only). Contract: @ll/shared restaurantWebApi.
 * The public menu itself stays in routes/public and the order in routes/commerce.
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { merchants } from "@ll/db";
import { restaurantApi, restaurantWebApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { requireFeature } from "../../services/features.js";
import { getCancelRule, setCancelRule } from "../../services/cancelRule.js";
import * as halal from "../../services/halal.js";
import { availability } from "../../services/preorderPlanning.js";
import * as pub from "../../services/restaurantPublic.js";
import { rejectMalformedIds } from "../merchant/params.js";

type MerchantParams = { merchantId: string };

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);

    async function shopBySlug(slug: string) {
      const [m] = await ctx.db.select().from(merchants).where(eq(merchants.slug, slug)).limit(1);
      if (!m || m.status === "closed") throw notFound("Shop");
      return m;
    }

    // ---------------------------------------------------------------- public
    app.get<{ Params: { slug: string } }>("/public/shops/:slug/restaurant", async (req) => {
      const m = await shopBySlug(req.params.slug);
      if (!m.restaurantTier) throw notFound("Shop");
      return pub.publicRestaurant(ctx, m);
    });

    app.get<{ Params: { slug: string } }>("/public/shops/:slug/preorders/availability", async (req) => {
      const m = await shopBySlug(req.params.slug);
      await requireFeature(ctx.db, m, "orders.order_ahead");
      return availability(ctx, m, parse(restaurantApi.preorderAvailabilityQuery, req.query));
    });

    // ---------------------------------------------------------------- pre-order cancel rule
    app.get<{ Params: MerchantParams }>("/merchants/:merchantId/preorders/cancel-rule", async (req) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
      return getCancelRule(ctx, s.merchant);
    });

    app.put<{ Params: MerchantParams }>("/merchants/:merchantId/preorders/cancel-rule", async (req) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
      return setCancelRule(ctx, s.merchant, s.user.id, parse(restaurantWebApi.cancelRuleBody, req.body));
    });

    // ---------------------------------------------------------------- halal certification (owner only)
    app.get<{ Params: MerchantParams }>("/merchants/:merchantId/menu/halal-certification", async (req) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
      return halal.getHalalCertification(ctx, s.merchant);
    });

    app.put<{ Params: MerchantParams }>("/merchants/:merchantId/menu/halal-certification", async (req) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
      return halal.setHalalCertification(ctx, s.merchant, s.user.id, parse(restaurantWebApi.halalCertificationBody, req.body));
    });

    app.delete<{ Params: MerchantParams }>("/merchants/:merchantId/menu/halal-certification", async (req) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
      return halal.clearHalalCertification(ctx, s.merchant, s.user.id);
    });
  });
}
