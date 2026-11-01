/**
 * Wave N promo routes: promo lifecycle extras, results, counter redemptions, the AI writer (owners), the Deals inbox
 * (customers) and /admin/ai (platform admins: the Claude key, caps, usage). Promo CRUD stays at the original paths in
 * routes/merchant/program.ts, now served by services/promos.ts.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { promosApi } from "@ll/shared";
import { eq } from "drizzle-orm";
import { users } from "@ll/db";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { requirePlatformRole, requireStaff, requireUser } from "../../lib/auth.js";
import { forbidden, tooMany } from "../../lib/errors.js";
import { allow } from "../../lib/rate-limit.js";
import { parse } from "../../lib/validate.js";
import { adminAiSettings, deleteAiKey, setAiKey, updateAiSettings } from "../../services/ai-key.js";
import { promoFeature, requireAnyFeature, requireFeature } from "../../services/features.js";
import { generatePromo, promoAiUsage } from "../../services/promo-ai.js";
import * as svc from "../../services/promos.js";

type Req<P = object> = FastifyRequest<{ Params: { merchantId: string } & P }>;
type PromoReq = Req<{ promoId: string }>;
const PROMO_FEATURES = ["promos.basic", "promos.double_points"] as const;

/** Writes: 60 a minute per shop and person (AI has its own tighter limit). */
async function limitWrites(ctx: AppContext, key: string) {
  if (!(await allow(ctx, `promo-w:${key}`, 60, 60_000))) throw tooMany("Too many changes in a minute. Give it a moment.");
}

/**
 * The Claude key is the most sensitive setting: like the admin cockpit, the admin role is re-read from the database, so an admin who
 * was demoted (or deleted) is refused at once, not when their access token runs out.
 */
async function requireLiveAdmin(ctx: AppContext, req: FastifyRequest) {
  const a = requirePlatformRole(req, "admin");
  const [row] = await ctx.db.select({ role: users.platformRole, deletedAt: users.deletedAt }).from(users).where(eq(users.id, a.id)).limit(1);
  if (!row || row.deletedAt || row.role !== "admin") throw forbidden();
  return a;
}

export default async function registerPromos(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // ---- Owner: lifecycle extras ----
  app.post("/merchants/:merchantId/promos/:promoId/action", async (req: PromoReq) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await limitWrites(ctx, `${s.merchant.id}:${s.user.id}`);
    const { action } = parse(promosApi.promoActionBody, req.body);
    if (action === "resume") await requireFeature(ctx.db, s.merchant, promoFeature((await svc.getPromo(ctx.db, s.merchant.id, req.params.promoId)).kind));
    return svc.promoAction(ctx, s.merchant, s.user.id, req.params.promoId, action);
  });
  app.post("/merchants/:merchantId/promos/:promoId/duplicate", async (req: PromoReq, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await limitWrites(ctx, `${s.merchant.id}:${s.user.id}`);
    await requireFeature(ctx.db, s.merchant, promoFeature((await svc.getPromo(ctx.db, s.merchant.id, req.params.promoId)).kind));
    reply.status(201);
    return svc.duplicatePromo(ctx, s.merchant, s.user.id, req.params.promoId);
  });
  app.get("/merchants/:merchantId/promos/:promoId/results", async (req: PromoReq) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return svc.promoResults(ctx, s.merchant.id, req.params.promoId);
  });
  app.get("/merchants/:merchantId/promos/:promoId/preview", async (req: PromoReq) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return svc.previewDeal(ctx, s.merchant, req.params.promoId);
  });
  app.post("/merchants/:merchantId/promos/:promoId/redeem", async (req: PromoReq) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    await limitWrites(ctx, `${s.merchant.id}:${s.user.id}`);
    return svc.redeemPromo(ctx, s.merchant, s.user.id, req.params.promoId, parse(promosApi.redeemPromoBody, req.body));
  });
  app.get("/merchants/:merchantId/promo-audience", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    const q = parse(z.object({ segment: z.enum(promosApi.PROMO_SEGMENTS).default("everyone") }), req.query);
    return svc.audiencePreview(ctx, s.merchant, q.segment);
  });

  // ---- Owner: the AI writer ("Write it for me") ----
  app.get("/merchants/:merchantId/promo-ai", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return promoAiUsage(ctx, s.merchant);
  });
  app.post("/merchants/:merchantId/promo-ai", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await requireAnyFeature(ctx.db, s.merchant, PROMO_FEATURES);
    // Never sends or publishes anything: it returns a draft the owner edits and publishes.
    return generatePromo(ctx, s.merchant, parse(promosApi.promoAiBody, req.body));
  });

  // ---- Customer: the Deals inbox ----
  app.get("/me/deals", async (req) => {
    const q = parse(z.object({ merchantId: z.uuid().optional() }), req.query);
    return svc.dealsFor(ctx, requireUser(req).id, q);
  });
  app.post<{ Params: { promoId: string } }>("/me/deals/:promoId/open", async (req) => svc.openDeal(ctx, requireUser(req).id, req.params.promoId));
  app.post<{ Params: { promoId: string } }>("/me/deals/:promoId/claim", async (req) => {
    const u = requireUser(req);
    if (!(await allow(ctx, `deal-claim:${u.id}`, 20, 60_000))) throw tooMany("Too many tries. Give it a moment.");
    return svc.claimDeal(ctx, u.id, req.params.promoId);
  });

  // ---- Admin: /admin/ai (the Claude key, caps, usage). Admin only; the key is only ever returned masked. ----
  app.get("/admin/ai", async (req) => {
    await requireLiveAdmin(ctx, req);
    return adminAiSettings(ctx);
  });
  app.put("/admin/ai/key", async (req) => {
    const a = await requireLiveAdmin(ctx, req);
    if (!(await allow(ctx, `ai-key:${a.id}`, 10, 60_000))) throw tooMany("Too many tries. Give it a moment.");
    return setAiKey(ctx, a.id, parse(promosApi.setAiKeyBody, req.body).apiKey, req.ip);
  });
  app.delete("/admin/ai/key", async (req) => {
    const a = await requireLiveAdmin(ctx, req);
    return deleteAiKey(ctx, a.id, req.ip);
  });
  app.patch("/admin/ai/settings", async (req) => {
    const a = await requireLiveAdmin(ctx, req);
    return updateAiSettings(ctx, a.id, parse(promosApi.aiSettingsBody, req.body), req.ip);
  });
}
