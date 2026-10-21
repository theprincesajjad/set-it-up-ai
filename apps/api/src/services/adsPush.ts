/**
 * Delivery for `nearby_push` ad campaigns.
 *
 * A sponsored push is a promotional message, so CASL applies: it only goes to
 * the advertiser's own members who gave that merchant marketing consent and
 * haven't muted it. On top of that, to keep it from feeling spammy:
 *  - each customer gets at most one push per campaign, ever;
 *  - each customer gets at most one sponsored push per 24 hours across all campaigns;
 *  - targeting: the customer's home neighbourhood must be one the campaign
 *    targets (radius-only campaigns reach the advertiser's consenting members);
 *  - every push names the merchant, is labelled "Sponsored" and says how to opt out.
 * Each delivered push is a billed impression (CPM) and respects even pacing.
 */
import { and, eq, gte, inArray, isNotNull, lte, gt } from "drizzle-orm";
import { adCampaigns, adEvents, merchantMembers, merchants, pushTokens, users } from "@ll/db";
import type { AppContext } from "../context.js";
import { DAY_MS, isServing, pacedSpendLimit, trackImpression } from "./ads.js";

const BATCH_PER_CAMPAIGN = 200;

export async function deliverNearbyPushes(ctx: AppContext): Promise<{ sent: number }> {
  const now = ctx.now();
  const ads = await ctx.db
    .select({ ad: adCampaigns, merchantName: merchants.name })
    .from(adCampaigns)
    .innerJoin(merchants, eq(merchants.id, adCampaigns.merchantId))
    .where(and(eq(adCampaigns.status, "active"), eq(adCampaigns.placement, "nearby_push"), lte(adCampaigns.startsAt, now), gt(adCampaigns.endsAt, now), eq(merchants.status, "active")));
  let sent = 0;
  for (const { ad, merchantName } of ads) {
    if (!isServing(ad, now)) continue;
    // Pacing: how many impressions the paced budget still allows right now.
    const allowanceCents = pacedSpendLimit(ad, now) - ad.spentCents;
    const allowance = Math.min(BATCH_PER_CAMPAIGN, Math.floor((allowanceCents * 1000) / ad.rateCents));
    if (allowance <= 0) continue;

    const conds = [eq(merchantMembers.merchantId, ad.merchantId), isNotNull(merchantMembers.marketingConsentAt), eq(merchantMembers.muted, false)];
    if (ad.neighbourhoodIds.length) conds.push(inArray(users.homeNeighbourhoodId, ad.neighbourhoodIds));
    const audience = await ctx.db
      .select({ userId: merchantMembers.userId })
      .from(merchantMembers)
      .innerJoin(users, eq(users.id, merchantMembers.userId))
      .where(and(...conds));
    if (!audience.length) continue;
    const ids = audience.map((a) => a.userId);

    const alreadyThisCampaign = new Set(
      (await ctx.db.select({ userId: adEvents.userId }).from(adEvents).where(and(eq(adEvents.adCampaignId, ad.id), eq(adEvents.kind, "impression"), inArray(adEvents.userId, ids)))).map((r) => r.userId),
    );
    const pushedToday = new Set(
      (
        await ctx.db
          .select({ userId: adEvents.userId })
          .from(adEvents)
          .innerJoin(adCampaigns, eq(adCampaigns.id, adEvents.adCampaignId))
          .where(and(eq(adCampaigns.placement, "nearby_push"), eq(adEvents.kind, "impression"), gte(adEvents.createdAt, new Date(now.getTime() - DAY_MS)), inArray(adEvents.userId, ids)))
      ).map((r) => r.userId),
    );
    const eligible = ids.filter((id) => !alreadyThisCampaign.has(id) && !pushedToday.has(id));
    if (!eligible.length) continue;
    const tokens = await ctx.db.select({ userId: pushTokens.userId, token: pushTokens.token }).from(pushTokens).where(inArray(pushTokens.userId, eligible));
    const byUser = new Map<string, string[]>();
    for (const t of tokens) byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), t.token]);

    let used = 0;
    for (const [userId, userTokens] of byUser) {
      if (used >= allowance) break;
      const { counted } = await trackImpression(ctx, ad.id, userId);
      if (!counted) break; // budget exhausted or campaign stopped
      used++;
      await ctx.providers.push.send(
        userTokens.map((token) => ({
          token,
          title: `${merchantName} · Sponsored`,
          body: `${ad.headline} — To stop offers from ${merchantName}, mute the shop in the app.`,
          data: { kind: "sponsored", adCampaignId: ad.id, merchantId: ad.merchantId, ...(ad.promoId ? { promoId: ad.promoId } : {}) },
        })),
      );
      sent++;
    }
  }
  return { sent };
}
