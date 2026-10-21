/** Loyalty program config: program, rewards, VIP levels, categories, discount cards, promos. Writes need manager+. */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { merchantApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import { requireFeature } from "../../services/features.js";
import * as svc from "../../services/merchant-program.js";

type Req<P = object> = FastifyRequest<{ Params: { merchantId: string } & P }>;

export default async function registerProgram(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // ---- Program ----
  app.get("/merchants/:merchantId/program", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return svc.getProgram(ctx.db, s.merchant.id);
  });
  app.patch("/merchants/:merchantId/program", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const body = parse(merchantApi.updateProgramBody, req.body);
    if (body.earnType === "stamps") await requireFeature(ctx.db, s.merchant, "loyalty.stamps");
    if (body.earnType === "per_visit") await requireFeature(ctx.db, s.merchant, "loyalty.visits");
    return svc.updateProgram(ctx, s.merchant.id, s.user.id, body);
  });

  // ---- Rewards ----
  app.get("/merchants/:merchantId/rewards", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return { items: await svc.listRewards(ctx.db, s.merchant.id), nextCursor: null };
  });
  app.post("/merchants/:merchantId/rewards", async (req: Req, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await requireFeature(ctx.db, s.merchant, "loyalty.rewards_catalog");
    reply.status(201);
    return svc.createReward(ctx, s.merchant.id, s.user.id, parse(merchantApi.createRewardBody, req.body));
  });
  app.patch("/merchants/:merchantId/rewards/:rewardId", async (req: Req<{ rewardId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return svc.updateReward(ctx, s.merchant.id, s.user.id, req.params.rewardId, parse(merchantApi.updateRewardBody, req.body));
  });
  app.delete("/merchants/:merchantId/rewards/:rewardId", async (req: Req<{ rewardId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return svc.deleteReward(ctx, s.merchant.id, s.user.id, req.params.rewardId);
  });

  // ---- VIP levels ----
  app.get("/merchants/:merchantId/vip-levels", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return { items: await svc.listVipLevels(ctx.db, s.merchant.id), nextCursor: null };
  });
  app.post("/merchants/:merchantId/vip-levels", async (req: Req, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await requireFeature(ctx.db, s.merchant, "loyalty.vip_levels");
    reply.status(201);
    return svc.createVipLevel(ctx, s.merchant.id, s.user.id, parse(merchantApi.createVipLevelBody, req.body));
  });
  app.patch("/merchants/:merchantId/vip-levels/:levelId", async (req: Req<{ levelId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return svc.updateVipLevel(ctx, s.merchant.id, s.user.id, req.params.levelId, parse(merchantApi.updateVipLevelBody, req.body));
  });
  app.delete("/merchants/:merchantId/vip-levels/:levelId", async (req: Req<{ levelId: string }>, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await svc.deleteVipLevel(ctx, s.merchant.id, s.user.id, req.params.levelId);
    return reply.status(204).send();
  });

  // ---- Categories ----
  app.get("/merchants/:merchantId/categories", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return { items: await svc.listCategories(ctx.db, s.merchant.id), nextCursor: null };
  });
  app.post("/merchants/:merchantId/categories", async (req: Req, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    reply.status(201);
    return svc.createCategory(ctx, s.merchant.id, s.user.id, parse(merchantApi.createCategoryBody, req.body));
  });
  app.patch("/merchants/:merchantId/categories/:categoryId", async (req: Req<{ categoryId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return svc.updateCategory(ctx, s.merchant.id, s.user.id, req.params.categoryId, parse(merchantApi.updateCategoryBody, req.body));
  });
  app.delete("/merchants/:merchantId/categories/:categoryId", async (req: Req<{ categoryId: string }>, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await svc.deleteCategory(ctx, s.merchant.id, s.user.id, req.params.categoryId);
    return reply.status(204).send();
  });

  // ---- Discount cards ----
  app.get("/merchants/:merchantId/discount-cards", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return { items: await svc.listDiscountCards(ctx.db, s.merchant.id), nextCursor: null };
  });
  app.post("/merchants/:merchantId/discount-cards", async (req: Req, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await requireFeature(ctx.db, s.merchant, "discount_cards");
    reply.status(201);
    return svc.createDiscountCard(ctx, s.merchant.id, s.user.id, parse(merchantApi.createDiscountCardBody, req.body));
  });
  app.patch("/merchants/:merchantId/discount-cards/:cardId", async (req: Req<{ cardId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return svc.updateDiscountCard(ctx, s.merchant.id, s.user.id, req.params.cardId, parse(merchantApi.updateDiscountCardBody, req.body));
  });
  app.delete("/merchants/:merchantId/discount-cards/:cardId", async (req: Req<{ cardId: string }>, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await svc.deleteDiscountCard(ctx, s.merchant.id, s.user.id, req.params.cardId);
    return reply.status(204).send();
  });

  // ---- Promos ----
  app.get("/merchants/:merchantId/promos", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    const q = parse(merchantApi.listPromosQuery, req.query);
    return { items: await svc.listPromos(ctx.db, s.merchant.id, q.status), nextCursor: null };
  });
  app.get("/merchants/:merchantId/promos/:promoId", async (req: Req<{ promoId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return svc.serializePromo(await svc.getPromo(ctx.db, s.merchant.id, req.params.promoId));
  });
  app.post("/merchants/:merchantId/promos", async (req: Req, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const body = parse(merchantApi.createPromoBody, req.body);
    await requireFeature(ctx.db, s.merchant, body.kind === "multiplier" || body.kind === "bonus_points" ? "promos.double_points" : "promos.basic");
    reply.status(201);
    return svc.createPromo(ctx, s.merchant.id, s.user.id, body);
  });
  app.patch("/merchants/:merchantId/promos/:promoId", async (req: Req<{ promoId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return svc.updatePromo(ctx, s.merchant.id, s.user.id, req.params.promoId, parse(merchantApi.updatePromoBody, req.body));
  });
  app.post("/merchants/:merchantId/promos/:promoId/status", async (req: Req<{ promoId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const { status } = parse(merchantApi.promoStatusBody, req.body);
    return svc.transitionPromo(ctx, s.merchant.id, s.user.id, req.params.promoId, status);
  });
  app.delete("/merchants/:merchantId/promos/:promoId", async (req: Req<{ promoId: string }>, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await svc.deletePromo(ctx, s.merchant.id, s.user.id, req.params.promoId);
    return reply.status(204).send();
  });
}
