/**
 * Loyalty program config: program, rewards, VIP levels, categories, discount cards, promos. Writes need manager+.
 * Pricing v2: VIP levels, discount cards and promos are paid (Plus). Creating or editing them needs the feature;
 * reading, ending/archiving and deleting existing rows stays open so a merchant can always see and clean up data.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { merchantApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import { promoFeature, requireFeature } from "../../services/features.js";
import * as svc from "../../services/merchant-program.js";
import * as promoSvc from "../../services/promos.js"; // wave-n: promo
import { earnOptions, programHistory, programImpact } from "../../services/program-rules.js";
import { allow } from "../../lib/rate-limit.js";
import { tooMany } from "../../lib/errors.js";

type Req<P = object> = FastifyRequest<{ Params: { merchantId: string } & P }>;

export default async function registerProgram(app: FastifyInstance, ctx: AppContext): Promise<void> {
  /** wave-n: rules. Rule changes are rare: 30 writes a minute per person per shop stops a script or a stuck button. */
  const limitRuleWrites = async (merchantId: string, userId: string) => {
    if (!(await allow(ctx, `rules:${merchantId}:${userId}`, 30, 60_000))) throw tooMany("Too many changes at once. Wait a minute and try again.");
  };

  // ---- Program ----
  app.get("/merchants/:merchantId/program", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return svc.getProgram(ctx.db, s.merchant.id);
  });
  app.patch("/merchants/:merchantId/program", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const body = parse(merchantApi.updateProgramBody, req.body);
    await limitRuleWrites(s.merchant.id, s.user.id);
    if (body.earnType === "stamps") await requireFeature(ctx.db, s.merchant, "loyalty.stamps");
    if (body.earnType === "per_visit") await requireFeature(ctx.db, s.merchant, "loyalty.visits");
    return svc.updateProgram(ctx, s.merchant.id, s.user.id, body, { ip: req.ip });
  });
  // wave-n: rules. What a change would do to existing customers (the confirm sheet). Manager+, read-only.
  app.post("/merchants/:merchantId/program/impact", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return programImpact(ctx, s.merchant.id, parse(merchantApi.updateProgramBody, req.body ?? {}));
  });
  // Change history: who changed the rules and rewards, when, before and after.
  app.get("/merchants/:merchantId/program/history", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const limit = Number((req.query as { limit?: string } | undefined)?.limit ?? 50);
    return programHistory(ctx, s.merchant.id, Number.isFinite(limit) ? limit : 50);
  });
  // What the shop sells (categories, items, services), to choose what earns. Staff may read it.
  app.get("/merchants/:merchantId/program/earn-options", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return earnOptions(ctx, s.merchant.id);
  });

  // ---- Rewards ----
  app.get("/merchants/:merchantId/rewards", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return { items: await svc.listRewards(ctx.db, s.merchant.id), nextCursor: null };
  });
  app.post("/merchants/:merchantId/rewards", async (req: Req, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await limitRuleWrites(s.merchant.id, s.user.id);
    await requireFeature(ctx.db, s.merchant, "loyalty.rewards_catalog");
    reply.status(201);
    return svc.createReward(ctx, s.merchant.id, s.user.id, parse(merchantApi.createRewardBody, req.body));
  });
  app.patch("/merchants/:merchantId/rewards/:rewardId", async (req: Req<{ rewardId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await limitRuleWrites(s.merchant.id, s.user.id);
    return svc.updateReward(ctx, s.merchant.id, s.user.id, req.params.rewardId, parse(merchantApi.updateRewardBody, req.body));
  });
  app.delete("/merchants/:merchantId/rewards/:rewardId", async (req: Req<{ rewardId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await limitRuleWrites(s.merchant.id, s.user.id);
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
    await requireFeature(ctx.db, s.merchant, "loyalty.vip_levels");
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
    await requireFeature(ctx.db, s.merchant, "discount_cards");
    return svc.updateDiscountCard(ctx, s.merchant.id, s.user.id, req.params.cardId, parse(merchantApi.updateDiscountCardBody, req.body));
  });
  app.delete("/merchants/:merchantId/discount-cards/:cardId", async (req: Req<{ cardId: string }>, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await svc.deleteDiscountCard(ctx, s.merchant.id, s.user.id, req.params.cardId);
    return reply.status(204).send();
  });

  // ---- Promos ---- (wave-n: served by services/promos.ts, the promo team's service; every field is editable, live included)
  app.get("/merchants/:merchantId/promos", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    const q = parse(merchantApi.listPromosQuery, req.query);
    return { items: await promoSvc.listPromos(ctx.db, s.merchant.id, q.status), nextCursor: null };
  });
  app.get("/merchants/:merchantId/promos/:promoId", async (req: Req<{ promoId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return promoSvc.serializePromo(await promoSvc.getPromo(ctx.db, s.merchant.id, req.params.promoId));
  });
  app.post("/merchants/:merchantId/promos", async (req: Req, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const body = parse(merchantApi.createPromoBody, req.body);
    await requireFeature(ctx.db, s.merchant, promoFeature(body.kind));
    reply.status(201);
    return promoSvc.createPromo(ctx, s.merchant, s.user.id, body);
  });
  app.patch("/merchants/:merchantId/promos/:promoId", async (req: Req<{ promoId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const body = parse(merchantApi.updatePromoBody, req.body);
    const cur = await promoSvc.getPromo(ctx.db, s.merchant.id, req.params.promoId);
    await requireFeature(ctx.db, s.merchant, promoFeature(body.kind ?? cur.kind));
    return promoSvc.updatePromo(ctx, s.merchant, s.user.id, req.params.promoId, body);
  });
  app.post("/merchants/:merchantId/promos/:promoId/status", async (req: Req<{ promoId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const { status } = parse(merchantApi.promoStatusBody, req.body);
    // Ending / archiving is always allowed; scheduling or going live needs the feature.
    if (status !== "ended" && status !== "archived") {
      const cur = await promoSvc.getPromo(ctx.db, s.merchant.id, req.params.promoId);
      await requireFeature(ctx.db, s.merchant, promoFeature(cur.kind));
    }
    return promoSvc.transitionPromo(ctx, s.merchant, s.user.id, req.params.promoId, status);
  });
  app.delete("/merchants/:merchantId/promos/:promoId", async (req: Req<{ promoId: string }>, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await promoSvc.deletePromo(ctx, s.merchant, s.user.id, req.params.promoId);
    return reply.status(204).send();
  });
}
