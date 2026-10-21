/**
 * Merchants pay for ad campaigns by card on the platform's Stripe account.
 * Admins can still mark a campaign paid or invoiced by hand (e.g. BIA-billed).
 */
import { and, eq } from "drizzle-orm";
import { adCampaigns, type merchants } from "@ll/db";
import type { AppContext } from "../context.js";
import { conflict } from "../lib/errors.js";
import { getMerchantAd } from "./ads.js";
import { createPlatformCharge, platformChargeHandlers } from "./payments.js";

type Merchant = typeof merchants.$inferSelect;

export async function startAdPayment(ctx: AppContext, merchant: Merchant, adId: string) {
  const ad = await getMerchantAd(ctx.db, merchant.id, adId);
  if (ad.paymentStatus !== "pending") throw conflict(`This campaign is already ${ad.paymentStatus}`);
  if (ad.status === "rejected" || ad.status === "ended") throw conflict("This campaign can no longer be paid");
  const charge = await createPlatformCharge(ctx, merchant, {
    amountCents: ad.budgetCents,
    description: `Ad campaign: ${ad.headline}`,
    metadata: { kind: "ad_campaign", id: ad.id },
    idempotencyKey: `ad-pay:${ad.id}`,
  });
  await ctx.db.update(adCampaigns).set({ stripePaymentIntentId: charge.id }).where(eq(adCampaigns.id, ad.id));
  return { paymentIntentId: charge.id, clientSecret: charge.clientSecret, amountCents: ad.budgetCents };
}

platformChargeHandlers.push(async (ctx, event) => {
  if (event.metadata.kind !== "ad_campaign" || !event.metadata.id) return;
  await ctx.db
    .update(adCampaigns)
    .set({ paymentStatus: "paid", paidAt: ctx.now(), stripePaymentIntentId: event.paymentIntentId ?? undefined })
    .where(and(eq(adCampaigns.id, event.metadata.id), eq(adCampaigns.paymentStatus, "pending")));
});
