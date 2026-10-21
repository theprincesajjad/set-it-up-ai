import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { integrationsApi } from "@ll/shared";
import { getConnector, isPosProvider } from "../../connectors/index.js";
import { googleBusinessLinks } from "../../connectors/google-business/index.js";
import type { AppContext } from "../../context.js";
import { loadUser, requireStaff, requireUser } from "../../lib/auth.js";
import { HttpError, notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { verifyTwilioSignature, twiml } from "../../providers/twilio.js";
import { requireFeature } from "../../services/features.js";
import {
  completeOAuth,
  connectorEntry,
  currentMapping,
  disconnect,
  getIntegration,
  integrationCatalog,
  startConnect,
  syncIntegration,
  updateSettings,
} from "../../services/integrations.js";
import { apiAward, apiMember, apiRedeem, apiRefund, requireApiKey } from "../../services/integrations-api.js";
import { claimUnmatched, handleProviderWebhook, listUnmatched } from "../../services/integrations-pipeline.js";
import { dispatchInboundSms } from "../../services/integrations-sms.js";
import { createWebhook, deleteWebhook, eventEnvelope, listDeliveries, listWebhooks, sendTestWebhook, updateWebhook } from "../../services/webhooks-out.js";

type P = { merchantId: string; provider: string };
const merchantParams = z.object({ merchantId: z.uuid() });
const providerParams = merchantParams.extend({ provider: z.string().min(1).max(40) });
const idempotencyHeader = (req: FastifyRequest) => {
  const h = req.headers["idempotency-key"];
  return (Array.isArray(h) ? h[0] : h) || undefined;
};

export const WEBHOOK_PROVIDERS = ["square", "clover", "shopify", "lightspeed", "toast"] as const;

function requireKnownProvider(provider: string) {
  const c = getConnector(provider);
  if (!c) throw notFound("Integration");
  return c;
}

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // -------------------------------------------------------------------------
  // Merchant dashboard
  // -------------------------------------------------------------------------
  app.get("/merchants/:merchantId/integrations", async (req) => {
    const { merchantId } = parse(merchantParams, req.params);
    await requireStaff(ctx, req, merchantId, "manager");
    return { items: await integrationCatalog(ctx, merchantId) };
  });

  app.get("/merchants/:merchantId/integrations/unmatched", async (req) => {
    const { merchantId } = parse(merchantParams, req.params);
    await requireStaff(ctx, req, merchantId, "staff");
    return listUnmatched(ctx, merchantId, parse(integrationsApi.unmatchedQuery, req.query));
  });

  app.post("/merchants/:merchantId/integrations/unmatched/:eventId/attach", async (req) => {
    const { merchantId, eventId } = parse(merchantParams.extend({ eventId: z.uuid() }), req.params);
    const s = await requireStaff(ctx, req, merchantId, "staff");
    const body = parse(integrationsApi.attachPhoneBody, req.body);
    return claimUnmatched(ctx, { merchantId, eventId, phone: body.phone, name: body.name ?? null, via: "staff", staffUserId: s.user.id });
  });

  app.get("/merchants/:merchantId/integrations/google_business/links", async (req) => {
    const { merchantId } = parse(merchantParams, req.params);
    const s = await requireStaff(ctx, req, merchantId, "staff");
    const row = await getIntegration(ctx.db, merchantId, "google_business");
    return googleBusinessLinks(ctx.config, s.merchant, row?.settings ?? {});
  });

  app.get("/merchants/:merchantId/integrations/:provider", async (req) => {
    const { merchantId, provider } = parse(providerParams, req.params);
    await requireStaff(ctx, req, merchantId, "manager");
    const c = requireKnownProvider(provider);
    const row = await getIntegration(ctx.db, merchantId, provider);
    return { ...connectorEntry(ctx, c, row), mapping: await currentMapping(ctx.db, merchantId, provider) };
  });

  app.post("/merchants/:merchantId/integrations/:provider/connect", async (req) => {
    const { merchantId, provider } = parse(providerParams, req.params);
    const s = await requireStaff(ctx, req, merchantId, "manager");
    requireKnownProvider(provider);
    if (isPosProvider(provider)) await requireFeature(ctx.db, s.merchant, "integrations.pos_auto_award");
    const body = parse(integrationsApi.connectBody, req.body ?? {});
    return startConnect(ctx, merchantId, s.user.id, provider, body as Record<string, unknown>);
  });

  app.patch("/merchants/:merchantId/integrations/:provider", async (req) => {
    const { merchantId, provider } = parse(providerParams, req.params);
    await requireStaff(ctx, req, merchantId, "manager");
    return updateSettings(ctx, merchantId, provider, parse(integrationsApi.updateSettingsBody, req.body));
  });

  app.delete("/merchants/:merchantId/integrations/:provider", async (req) => {
    const { merchantId, provider } = parse(providerParams, req.params);
    await requireStaff(ctx, req, merchantId, "manager");
    return disconnect(ctx, merchantId, provider);
  });

  app.post("/merchants/:merchantId/integrations/:provider/sync", async (req) => {
    const { merchantId, provider } = parse(providerParams, req.params);
    await requireStaff(ctx, req, merchantId, "manager");
    requireKnownProvider(provider);
    return syncIntegration(ctx, merchantId, provider);
  });

  // OAuth redirect target (browser; no bearer token — the signed state carries merchant + user).
  app.get("/integrations/:provider/callback", async (req, reply) => {
    const { provider } = req.params as P;
    const query = Object.fromEntries(Object.entries((req.query ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(Array.isArray(v) ? v[0] : v)]));
    const dest = (params: Record<string, string>) => `${ctx.config.publicWebUrl}/dashboard/integrations?${new URLSearchParams(params).toString()}`;
    try {
      requireKnownProvider(provider);
      const r = await completeOAuth(ctx, provider, query);
      return reply.redirect(dest({ provider, status: "connected", merchantId: r.merchantId }), 302);
    } catch (err) {
      const code = err instanceof HttpError ? err.code : "internal";
      if (!(err instanceof HttpError)) console.error(`[integrations] ${provider} callback failed`, err);
      return reply.redirect(dest({ provider, status: "error", error: code }), 302);
    }
  });

  // -------------------------------------------------------------------------
  // Customer: claim an unmatched POS purchase with the receipt code
  // -------------------------------------------------------------------------
  app.post("/me/purchases/claim", async (req) => {
    const u = requireUser(req);
    const user = await loadUser(ctx, u.id);
    const body = parse(integrationsApi.claimReceiptBody, req.body);
    return claimUnmatched(ctx, { merchantId: body.merchantId, code: body.code, userId: user.id, via: "customer" });
  });

  // -------------------------------------------------------------------------
  // Outbound webhooks (dashboard)
  // -------------------------------------------------------------------------
  const hookParams = merchantParams.extend({ webhookId: z.uuid() });

  app.get("/merchants/:merchantId/webhooks", async (req) => {
    const { merchantId } = parse(merchantParams, req.params);
    await requireStaff(ctx, req, merchantId, "manager");
    return { items: await listWebhooks(ctx, merchantId), events: integrationsApi.OUTBOUND_EVENTS };
  });

  app.post("/merchants/:merchantId/webhooks", async (req, reply) => {
    const { merchantId } = parse(merchantParams, req.params);
    const s = await requireStaff(ctx, req, merchantId, "manager");
    await requireFeature(ctx.db, s.merchant, "integrations.webhooks");
    const body = parse(integrationsApi.createWebhookBody, req.body);
    return reply.status(201).send(await createWebhook(ctx, merchantId, { ...body, createdVia: "dashboard" }));
  });

  app.patch("/merchants/:merchantId/webhooks/:webhookId", async (req) => {
    const { merchantId, webhookId } = parse(hookParams, req.params);
    await requireStaff(ctx, req, merchantId, "manager");
    return updateWebhook(ctx, merchantId, webhookId, parse(integrationsApi.updateWebhookBody, req.body));
  });

  app.delete("/merchants/:merchantId/webhooks/:webhookId", async (req, reply) => {
    const { merchantId, webhookId } = parse(hookParams, req.params);
    await requireStaff(ctx, req, merchantId, "manager");
    await deleteWebhook(ctx, merchantId, webhookId);
    return reply.status(204).send();
  });

  app.post("/merchants/:merchantId/webhooks/:webhookId/test", async (req) => {
    const { merchantId, webhookId } = parse(hookParams, req.params);
    await requireStaff(ctx, req, merchantId, "manager");
    return (await sendTestWebhook(ctx, merchantId, webhookId)) ?? { status: "queued", statusCode: null };
  });

  app.get("/merchants/:merchantId/webhooks/:webhookId/deliveries", async (req) => {
    const { merchantId, webhookId } = parse(hookParams, req.params);
    await requireStaff(ctx, req, merchantId, "manager");
    return { items: await listDeliveries(ctx, merchantId, webhookId), nextCursor: null };
  });

  // -------------------------------------------------------------------------
  // Inbound provider webhooks
  // -------------------------------------------------------------------------
  const inbound = (provider: string) => async (req: FastifyRequest, reply: FastifyReply) => {
    const r = await handleProviderWebhook(ctx, provider, {
      rawBody: req.rawBody ?? "",
      body: req.body,
      headers: req.headers,
      url: `${ctx.config.publicApiUrl}${req.url}`,
    });
    return reply.status(r.status).send(r.body);
  };
  for (const p of WEBHOOK_PROVIDERS) app.post(`/webhooks/${p}`, inbound(p));

  app.post("/webhooks/twilio/sms", async (req, reply) => {
    const token = ctx.config.sms.twilioAuthToken;
    const params = Object.fromEntries(Object.entries((req.body ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
    const sig = req.headers["x-twilio-signature"];
    if (!token || !verifyTwilioSignature(token, `${ctx.config.publicApiUrl}${req.url}`, params, Array.isArray(sig) ? sig[0] : sig)) {
      return reply.status(403).send({ error: { code: "invalid_signature", message: "Twilio signature verification failed" } });
    }
    const r = await dispatchInboundSms(ctx, params.From ?? "", params.Body ?? "");
    return reply.type("text/xml").send(twiml(r.reply));
  });

  // -------------------------------------------------------------------------
  // Merchant REST API (X-LL-Api-Key): custom POS, Zapier, Make
  // -------------------------------------------------------------------------
  app.get("/api/me", async (req) => {
    const m = await requireApiKey(ctx, req);
    return { merchantId: m.id, name: m.name, slug: m.slug };
  });

  app.post("/api/award", async (req) => {
    const m = await requireApiKey(ctx, req);
    return apiAward(ctx, m, parse(integrationsApi.apiAwardBody, req.body), idempotencyHeader(req));
  });

  app.post("/api/redeem", async (req) => {
    const m = await requireApiKey(ctx, req);
    return apiRedeem(ctx, m, parse(integrationsApi.apiRedeemBody, req.body), idempotencyHeader(req));
  });

  app.post("/api/refund", async (req) => {
    const m = await requireApiKey(ctx, req);
    return apiRefund(ctx, m, parse(integrationsApi.apiRefundBody, req.body));
  });

  app.get("/api/members/:phone", async (req) => {
    const m = await requireApiKey(ctx, req);
    return apiMember(ctx, m, decodeURIComponent((req.params as { phone: string }).phone));
  });

  // Zapier / Make REST hooks: subscribe returns { id }, unsubscribe by id.
  app.post("/api/hooks", async (req, reply) => {
    const m = await requireApiKey(ctx, req);
    const body = parse(integrationsApi.apiSubscribeBody, req.body);
    const w = await createWebhook(ctx, m.id, { url: body.url, events: [body.event], createdVia: body.source, description: `${body.source}: ${body.event}` });
    return reply.status(201).send(w);
  });

  app.delete("/api/hooks/:webhookId", async (req, reply) => {
    const m = await requireApiKey(ctx, req);
    const { webhookId } = parse(z.object({ webhookId: z.uuid() }), req.params);
    await deleteWebhook(ctx, m.id, webhookId);
    return reply.status(204).send();
  });

  // Sample payloads so Zapier/Make can show fields before a real event fires.
  app.get("/api/samples/:event", async (req) => {
    const m = await requireApiKey(ctx, req);
    const { event } = parse(z.object({ event: z.enum(integrationsApi.OUTBOUND_EVENTS) }), req.params);
    const sample: Record<string, unknown> = { memberId: "00000000-0000-4000-8000-000000000000", points: 25, balance: 120, source: "square" };
    return [eventEnvelope(ctx, m.id, event, sample)];
  });
}
