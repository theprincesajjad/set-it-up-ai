import type { FastifyInstance, FastifyRequest } from "fastify";
import { repApi } from "@ll/shared";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { requirePlatformRole } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import { buildQrKit, loadMerchantDetail } from "../../services/merchant.js";
import * as svc from "../../services/rep.js";
import * as field from "../../services/rep-field.js";
import { rejectMalformedIds } from "../merchant/params.js";
import registerPublicLeads from "./public-leads.js";

type Req<P = object> = FastifyRequest<{ Params: P }>;
const repFilter = z.object({ repUserId: z.uuid().optional() });

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);
    await routes(app, ctx);
    await registerPublicLeads(app, ctx);
  });
}

async function routes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // ---- Leads pipeline ----
  app.get("/rep/leads", async (req) => {
    const user = requirePlatformRole(req, "rep");
    return svc.listLeads(ctx, user, parse(repApi.listLeadsQuery, req.query));
  });
  app.post("/rep/leads", async (req, reply) => {
    const user = requirePlatformRole(req, "rep");
    reply.status(201);
    return svc.createLead(ctx, user, parse(repApi.createLeadBody, req.body));
  });
  app.get("/rep/leads/:leadId", async (req: Req<{ leadId: string }>) => {
    const user = requirePlatformRole(req, "rep");
    return svc.getLead(ctx, user, req.params.leadId);
  });
  app.patch("/rep/leads/:leadId", async (req: Req<{ leadId: string }>) => {
    const user = requirePlatformRole(req, "rep");
    return svc.updateLead(ctx, user, req.params.leadId, parse(repApi.updateLeadBody, req.body));
  });
  app.post("/rep/leads/:leadId/activities", async (req: Req<{ leadId: string }>, reply) => {
    const user = requirePlatformRole(req, "rep");
    reply.status(201);
    return svc.addLeadActivity(ctx, user, req.params.leadId, parse(repApi.addLeadActivityBody, req.body));
  });

  app.post("/rep/leads/:leadId/outcome", async (req: Req<{ leadId: string }>, reply) => {
    const user = requirePlatformRole(req, "rep");
    const r = await field.recordOutcome(ctx, user, req.params.leadId, parse(repApi.leadOutcomeBody, req.body));
    reply.status(r.status === "recorded" ? 201 : 200);
    return r;
  });
  app.post("/rep/outcomes/sync", async (req) => {
    const user = requirePlatformRole(req, "rep");
    return field.syncOutcomes(ctx, user, parse(repApi.outcomeSyncBody, req.body).items);
  });

  // ---- Street day, today, proof ----
  app.get("/rep/street-day", async (req) => {
    const user = requirePlatformRole(req, "rep");
    return field.streetDay(ctx, user, parse(z.object({ neighbourhoodId: z.uuid().optional() }), req.query));
  });
  app.get("/rep/today", async (req) => field.repToday(ctx, requirePlatformRole(req, "rep")));
  app.get("/rep/proof", async (req) => {
    requirePlatformRole(req, "rep");
    return field.pitchProof(ctx, parse(z.object({ neighbourhoodId: z.uuid().optional() }), req.query));
  });

  // ---- Done-for-you merchants ----
  app.post("/rep/merchants", async (req, reply) => {
    const user = requirePlatformRole(req, "rep");
    const { merchant } = await svc.createMerchantForOwner(ctx, user, parse(repApi.repCreateMerchantBody, req.body));
    reply.status(201);
    return loadMerchantDetail(ctx, merchant.id, "owner");
  });
  app.get("/rep/merchants", async (req) => {
    const user = requirePlatformRole(req, "rep");
    const { repUserId } = parse(repFilter, req.query);
    return { items: await svc.listRepMerchants(ctx, user, repUserId), nextCursor: null };
  });
  app.get("/rep/merchants/:merchantId/qr-kit", async (req: Req<{ merchantId: string }>) => {
    const user = requirePlatformRole(req, "rep");
    await svc.assertRepMerchant(ctx, user, req.params.merchantId);
    return buildQrKit(ctx, req.params.merchantId);
  });
  app.post("/rep/merchants/:merchantId/check-ins", async (req: Req<{ merchantId: string }>, reply) => {
    const user = requirePlatformRole(req, "rep");
    reply.status(201);
    return svc.logCheckIn(ctx, user, req.params.merchantId, parse(repApi.logCheckInBody, req.body));
  });

}
