import { and, asc, count, desc, eq, gt, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { merchantStaff, merchants } from "@ll/db";
import { merchantApi, normalizeLocale } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, requireUser } from "../../lib/auth.js";
import { tooMany } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import {
  buildQrKit,
  completeOnboardingStep,
  createMerchantWithTemplate,
  getOnboardingChecklist,
  loadMerchantDetail,
  merchantFeaturesResponse,
  revokeApiKey,
  rotateApiKey,
  setBetaOptIn,
  updateProfile,
  userLocale,
} from "../../services/merchant.js";
import { dismissUpsell, setNudges } from "../../services/onboarding.js";
import { recordFeatureInterest, requireFeature } from "../../services/features.js";
import { locateNewShop, relocateShop, requestStreet, streetStatus } from "../../services/geocode.js";
import registerCustomers from "./customers.js";
import registerExports from "./exports.js";
import registerProgram from "./program.js";
import { rejectMalformedIds } from "./params.js";
import registerTeam from "./team.js";
import registerOnboardingSolo from "./onboarding-solo.js";

/** Max merchants one user can create self-serve (abuse guard; reps/admins are unlimited). */
const MAX_SELF_SERVE_MERCHANTS = 10;
/**
 * A second "create my shop" for the same shop is a retry, not a second shop: the phone lost its connection after the first request
 * went out, the owner tapped again, or a second tab was open. Same owner, same name and kind inside this window answers with the shop
 * that already exists instead of making a twin.
 */
const SIGNUP_RETRY_WINDOW_MS = 10 * 60_000;

export type MerchantReq = FastifyRequest<{ Params: { merchantId: string } }>;

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);
    await routes(app, ctx);
  });
}

async function routes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // Self-serve signup wizard.
  app.post("/merchants", async (req, reply) => {
    const user = requireUser(req);
    const body = parse(merchantApi.createMerchantBody, req.body);
    if (user.platformRole === "none") {
      const [row] = await ctx.db.select({ n: count() }).from(merchantStaff).where(and(eq(merchantStaff.userId, user.id), eq(merchantStaff.role, "owner")));
      if (Number(row?.n ?? 0) >= MAX_SELF_SERVE_MERCHANTS) throw tooMany("You've reached the limit of shops per account. Contact support to add more.");
    }
    // Self-serve only: a rep or an admin setting up shops for others may well make two with one name.
    const [twin] = user.platformRole !== "none" ? [] : await ctx.db
      .select({ id: merchants.id })
      .from(merchants)
      .innerJoin(merchantStaff, and(eq(merchantStaff.merchantId, merchants.id), eq(merchantStaff.userId, user.id), eq(merchantStaff.role, "owner")))
      .where(and(eq(sql`lower(${merchants.name})`, body.name.trim().toLowerCase()), eq(merchants.vertical, body.vertical), gt(merchants.createdAt, new Date(ctx.now().getTime() - SIGNUP_RETRY_WINDOW_MS))))
      .orderBy(desc(merchants.createdAt))
      .limit(1);
    if (twin) return loadMerchantDetail(ctx, twin.id, "owner");
    // New shops used to start "Closed" all week, which blanks the open-now line and filter. Start with 9 to 5:30, Monday to Saturday, and ask in setup.
    if (!body.hours) body.hours = { mon: [["09:00", "17:30"]], tue: [["09:00", "17:30"]], wed: [["09:00", "17:30"]], thu: [["09:00", "17:30"]], fri: [["09:00", "17:30"]], sat: [["09:00", "17:30"]] };
    // A pin from the address and the street it is on (nearest open neighbourhood), unless the caller already gave them.
    // A home studio or a travelling pro is placed by postal code or city only (createMerchantWithTemplate): never geocode a private address here.
    if (body.lat === undefined && body.lng === undefined && (body.workSetting ?? "shop") === "shop" && body.address) {
      const found = await locateNewShop(ctx, { address: body.address, city: body.city, postalCode: body.postalCode });
      if (found.lat !== null && found.lng !== null) {
        body.lat = found.lat;
        body.lng = found.lng;
        if (!body.neighbourhoodId && !body.neighbourhoodSlug && found.neighbourhoodId) body.neighbourhoodId = found.neighbourhoodId;
      }
    }
    const { merchant } = await createMerchantWithTemplate(ctx, { body, ownerUserId: user.id, actorUserId: user.id });
    reply.status(201);
    return loadMerchantDetail(ctx, merchant.id, "owner");
  });

  // Merchants the caller works at.
  app.get("/merchants", async (req): Promise<{ items: merchantApi.MyMerchant[]; nextCursor: null }> => {
    const user = requireUser(req);
    const rows = await ctx.db
      .select({ m: merchants, role: merchantStaff.role })
      .from(merchantStaff)
      .innerJoin(merchants, eq(merchants.id, merchantStaff.merchantId))
      .where(eq(merchantStaff.userId, user.id))
      .orderBy(asc(merchants.name));
    return {
      items: rows.map(({ m, role }) => ({ id: m.id, slug: m.slug, name: m.name, vertical: m.vertical as merchantApi.MyMerchant["vertical"], status: m.status, plan: m.plan, role, logoUrl: m.logoUrl })),
      nextCursor: null,
    };
  });

  app.get("/merchants/:merchantId", async (req: MerchantReq) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "instructor");
    return loadMerchantDetail(ctx, s.merchant.id, s.role);
  });

  app.patch("/merchants/:merchantId", async (req: MerchantReq) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const body = parse(merchantApi.updateProfileBody, req.body);
    await updateProfile(ctx, s.merchant.id, s.user.id, body);
    return loadMerchantDetail(ctx, s.merchant.id, s.role);
  });

  app.get("/merchants/:merchantId/street", async (req: MerchantReq): Promise<merchantApi.StreetStatusResponse> => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return streetStatus(ctx.db, s.merchant.id);
  });

  app.post("/merchants/:merchantId/locate", async (req: MerchantReq): Promise<merchantApi.StreetStatusResponse> => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
    return relocateShop(ctx, s.merchant.id, s.user.id);
  });

  app.post("/merchants/:merchantId/street", async (req: MerchantReq): Promise<merchantApi.StreetStatusResponse> => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
    const { name } = parse(merchantApi.streetRequestBody, req.body);
    return requestStreet(ctx, s.merchant.id, s.user.id, name);
  });

  app.get("/merchants/:merchantId/onboarding", async (req: MerchantReq) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    // The dashboard asks in the language it is being read in (?lang=ur), so Home is not half English after a signup in Urdu;
    // without it (the mobile app, older clients) the words follow the owner's profile language as before.
    const asked = normalizeLocale((req.query as { lang?: string } | undefined)?.lang);
    return getOnboardingChecklist(ctx, s.merchant.id, asked ?? (await userLocale(ctx.db, s.user.id)));
  });

  app.post("/merchants/:merchantId/onboarding/complete", async (req: MerchantReq) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const { step } = parse(merchantApi.completeStepBody, req.body);
    return completeOnboardingStep(ctx, s.merchant.id, s.user.id, step);
  });

  app.post("/merchants/:merchantId/onboarding/upsell/dismiss", async (req: MerchantReq) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
    return dismissUpsell(ctx, s.merchant.id, s.user.id);
  });

  app.put("/merchants/:merchantId/onboarding/nudges", async (req: MerchantReq) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
    const { enabled } = parse(merchantApi.setNudgesBody, req.body);
    return setNudges(ctx, s.merchant.id, s.user.id, enabled);
  });

  app.get("/merchants/:merchantId/features", async (req: MerchantReq) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "instructor");
    return merchantFeaturesResponse(ctx.db, s.merchant);
  });

  app.post("/merchants/:merchantId/features/:key/notify", async (req: FastifyRequest<{ Params: { merchantId: string; key: string } }>, reply): Promise<merchantApi.FeatureInterestResponse> => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const { created, ...out } = await recordFeatureInterest(ctx.db, s.merchant.id, req.params.key, s.user.id, ctx.now());
    reply.status(created ? 201 : 200);
    return out;
  });

  app.put("/merchants/:merchantId/beta", async (req: MerchantReq) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
    const { optIn } = parse(merchantApi.betaOptInBody, req.body);
    await setBetaOptIn(ctx, s.merchant.id, s.user.id, optIn);
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, s.merchant.id));
    return merchantFeaturesResponse(ctx.db, m!);
  });

  app.get("/merchants/:merchantId/qr-kit", async (req: MerchantReq) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return buildQrKit(ctx, s.merchant.id);
  });

  // API key for the integrations (owner only). The raw key is returned once.
  app.get("/merchants/:merchantId/api-key", async (req: MerchantReq): Promise<merchantApi.ApiKeyStatus> => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
    return { configured: !!s.merchant.apiKeyHash };
  });
  app.post("/merchants/:merchantId/api-key", async (req: MerchantReq, reply): Promise<merchantApi.ApiKeyCreated> => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
    // Issuing a key needs "Webhooks & API" (Plus); viewing status and revoking always work.
    await requireFeature(ctx.db, s.merchant, "integrations.webhooks");
    reply.status(201);
    return { apiKey: await rotateApiKey(ctx, s.merchant.id, s.user.id) };
  });
  app.delete("/merchants/:merchantId/api-key", async (req: MerchantReq, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
    await revokeApiKey(ctx, s.merchant.id, s.user.id);
    return reply.status(204).send();
  });

  await registerTeam(app, ctx);
  await registerOnboardingSolo(app, ctx);
  await registerProgram(app, ctx);
  await registerCustomers(app, ctx);
  await registerExports(app, ctx);
}
