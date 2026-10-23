/**
 * Shop-level settings that tiffin, catering and banquet share: how the shop gets paid by hand,
 * GST/HST status, food-safety dates. Owners change them; any staff member can read them.
 * Logic: services/manual-payments.ts.
 */
import type { FastifyInstance } from "fastify";
import { paymentsManualApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import * as svc from "../../services/manual-payments.js";

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  type M = { merchantId: string };
  const base = "/merchants/:merchantId";

  app.get<{ Params: M }>(`${base}/payment-settings`, async (req) => svc.settingsOf((await requireStaff(ctx, req, req.params.merchantId, "staff")).merchant));
  app.put<{ Params: M }>(`${base}/payment-settings`, async (req) => svc.putPaymentSettings(ctx, await requireStaff(ctx, req, req.params.merchantId, "owner"), parse(paymentsManualApi.paymentSettingsBody, req.body)));

  app.get<{ Params: M }>(`${base}/tax-settings`, async (req) => svc.taxSettings(ctx, (await requireStaff(ctx, req, req.params.merchantId, "staff")).merchant));
  app.put<{ Params: M }>(`${base}/tax-settings`, async (req) => svc.putTaxSettings(ctx, await requireStaff(ctx, req, req.params.merchantId, "owner"), parse(paymentsManualApi.taxSettingsBody, req.body)));

  app.get<{ Params: M }>(`${base}/food-safety`, async (req) => {
    const { merchant } = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return svc.foodSafetyDto(merchant, svc.todayFor(ctx, merchant));
  });
  app.put<{ Params: M }>(`${base}/food-safety`, async (req) => svc.putFoodSafety(ctx, await requireStaff(ctx, req, req.params.merchantId, "owner"), parse(paymentsManualApi.foodSafetyBody, req.body)));
}
