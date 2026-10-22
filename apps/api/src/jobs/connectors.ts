import { and, eq, isNotNull } from "drizzle-orm";
import { integrations } from "@ll/db";
import { getConnector } from "../connectors/index.js";
import type { AppContext } from "../context.js";
import { enabledFeaturesByMerchantId } from "../services/features.js";
import { decryptCredentials, encryptCredentials, integrationFeature, runSync } from "../services/integrations.js";
import { httpFor } from "../services/integrations-http.js";
import { retryFailedEvents } from "../services/integrations-pipeline.js";
import { deliverDueWebhooks, pruneDeliveries } from "../services/webhooks-out.js";
import type { Job } from "./index.js";

/** Refresh OAuth tokens that expire within `withinMs` (Square: 30 days, Clover/Lightspeed: hours). */
export async function refreshExpiringTokens(ctx: AppContext, withinMs = 24 * 3600_000) {
  const rows = await ctx.db.select().from(integrations).where(and(eq(integrations.status, "connected"), isNotNull(integrations.credentialsEnc)));
  let refreshed = 0;
  for (const row of rows) {
    const c = getConnector(row.provider);
    if (!c?.refresh) continue;
    try {
      const creds = decryptCredentials(ctx, row.credentialsEnc);
      if (!creds?.expiresAt || new Date(creds.expiresAt).getTime() - ctx.now().getTime() > withinMs) continue;
      const next = await c.refresh(ctx.config, creds, httpFor(ctx));
      await ctx.db.update(integrations).set({ credentialsEnc: encryptCredentials(ctx, next), lastError: null, updatedAt: ctx.now() }).where(eq(integrations.id, row.id));
      refreshed++;
    } catch (err) {
      const status = (err as { status?: number }).status;
      // 400/401 from the token endpoint = the merchant revoked access: needs reconnecting.
      await ctx.db
        .update(integrations)
        .set({ status: status === 400 || status === 401 ? "error" : row.status, lastError: `Token refresh failed: ${(err as Error).message}`, updatedAt: ctx.now() })
        .where(eq(integrations.id, row.id));
    }
  }
  return { refreshed };
}

/** Daily: re-sync Mailchimp audiences (consent changes) and POS locations/categories. Skips connections paused by Pricing v2 gating. */
export async function dailySync(ctx: AppContext) {
  const rows = await ctx.db.select().from(integrations).where(eq(integrations.status, "connected"));
  const on = await enabledFeaturesByMerchantId(ctx.db, rows.map((r) => r.merchantId), ["integrations.pos_auto_award", "marketing.email", "integrations.webhooks"]);
  for (const row of rows) {
    if (!getConnector(row.provider)?.sync) continue;
    const feature = integrationFeature(row.provider);
    if (feature && !on.get(row.merchantId)?.has(feature)) continue;
    if (row.lastSyncAt && ctx.now().getTime() - row.lastSyncAt.getTime() < 20 * 3600_000) continue;
    try {
      await runSync(ctx, row);
    } catch {
      /* lastError recorded by runSync */
    }
  }
}

export const connectorsJobs: Job[] = [
  { name: "webhooks-out.deliver", everyMs: 15_000, run: async (ctx) => void (await deliverDueWebhooks(ctx)) },
  { name: "webhooks-in.retry", everyMs: 60_000, run: async (ctx) => void (await retryFailedEvents(ctx)) },
  { name: "integrations.refresh-tokens", everyMs: 3600_000, run: async (ctx) => void (await refreshExpiringTokens(ctx)) },
  { name: "integrations.daily-sync", everyMs: 3600_000, run: dailySync },
  { name: "webhooks-out.prune", everyMs: 24 * 3600_000, run: (ctx) => pruneDeliveries(ctx) },
];
