import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adsApi } from "@ll/shared";

const { AD_RATE_CARD, AD_RULES } = adsApi;
import type { AppContext } from "../../context.js";
import { requirePlatformRole, requireStaff, requireUser } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import {
  adReport,
  createAdCampaign,
  getMerchantAd,
  listAdsForAdmin,
  listMerchantAds,
  markAdPaid,
  requireAnyAdsFeature,
  reviewAd,
  setMerchantAdState,
  toAdCampaign,
  trackClick,
  trackImpression,
} from "../../services/ads.js";
// Registers the ad-attribution visit hook with the ledger (side-effect import).
import "../../services/attribution.js";
import { startAdPayment } from "../../services/ads-payments.js";
import { selectSponsored } from "../../services/sponsored.js";
import { notFound } from "../../lib/errors.js";
import { adCampaigns, merchants } from "@ll/db";
import { eq } from "drizzle-orm";

const idParams = z.object({ id: z.uuid() });
const merchantParams = z.object({ merchantId: z.uuid() });
const merchantAdParams = z.object({ merchantId: z.uuid(), adId: z.uuid() });

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // -------------------------------------------------------------------------
  // Public / customer
  // -------------------------------------------------------------------------
  app.get("/ads/rate-card", async (): Promise<adsApi.AdRateCardResponse> => ({ rateCard: AD_RATE_CARD, rules: AD_RULES }));

  /** Sponsored items for a placement. Auth optional (signed-in viewers get frequency caps and muted shops applied). */
  app.get("/ads/sponsored", async (req): Promise<adsApi.SponsoredResponse> => {
    const q = parse(adsApi.sponsoredQuery, req.query);
    const items = await selectSponsored(ctx, { ...q, userId: req.authUser?.id ?? null });
    return { items };
  });

  app.post("/ads/:id/impression", async (req): Promise<adsApi.TrackResponse> => {
    const user = requireUser(req);
    const { id } = parse(idParams, req.params);
    return trackImpression(ctx, id, user.id);
  });

  app.post("/ads/:id/click", async (req): Promise<adsApi.TrackResponse> => {
    const user = requireUser(req);
    const { id } = parse(idParams, req.params);
    return trackClick(ctx, id, user.id);
  });

  // -------------------------------------------------------------------------
  // Merchant self-serve (owner / manager)
  // -------------------------------------------------------------------------
  app.get("/merchants/:merchantId/ads", async (req) => {
    const { merchantId } = parse(merchantParams, req.params);
    const { merchant } = await requireStaff(ctx, req, merchantId, "manager");
    await requireAnyAdsFeature(ctx.db, merchant);
    return listMerchantAds(ctx.db, merchant.id, parse(adsApi.listAdCampaignsQuery, req.query));
  });

  app.post("/merchants/:merchantId/ads", async (req, reply) => {
    const { merchantId } = parse(merchantParams, req.params);
    const { merchant, user } = await requireStaff(ctx, req, merchantId, "manager");
    const body = parse(adsApi.createAdCampaignBody, req.body);
    const row = await createAdCampaign(ctx, merchant, body, user.id);
    return reply.status(201).send(toAdCampaign(row));
  });

  app.get("/merchants/:merchantId/ads/:adId", async (req) => {
    const { merchantId, adId } = parse(merchantAdParams, req.params);
    const { merchant } = await requireStaff(ctx, req, merchantId, "manager");
    await requireAnyAdsFeature(ctx.db, merchant);
    return toAdCampaign(await getMerchantAd(ctx.db, merchant.id, adId));
  });

  app.get("/merchants/:merchantId/ads/:adId/report", async (req): Promise<adsApi.AdReport> => {
    const { merchantId, adId } = parse(merchantAdParams, req.params);
    const { merchant } = await requireStaff(ctx, req, merchantId, "manager");
    await requireAnyAdsFeature(ctx.db, merchant);
    return adReport(ctx.db, await getMerchantAd(ctx.db, merchant.id, adId), merchant.timezone);
  });

  /** Pay for the campaign by card; confirm the returned clientSecret with Stripe.js. */
  app.post("/merchants/:merchantId/ads/:adId/pay", async (req) => {
    const { merchantId, adId } = parse(merchantAdParams, req.params);
    const { merchant } = await requireStaff(ctx, req, merchantId, "owner");
    await requireAnyAdsFeature(ctx.db, merchant);
    return startAdPayment(ctx, merchant, adId);
  });

  for (const action of ["pause", "resume", "cancel"] as const) {
    app.post(`/merchants/:merchantId/ads/:adId/${action}`, async (req) => {
      const { merchantId, adId } = parse(merchantAdParams, req.params);
      const { merchant, user } = await requireStaff(ctx, req, merchantId, "manager");
      await requireAnyAdsFeature(ctx.db, merchant);
      return toAdCampaign(await setMerchantAdState(ctx, merchant.id, adId, action, user.id));
    });
  }

  // -------------------------------------------------------------------------
  // Admin review queue
  // -------------------------------------------------------------------------
  app.get("/admin/ads", async (req) => {
    requirePlatformRole(req, "admin");
    return listAdsForAdmin(ctx.db, parse(adsApi.adminListAdsQuery, req.query));
  });

  app.get("/admin/ads/:id", async (req): Promise<adsApi.AdminAdCampaign> => {
    requirePlatformRole(req, "admin");
    const { id } = parse(idParams, req.params);
    const [row] = await ctx.db
      .select({ ad: adCampaigns, m: { id: merchants.id, name: merchants.name, slug: merchants.slug } })
      .from(adCampaigns)
      .innerJoin(merchants, eq(merchants.id, adCampaigns.merchantId))
      .where(eq(adCampaigns.id, id))
      .limit(1);
    if (!row) throw notFound("Ad campaign");
    return { ...toAdCampaign(row.ad), merchant: row.m };
  });

  app.get("/admin/ads/:id/report", async (req): Promise<adsApi.AdReport> => {
    requirePlatformRole(req, "admin");
    const { id } = parse(idParams, req.params);
    const [row] = await ctx.db.select().from(adCampaigns).where(eq(adCampaigns.id, id)).limit(1);
    if (!row) throw notFound("Ad campaign");
    return adReport(ctx.db, row);
  });

  app.post("/admin/ads/:id/approve", async (req) => {
    const admin = requirePlatformRole(req, "admin");
    const { id } = parse(idParams, req.params);
    const body = parse(adsApi.approveAdBody, req.body ?? {});
    return toAdCampaign(await reviewAd(ctx, id, { approve: true, note: body.note }, admin.id));
  });

  app.post("/admin/ads/:id/reject", async (req) => {
    const admin = requirePlatformRole(req, "admin");
    const { id } = parse(idParams, req.params);
    const body = parse(adsApi.rejectAdBody, req.body);
    return toAdCampaign(await reviewAd(ctx, id, { approve: false, reason: body.reason }, admin.id));
  });

  app.post("/admin/ads/:id/mark-paid", async (req) => {
    const admin = requirePlatformRole(req, "admin");
    const { id } = parse(idParams, req.params);
    const body = parse(adsApi.markAdPaidBody, req.body ?? {});
    return toAdCampaign(await markAdPaid(ctx, id, body.paymentStatus, admin.id));
  });
}
