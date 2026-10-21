import type { FastifyInstance, FastifyRequest } from "fastify";
import { messagingApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import * as svc from "../../services/messaging.js";
import { rejectMalformedIds } from "../merchant/params.js";

type Req<P = object> = FastifyRequest<{ Params: { merchantId: string } & P }>;

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);
    await routes(app, ctx);
  });
}

async function routes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // ---- Campaigns (manager+) ----
  app.get("/merchants/:merchantId/messages", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return svc.listCampaigns(ctx, s.merchant.id, parse(messagingApi.listMessagesQuery, req.query));
  });

  app.post("/merchants/:merchantId/messages", async (req: Req, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const body = parse(messagingApi.createMessageBody, req.body);
    const m = await svc.createCampaign(ctx, s.merchant, s.user.id, body);
    reply.status(201);
    return svc.getCampaignDetail(ctx, s.merchant, m.id);
  });

  app.post("/merchants/:merchantId/messages/audience", async (req: Req): Promise<messagingApi.AudiencePreview> => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const { channel, segment } = parse(messagingApi.audienceBody, req.body);
    return svc.previewAudience(ctx, s.merchant, channel, segment);
  });

  app.get("/merchants/:merchantId/messages/sms-usage", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return svc.smsUsage(ctx, s.merchant);
  });

  app.get("/merchants/:merchantId/messages/:messageId", async (req: Req<{ messageId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return svc.getCampaignDetail(ctx, s.merchant, req.params.messageId);
  });

  app.patch("/merchants/:merchantId/messages/:messageId", async (req: Req<{ messageId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const m = await svc.updateCampaign(ctx, s.merchant, s.user.id, req.params.messageId, parse(messagingApi.updateMessageBody, req.body));
    return svc.getCampaignDetail(ctx, s.merchant, m.id);
  });

  app.post("/merchants/:merchantId/messages/:messageId/send", async (req: Req<{ messageId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await svc.sendCampaign(ctx, s.merchant.id, req.params.messageId);
    return svc.getCampaignDetail(ctx, s.merchant, req.params.messageId);
  });

  app.post("/merchants/:merchantId/messages/:messageId/cancel", async (req: Req<{ messageId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await svc.cancelCampaign(ctx, s.merchant.id, s.user.id, req.params.messageId);
    return svc.getCampaignDetail(ctx, s.merchant, req.params.messageId);
  });

  app.delete("/merchants/:merchantId/messages/:messageId", async (req: Req<{ messageId: string }>, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await svc.deleteCampaign(ctx, s.merchant.id, s.user.id, req.params.messageId);
    return reply.status(204).send();
  });

  // ---- Automations (Plus: marketing.automations) ----
  app.get("/merchants/:merchantId/automations", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return { items: await svc.listAutomations(ctx, s.merchant), nextCursor: null };
  });

  app.put("/merchants/:merchantId/automations/:kind", async (req: Req<{ kind: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const kind = parse(messagingApi.automationKindSchema, req.params.kind);
    return svc.upsertAutomation(ctx, s.merchant, s.user.id, kind, parse(messagingApi.upsertAutomationBody, req.body));
  });

  // ---- Public unsubscribe link (CASL). GET = link click, POST = one-click / web page. ----
  app.get("/public/messaging/unsubscribe", async (req, reply) => {
    const q = parse(messagingApi.unsubscribeBody, req.query);
    const r = await svc.unsubscribeByToken(ctx, q.m, q.t);
    const name = r.merchantName.replace(/[<>&"]/g, "");
    return reply
      .header("content-type", "text/html; charset=utf-8")
      .send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Unsubscribed</title><body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem"><h1>You're unsubscribed</h1><p>You won't get offers from ${name} any more. You'll still earn and redeem rewards there as usual.</p></body>`);
  });
  app.post("/public/messaging/unsubscribe", async (req): Promise<messagingApi.UnsubscribeResponse> => {
    const b = parse(messagingApi.unsubscribeBody, { ...(req.query as object), ...((req.body as object) ?? {}) });
    return svc.unsubscribeByToken(ctx, b.m, b.t);
  });
}
