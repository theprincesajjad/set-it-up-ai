/**
 * Festival campaigns: what is coming up for a shop, the full calendar with
 * templates, and "create a draft from this template".
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { whatsappApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import { requireFeature } from "../../services/features.js";
import * as svc from "../../services/festivals.js";
import { rejectMalformedIds } from "../merchant/params.js";

type Req<P = object> = FastifyRequest<{ Params: { merchantId: string } & P }>;

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app, ["festivalId"]);

    app.get("/merchants/:merchantId/festivals/upcoming", async (req: Req) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
      return svc.upcomingFestivals(ctx, s.merchant, parse(whatsappApi.festivalsQuery, req.query).days);
    });

    app.get("/merchants/:merchantId/festivals", async (req: Req) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
      await requireFeature(ctx.db, s.merchant, "restaurant.festival_campaigns");
      return { items: svc.listFestivalCatalog() };
    });

    app.post("/merchants/:merchantId/festivals/:festivalId/campaign-drafts", async (req: Req<{ festivalId: string }>, reply) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
      const out = await svc.createFestivalDraft(ctx, s.merchant, s.user.id, req.params.festivalId, parse(whatsappApi.festivalDraftBody, req.body));
      reply.status(201);
      return out;
    });
  });
}
