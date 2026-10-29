import type { FastifyInstance, FastifyRequest } from "fastify";
import { reportsApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import { requireFeature } from "../../services/features.js";
import * as insights from "../../services/insights.js";
import { rejectMalformedIds } from "../merchant/params.js";

type Req = FastifyRequest<{ Params: { merchantId: string } }>;

/**
 * The weekly money report (docs/business/pro-value.md 3.2 P6). The week itself is open to every manager on every plan: Free sees the
 * numbers and the locked lines. The 12-week history is the weekly report (insights.weekly: Pro, Studio and the trial).
 */
export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);
    const manager = async (req: Req) => (await requireStaff(ctx, req, req.params.merchantId, "manager")).merchant;

    app.get("/merchants/:merchantId/insights/week", async (req: Req) => {
      const m = await manager(req);
      const q = parse(reportsApi.insightsWeekQuery, req.query);
      return q.trial ? insights.trialReceipt(ctx, m) : insights.weekReport(ctx, m, { start: q.start });
    });

    app.get("/merchants/:merchantId/insights/weeks", async (req: Req) => {
      const m = await manager(req);
      await requireFeature(ctx.db, m, "insights.weekly");
      return insights.weeksHistory(ctx, m, parse(reportsApi.insightsWeeksQuery, req.query).weeks);
    });

    app.put("/merchants/:merchantId/insights/settings", async (req: Req) => insights.saveSettings(ctx, await manager(req), parse(reportsApi.insightsSettingsBody, req.body)));
  });
}
