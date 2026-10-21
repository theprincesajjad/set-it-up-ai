import type { FastifyInstance, FastifyRequest } from "fastify";
import { adminApi } from "@ll/shared";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { requirePlatformRole } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import * as svc from "../../services/admin.js";
import { rejectMalformedIds } from "../merchant/params.js";

type Req<P = object> = FastifyRequest<{ Params: P }>;

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);
    // Every route here is admin-only.
    app.addHook("preHandler", async (req) => {
      requirePlatformRole(req, "admin");
    });
    await routes(app, ctx);
  });
}

async function routes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const actor = (req: FastifyRequest) => requirePlatformRole(req, "admin").id;

  app.get("/admin/dashboard", async () => svc.networkDashboard(ctx));

  // ---- Feature rollout ----
  app.get("/admin/features", async () => ({ items: await svc.listFeatures(ctx), nextCursor: null }));
  app.put("/admin/features/:key/stage", async (req: Req<{ key: string }>) => {
    const key = svc.requireFeatureKey(req.params.key);
    const { stage, note } = parse(adminApi.setFeatureStageBody, req.body);
    return svc.setFeatureStage(ctx, actor(req), key, stage, note);
  });
  app.get("/admin/features/:key/overrides", async (req: Req<{ key: string }>) => ({ items: await svc.listOverrides(ctx, svc.requireFeatureKey(req.params.key)), nextCursor: null }));
  app.put("/admin/features/:key/overrides", async (req: Req<{ key: string }>) => {
    const key = svc.requireFeatureKey(req.params.key);
    return { items: await svc.setOverride(ctx, actor(req), key, parse(adminApi.featureOverrideBody, req.body)), nextCursor: null };
  });
  app.delete("/admin/features/:key/overrides/:merchantId", async (req: Req<{ key: string; merchantId: string }>, reply) => {
    await svc.removeOverride(ctx, actor(req), svc.requireFeatureKey(req.params.key), req.params.merchantId);
    return reply.status(204).send();
  });
  app.get("/admin/plans", async () => ({ items: await svc.planAvailability(ctx), nextCursor: null }));

  // ---- Neighbourhoods ----
  app.get("/admin/neighbourhoods", async () => ({ items: await svc.listNeighbourhoods(ctx), nextCursor: null }));
  app.post("/admin/neighbourhoods", async (req, reply) => {
    reply.status(201);
    return svc.createNeighbourhood(ctx, actor(req), parse(adminApi.createNeighbourhoodBody, req.body));
  });
  app.patch("/admin/neighbourhoods/:neighbourhoodId", async (req: Req<{ neighbourhoodId: string }>) =>
    svc.updateNeighbourhood(ctx, actor(req), req.params.neighbourhoodId, parse(adminApi.updateNeighbourhoodBody, req.body)),
  );
  app.delete("/admin/neighbourhoods/:neighbourhoodId", async (req: Req<{ neighbourhoodId: string }>, reply) => {
    await svc.deleteNeighbourhood(ctx, actor(req), req.params.neighbourhoodId);
    return reply.status(204).send();
  });

  // ---- Network perks ----
  app.get("/admin/perks", async (req) => {
    const { neighbourhoodId } = parse(z.object({ neighbourhoodId: z.uuid().optional() }), req.query);
    return { items: await svc.listPerks(ctx, neighbourhoodId), nextCursor: null };
  });
  app.post("/admin/perks", async (req, reply) => {
    reply.status(201);
    return svc.createPerk(ctx, actor(req), parse(adminApi.createPerkBody, req.body));
  });
  app.patch("/admin/perks/:perkId", async (req: Req<{ perkId: string }>) => svc.updatePerk(ctx, actor(req), req.params.perkId, parse(adminApi.updatePerkBody, req.body)));
  app.delete("/admin/perks/:perkId", async (req: Req<{ perkId: string }>) => svc.deletePerk(ctx, actor(req), req.params.perkId));

  // ---- Merchants ----
  app.get("/admin/merchants", async (req) => svc.listMerchants(ctx, parse(adminApi.listMerchantsQuery, req.query)));
  app.get("/admin/merchants/:merchantId", async (req: Req<{ merchantId: string }>) => svc.getMerchant(ctx, req.params.merchantId));
  app.post("/admin/merchants/:merchantId/status", async (req: Req<{ merchantId: string }>) => {
    const { status, reason } = parse(adminApi.setMerchantStatusBody, req.body);
    return svc.setMerchantStatus(ctx, actor(req), req.params.merchantId, status, reason);
  });

  // ---- Users ----
  app.get("/admin/users", async (req) => svc.listUsers(ctx, parse(adminApi.listUsersQuery, req.query)));
  app.put("/admin/users/:userId/role", async (req: Req<{ userId: string }>) => {
    const { platformRole } = parse(adminApi.setPlatformRoleBody, req.body);
    return svc.setPlatformRole(ctx, actor(req), req.params.userId, platformRole);
  });

  // ---- Audit log ----
  app.get("/admin/audit", async (req) => svc.listAudit(ctx, parse(adminApi.listAuditQuery, req.query)));
}
