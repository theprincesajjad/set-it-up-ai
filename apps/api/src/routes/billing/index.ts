/**
 * Billing (owner only): plans with availability, Stripe Checkout for
 * Plus/Pro, customer portal, cancel/resume, downgrade to Free. Restaurant pack:
 * tier checkout/change/cancel, add-ons, fee table, invoice history. Admin:
 * switch a merchant's Stripe charge mode.
 * Docs: docs/engineering/api/billing.md. Contract: @ll/shared billingApi.
 */
import type { FastifyInstance } from "fastify";
import { billingApi } from "@ll/shared";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { requirePlatformRole, requireStaff } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import * as billing from "../../services/billing.js";
import * as restaurant from "../../services/billing-restaurant.js";
import { setChargeMode } from "../../services/payments.js";

type P = { Params: { merchantId: string } };

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const owner = async (req: Parameters<typeof requireStaff>[1], merchantId: string) => (await requireStaff(ctx, req, merchantId, "owner")).merchant;

  app.get<P>("/merchants/:merchantId/billing", async (req) => billing.billingOverview(ctx, await owner(req, req.params.merchantId)));

  app.get<P>("/merchants/:merchantId/billing/plans", async (req) => {
    const overview = await billing.billingOverview(ctx, await owner(req, req.params.merchantId));
    return { items: overview.plans, nextCursor: null };
  });

  app.post<P>("/merchants/:merchantId/billing/checkout", async (req) => {
    const merchant = await owner(req, req.params.merchantId);
    return billing.startCheckout(ctx, merchant, parse(billingApi.checkoutBody, req.body));
  });

  app.post<P>("/merchants/:merchantId/billing/portal", async (req) => {
    const merchant = await owner(req, req.params.merchantId);
    return billing.portalLink(ctx, merchant, parse(billingApi.portalBody, req.body ?? {}).returnUrl);
  });

  app.post<P>("/merchants/:merchantId/billing/cancel", async (req) => {
    const merchant = await owner(req, req.params.merchantId);
    return { subscription: await billing.cancelAtPeriodEnd(ctx, merchant) };
  });

  app.post<P>("/merchants/:merchantId/billing/resume", async (req) => {
    const merchant = await owner(req, req.params.merchantId);
    return { subscription: await billing.resumeSubscription(ctx, merchant) };
  });

  app.post<P>("/merchants/:merchantId/billing/downgrade", async (req) => {
    const merchant = await owner(req, req.params.merchantId);
    const body = parse(billingApi.downgradeBody, req.body ?? {});
    return billing.downgradeToFree(ctx, merchant, body.immediate);
  });

  // ---- Restaurant pack ----
  const addOnId = (raw: string) => billingApi.addOnIdParam.parse(raw);
  const base = "/merchants/:merchantId/billing/restaurant";

  app.get<P>(base, async (req) => restaurant.restaurantOverview(ctx, await owner(req, req.params.merchantId)));

  app.post<P>(`${base}/checkout`, async (req) => {
    const merchant = await owner(req, req.params.merchantId);
    return restaurant.startRestaurantCheckout(ctx, merchant, parse(billingApi.restaurantCheckoutBody, req.body ?? {}));
  });

  app.post<P>(`${base}/change`, async (req) => {
    const merchant = await owner(req, req.params.merchantId);
    return restaurant.changeRestaurantTier(ctx, merchant, parse(billingApi.restaurantChangeBody, req.body).tier);
  });

  app.post<P>(`${base}/cancel`, async (req) => {
    const merchant = await owner(req, req.params.merchantId);
    return restaurant.cancelRestaurant(ctx, merchant, parse(billingApi.downgradeBody, req.body ?? {}).immediate);
  });

  app.post<P>(`${base}/resume`, async (req) => restaurant.resumeRestaurant(ctx, await owner(req, req.params.merchantId)));

  app.get<P>("/merchants/:merchantId/billing/add-ons", async (req) => ({ items: await restaurant.listAddOns(ctx, await owner(req, req.params.merchantId)), nextCursor: null }));

  app.put<P & { Params: { addOnId: string } }>("/merchants/:merchantId/billing/add-ons/:addOnId", async (req) => {
    const merchant = await owner(req, req.params.merchantId);
    return { addOn: await restaurant.attachAddOn(ctx, merchant, parse(billingApi.addOnIdParam, req.params.addOnId), parse(billingApi.attachAddOnBody, req.body ?? {})) };
  });

  app.delete<P & { Params: { addOnId: string } }>("/merchants/:merchantId/billing/add-ons/:addOnId", async (req) => {
    const merchant = await owner(req, req.params.merchantId);
    return { addOn: await restaurant.detachAddOn(ctx, merchant, addOnId(req.params.addOnId)) };
  });

  app.get<P>("/merchants/:merchantId/billing/invoices", async (req) => restaurant.invoiceHistory(ctx, await owner(req, req.params.merchantId)));

  // ---- Admin: Stripe charge mode (destination | direct) ----
  app.put<{ Params: { merchantId: string } }>("/admin/merchants/:merchantId/charge-mode", async (req) => {
    const admin = requirePlatformRole(req, "admin");
    const merchantId = parse(z.uuid(), req.params.merchantId);
    const body = parse(billingApi.setChargeModeBody, req.body);
    return setChargeMode(ctx, admin.id, merchantId, body.chargeMode, body.reason);
  });
}
