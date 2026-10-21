/**
 * Ad visit attribution. Registered as a ledger visit hook at module load, so
 * importing this module (routes/ads/index.ts does) turns it on.
 *
 * Method: last touch, click beats impression. A visit at merchant M by user U
 * is attributed to M's ad campaign that U clicked (else saw) most recently in
 * the previous AD_RULES.attributionWindowDays days. Each ad interaction can
 * earn at most one attributed visit: touches before U's previous attributed
 * visit for that campaign don't count again, so a regular who saw one ad
 * isn't counted every morning.
 */
import { and, desc, eq, gt, gte, inArray, lte, max, sql } from "drizzle-orm";
import { adCampaigns, adEvents, type Tx } from "@ll/db";
import { adsApi } from "@ll/shared";
import { visitHooks, type VisitHook, type VisitHookArgs } from "./ledger.js";
import { DAY_MS } from "./ads.js";

const { AD_RULES } = adsApi;

export async function attributeVisit(tx: Tx, args: Pick<VisitHookArgs, "merchant" | "member" | "visitId" | "at">): Promise<string | null> {
  const userId = args.member.userId;
  const windowStart = new Date(args.at.getTime() - AD_RULES.attributionWindowDays * DAY_MS);
  const ads = await tx
    .select({ id: adCampaigns.id })
    .from(adCampaigns)
    .where(and(eq(adCampaigns.merchantId, args.merchant.id), inArray(adCampaigns.status, ["active", "paused", "ended"]), gt(adCampaigns.endsAt, windowStart)));
  if (!ads.length) return null;
  const adIds = ads.map((a) => a.id);

  const touches = await tx
    .select({ adId: adEvents.adCampaignId, kind: adEvents.kind, at: adEvents.createdAt })
    .from(adEvents)
    .where(
      and(
        inArray(adEvents.adCampaignId, adIds),
        eq(adEvents.userId, userId),
        inArray(adEvents.kind, ["impression", "click"]),
        gte(adEvents.createdAt, windowStart),
        lte(adEvents.createdAt, args.at),
      ),
    )
    .orderBy(desc(adEvents.createdAt));
  if (!touches.length) return null;

  const lastVisits = await tx
    .select({ adId: adEvents.adCampaignId, at: max(adEvents.createdAt) })
    .from(adEvents)
    .where(and(inArray(adEvents.adCampaignId, adIds), eq(adEvents.userId, userId), eq(adEvents.kind, "visit")))
    .groupBy(adEvents.adCampaignId);
  const lastVisitAt = new Map(lastVisits.map((v) => [v.adId, v.at]));
  const fresh = touches.filter((t) => {
    const prev = lastVisitAt.get(t.adId);
    return !prev || t.at > prev;
  });
  const winner = fresh.find((t) => t.kind === "click") ?? fresh[0];
  if (!winner) return null;

  await tx.insert(adEvents).values({ adCampaignId: winner.adId, userId, kind: "visit", visitId: args.visitId, createdAt: args.at });
  await tx
    .update(adCampaigns)
    .set({ attributedVisits: sql`${adCampaigns.attributedVisits} + 1` })
    .where(eq(adCampaigns.id, winner.adId));
  return winner.adId;
}

export const adAttributionHook: VisitHook = async (tx, args) => {
  await attributeVisit(tx, args);
};

if (!visitHooks.includes(adAttributionHook)) visitHooks.push(adAttributionHook);
