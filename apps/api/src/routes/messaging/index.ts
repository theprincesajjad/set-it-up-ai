import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { messagingApi, negotiateLocale, normalizeLocale } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { UNSUBSCRIBE_PAGE_HEADERS, unsubscribeConfirmPage, unsubscribeDonePage } from "../../lib/unsubscribe-page.js";
import { parse } from "../../lib/validate.js";
import * as svc from "../../services/messaging.js";
import { previewNudgeUnsubscribe, unsubscribeNudgesByToken } from "../../services/onboarding.js";
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

  app.post("/merchants/:merchantId/messages/:messageId/test", async (req: Req<{ messageId: string }>): Promise<messagingApi.TestSendResult> => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return svc.sendTestToSelf(ctx, s.merchant, s.user.id, req.params.messageId);
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

  // ---- Public unsubscribe links (CASL). A GET never changes anything: mail scanners, link previews and prefetchers open every
  // URL in a message. It shows a confirm page whose button POSTs the same token back; the POST is also the RFC 8058 one-click
  // endpoint (mail apps POST `List-Unsubscribe=One-Click` to the URL in the List-Unsubscribe header and read the status). ----
  const pageLocale = (req: FastifyRequest) => {
    const lang = (req.query as { lang?: string } | undefined)?.lang ?? (req.body as { lang?: string } | undefined)?.lang;
    return normalizeLocale(lang) ?? negotiateLocale(req.headers["accept-language"]);
  };
  const wantsHtml = (req: FastifyRequest) => String(req.headers.accept ?? "").includes("text/html");
  const send = (reply: FastifyReply, html: string) => reply.headers(UNSUBSCRIBE_PAGE_HEADERS).send(html);

  app.get("/public/messaging/unsubscribe", async (req, reply) => {
    const q = parse(messagingApi.unsubscribeBody, req.query);
    const r = await svc.previewUnsubscribe(ctx, q.m, q.t);
    return send(reply, unsubscribeConfirmPage(pageLocale(req), "member", r.merchantName, "/v1/public/messaging/unsubscribe", { m: q.m, t: q.t, lang: pageLocale(req) }));
  });
  app.post("/public/messaging/unsubscribe", async (req, reply) => {
    const b = parse(messagingApi.unsubscribeBody, { ...(req.query as object), ...((req.body as object) ?? {}) });
    const r = await svc.unsubscribeByToken(ctx, b.m, b.t);
    if (wantsHtml(req)) return send(reply, unsubscribeDonePage(pageLocale(req), "member", r.merchantName));
    return r satisfies messagingApi.UnsubscribeResponse;
  });

  // ---- One-step unsubscribe from our setup reminders to shop owners (CASL): same GET-asks, POST-acts rule. ----
  const nudgeQuery = z.object({ m: z.string().uuid(), t: z.string().min(8).max(128) });
  app.get("/public/onboarding/unsubscribe", async (req, reply) => {
    const q = parse(nudgeQuery, req.query);
    const r = await previewNudgeUnsubscribe(ctx, q.m, q.t);
    return send(reply, unsubscribeConfirmPage(pageLocale(req), "nudge", r.merchantName, "/v1/public/onboarding/unsubscribe", { m: q.m, t: q.t, lang: pageLocale(req) }));
  });
  app.post("/public/onboarding/unsubscribe", async (req, reply) => {
    const b = parse(nudgeQuery, { ...(req.query as object), ...((req.body as object) ?? {}) });
    const r = await unsubscribeNudgesByToken(ctx, b.m, b.t);
    if (wantsHtml(req)) return send(reply, unsubscribeDonePage(pageLocale(req), "nudge", r.merchantName));
    return { ok: true };
  });
}
