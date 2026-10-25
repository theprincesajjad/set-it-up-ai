/**
 * Sales and support assistant routes.
 *  - Public (no login): GET /v1/public/sales-agent/status, POST /v1/public/sales-agent/messages, GET /v1/public/sales-agent/messages
 *    (the website chat widget; the visitor's session token is sent in the x-agent-session header on GET).
 *  - Admin: /v1/admin/sales-agent/* (conversation list, hand-off queue, transcript, take over, reply, release, close, rate, quality).
 * The WhatsApp door is the existing webhook (services/whatsapp.ts), which hands platform-number messages to channels.ts.
 * Docs: docs/engineering/api/sales-agent.md.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { salesAgentApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requirePlatformRole } from "../../lib/auth.js";
import { badRequest } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { handleWebMessage, pollWeb, status } from "../../services/sales-agent/channels.js";
import * as inbox from "../../services/sales-agent/inbox.js";
import { rejectMalformedIds } from "../merchant/params.js";

type Req<P = object> = FastifyRequest<{ Params: P }>;

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);

    // ---- Public chat
    app.get("/public/sales-agent/status", async (_req, reply) => {
      reply.header("cache-control", "public, max-age=60");
      return status(ctx);
    });
    app.post("/public/sales-agent/messages", async (req) => handleWebMessage(ctx, parse(salesAgentApi.webMessageBody, req.body), req.ip));
    app.get("/public/sales-agent/messages", async (req) => {
      const token = req.headers["x-agent-session"];
      const t = Array.isArray(token) ? token[0] : token;
      if (!t || t.length < 20 || t.length > 200) throw badRequest("Missing session");
      return pollWeb(ctx, t, parse(salesAgentApi.webPollQuery, req.query).since);
    });

    // ---- Admin
    const admin = (req: FastifyRequest) => requirePlatformRole(req, "admin").id;
    app.get("/admin/sales-agent/conversations", async (req) => {
      admin(req);
      return inbox.list(ctx, parse(salesAgentApi.listQuery, req.query));
    });
    app.get("/admin/sales-agent/conversations/:conversationId", async (req: Req<{ conversationId: string }>) => {
      admin(req);
      return inbox.detail(ctx, req.params.conversationId);
    });
    app.post("/admin/sales-agent/conversations/:conversationId/takeover", async (req: Req<{ conversationId: string }>) => inbox.takeOver(ctx, admin(req), req.params.conversationId));
    app.post("/admin/sales-agent/conversations/:conversationId/release", async (req: Req<{ conversationId: string }>) => inbox.release(ctx, admin(req), req.params.conversationId));
    app.post("/admin/sales-agent/conversations/:conversationId/close", async (req: Req<{ conversationId: string }>) => inbox.close(ctx, admin(req), req.params.conversationId));
    app.post("/admin/sales-agent/conversations/:conversationId/reply", async (req: Req<{ conversationId: string }>, reply) => {
      const id = admin(req);
      const body = parse(salesAgentApi.replyBody, (req as unknown as { body: unknown }).body);
      return reply.status(201).send(await inbox.reply(ctx, id, req.params.conversationId, body.text));
    });
    app.put("/admin/sales-agent/messages/:messageId/feedback", async (req: Req<{ messageId: string }>, reply) => {
      const id = admin(req);
      await inbox.rate(ctx, id, req.params.messageId, parse(salesAgentApi.feedbackBody, (req as unknown as { body: unknown }).body).rating);
      return reply.status(204).send();
    });
    app.get("/admin/sales-agent/quality", async (req) => {
      admin(req);
      return inbox.quality(ctx);
    });
  });
}
