/**
 * Billing (owner only): plans with availability, Stripe Checkout for
 * Plus/Pro, customer portal, cancel/resume, downgrade to Free.
 * Docs: docs/engineering/api/billing.md. Contract: @ll/shared billingApi.
 */
import type { FastifyInstance } from "fastify";
import { billingApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import * as billing from "../../services/billing.js";

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
}
