/**
 * WhatsApp: Meta webhook (verify + inbound), shop settings, consent, broadcasts,
 * and the public pay page data for WhatsApp orders.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { whatsappApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, requireUser } from "../../lib/auth.js";
import { forbidden } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { verifyHubSignature, verifyWebhookChallenge } from "../../providers/whatsapp.js";
import { requireFeature } from "../../services/features.js";
import * as svc from "../../services/whatsapp.js";
import { rejectMalformedIds } from "../merchant/params.js";

type Req<P = object> = FastifyRequest<{ Params: { merchantId: string } & P }>;

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app, ["orderId"]);
    await routes(app, ctx);
  });
}

async function routes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // ---- Meta webhook ----
  app.get("/webhooks/whatsapp", async (req, reply) => {
    const challenge = verifyWebhookChallenge(req.query as Record<string, unknown>, ctx.config.whatsapp.verifyToken);
    if (challenge === null) return reply.status(403).send({ error: { code: "invalid_verify_token", message: "Verification failed" } });
    return reply.type("text/plain").send(challenge);
  });

  app.post("/webhooks/whatsapp", async (req, reply) => {
    const secret = ctx.config.whatsapp.appSecret;
    const header = req.headers["x-hub-signature-256"];
    const sig = Array.isArray(header) ? header[0] : header;
    // Unsigned requests are only accepted in dev/test (fake provider, no app secret configured).
    const ok = secret ? verifyHubSignature(secret, req.rawBody ?? "", sig) : ctx.config.env !== "production";
    if (!ok) return reply.status(403).send({ error: { code: "invalid_signature", message: "Signature verification failed" } });
    return { ok: true, ...(await svc.handleWebhook(ctx, req.body)) };
  });

  // ---- Shop settings ----
  app.get("/merchants/:merchantId/whatsapp/settings", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await requireFeature(ctx.db, s.merchant, "restaurant.whatsapp_notifications");
    return svc.getSettings(ctx, s.merchant);
  });

  app.put("/merchants/:merchantId/whatsapp/settings", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
    await requireFeature(ctx.db, s.merchant, "restaurant.whatsapp_notifications");
    return svc.saveSettings(ctx, s.merchant, s.user.id, parse(whatsappApi.whatsappSettingsBody, req.body));
  });

  app.delete("/merchants/:merchantId/whatsapp/connection", async (req: Req, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
    await svc.disconnect(ctx, s.merchant, s.user.id);
    return reply.status(204).send();
  });

  app.get("/merchants/:merchantId/whatsapp/sessions", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    await requireFeature(ctx.db, s.merchant, "restaurant.whatsapp_notifications");
    return { items: await svc.listSessions(ctx, s.merchant.id) };
  });

  // ---- Consent ----
  app.post("/merchants/:merchantId/whatsapp/opt-ins", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    await requireFeature(ctx.db, s.merchant, "restaurant.whatsapp_notifications");
    return svc.recordOptIn(ctx, s.merchant, s.user.id, parse(whatsappApi.optInBody, req.body));
  });

  app.post("/merchants/:merchantId/whatsapp/opt-outs", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    await requireFeature(ctx.db, s.merchant, "restaurant.whatsapp_notifications");
    const body = parse(whatsappApi.optInBody.pick({ phone: true }).required(), req.body);
    return svc.recordOptOut(ctx, s.merchant, body.phone, "merchant", s.user.id);
  });

  app.get("/me/merchants/:merchantId/whatsapp-consent", async (req: Req) => svc.getCustomerConsent(ctx, requireUser(req).id, req.params.merchantId));

  app.put("/me/merchants/:merchantId/whatsapp-consent", async (req: Req) => {
    const body = parse(whatsappApi.customerConsentBody, req.body);
    return svc.setCustomerConsent(ctx, requireUser(req).id, req.params.merchantId, body);
  });

  // ---- Marketing broadcast (Growth) ----
  app.post("/merchants/:merchantId/whatsapp/broadcasts", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return svc.broadcast(ctx, s.merchant, s.user.id, parse(whatsappApi.broadcastBody, req.body));
  });

  // ---- Public pay page data for a WhatsApp order (token in the link) ----
  app.get("/public/whatsapp/pay/:orderId", async (req: FastifyRequest<{ Params: { orderId: string }; Querystring: { t?: string } }>) => {
    if (!req.query.t) throw forbidden("This payment link is incomplete");
    return svc.getPayView(ctx, req.params.orderId, req.query.t);
  });
}
