import type { FastifyInstance, FastifyRequest } from "fastify";
import { reportsApi, type FeatureKey } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import { requireFeature } from "../../services/features.js";
import * as svc from "../../services/reports.js";
import { rejectMalformedIds } from "../merchant/params.js";

type Req = FastifyRequest<{ Params: { merchantId: string } }>;

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);
    await routes(app, ctx);
  });
}

async function routes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  /**
   * Reports are for managers and owners. reports.basic (loyalty reporting) is free forever;
   * retention and network overlap are Plus (reports.advanced); promo results need promos.basic.
   */
  const auth = async (req: Req, feature: FeatureKey = "reports.basic") => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await requireFeature(ctx.db, s.merchant, feature);
    return s.merchant;
  };

  app.get("/merchants/:merchantId/reports/overview", async (req: Req) => svc.overview(ctx, await auth(req), parse(reportsApi.rangeQuery, req.query)));
  app.get("/merchants/:merchantId/reports/daily", async (req: Req) => svc.daily(ctx, await auth(req), parse(reportsApi.rangeQuery, req.query)));
  app.get("/merchants/:merchantId/reports/top-customers", async (req: Req) => svc.topCustomers(ctx, await auth(req), parse(reportsApi.topCustomersQuery, req.query)));
  app.get("/merchants/:merchantId/reports/rewards", async (req: Req) => svc.rewardPerformance(ctx, await auth(req), parse(reportsApi.rangeQuery, req.query)));
  app.get("/merchants/:merchantId/reports/promos", async (req: Req) => svc.promoResults(ctx, await auth(req, "promos.basic")));
  app.get("/merchants/:merchantId/reports/network-overlap", async (req: Req) => svc.networkOverlap(ctx, await auth(req, "reports.advanced")));
  app.get("/merchants/:merchantId/reports/activation", async (req: Req) => svc.activation(ctx, await auth(req)));
  app.get("/merchants/:merchantId/reports/retention", async (req: Req) => {
    const m = await auth(req, "reports.advanced");
    return svc.retention(ctx, m, parse(reportsApi.retentionQuery, req.query).months);
  });
}
