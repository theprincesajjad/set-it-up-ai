/**
 * Payments: Stripe Connect onboarding, the Stripe webhook, and (dev/test only)
 * a simulator that drives FakePayments through the same event handlers.
 * Docs: docs/engineering/api/payments.md.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { billingApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { HttpError, badRequest, notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { FakePayments, getPayments, type PaymentsEvent } from "../../providers/payments.js";
import { connectStatus, processWebhookEvent, startConnectOnboarding } from "../../services/payments.js";

const simulateBody = z.object({
  action: z.enum(["succeed_payment", "fail_payment", "complete_checkout", "complete_onboarding", "fail_renewal", "end_subscription", "renew_subscription", "update_subscription"]),
  /** PaymentIntent, Checkout Session, Connect account or Subscription id. */
  id: z.string().min(3),
});

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post<{ Params: { merchantId: string } }>("/merchants/:merchantId/payments/connect", async (req) => {
    const { merchant } = await requireStaff(ctx, req, req.params.merchantId, "owner");
    return startConnectOnboarding(ctx, merchant, parse(billingApi.connectBody, req.body ?? {}));
  });

  app.get<{ Params: { merchantId: string } }>("/merchants/:merchantId/payments/status", async (req) => {
    const { merchant } = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return connectStatus(ctx, merchant);
  });

  app.post("/webhooks/stripe", async (req, reply) => {
    const sig = req.headers["stripe-signature"];
    let event: PaymentsEvent;
    try {
      event = getPayments(ctx).verifyWebhook(req.rawBody ?? "", typeof sig === "string" ? sig : undefined);
    } catch (err) {
      throw new HttpError(400, "invalid_signature", "Webhook signature verification failed", { reason: (err as Error).message });
    }
    if (!event?.id || !event.type || !event.data?.object) throw badRequest("Malformed event");
    const r = await processWebhookEvent(ctx, event);
    return reply.status(200).send({ received: true, duplicate: r.duplicate });
  });

  // Dev/test only: simulate what Stripe would do and run it through the webhook handler.
  app.post("/payments/fake/simulate", async (req) => {
    const payments = getPayments(ctx);
    if (ctx.config.env === "production" || !(payments instanceof FakePayments)) throw notFound("Route");
    const body = parse(simulateBody, req.body);
    let events: PaymentsEvent[];
    try {
      switch (body.action) {
        case "succeed_payment":
          events = [payments.succeedPaymentIntent(body.id)];
          break;
        case "fail_payment":
          events = [payments.failPaymentIntent(body.id)];
          break;
        case "complete_checkout":
          events = payments.completeCheckout(body.id, ctx.now());
          break;
        case "complete_onboarding":
          events = [payments.completeOnboarding(body.id)];
          break;
        case "fail_renewal":
          events = payments.failRenewal(body.id);
          break;
        case "end_subscription":
          events = [payments.endSubscription(body.id)];
          break;
        case "renew_subscription":
          events = payments.renewSubscription(body.id, ctx.now());
          break;
        case "update_subscription":
          events = [payments.subscriptionUpdated(body.id)];
          break;
      }
    } catch (err) {
      throw badRequest((err as Error).message);
    }
    for (const e of events) await processWebhookEvent(ctx, e);
    return { events: events.map((e) => ({ id: e.id, type: e.type })) };
  });
}
