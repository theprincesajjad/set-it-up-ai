/**
 * Instagram DMs into the inbox, read-only (phase solo, workstream D). Everything here answers only while INSTAGRAM_DM_ENABLED is
 * "stub" or "live"; off, the status says so and the rest return 409 or 404. There is no route that sends to Instagram.
 *
 *   GET  /v1/merchants/:id/instagram             status (mode, connected, username)
 *   POST /v1/merchants/:id/instagram/connect     stub: connect and import now; live: the Meta authorize URL
 *   POST /v1/merchants/:id/instagram/disconnect  delete the token and purge every Instagram thread
 *   GET  /v1/public/instagram/callback           OAuth return (live)
 *   GET  /v1/public/instagram/webhook            Meta's verification handshake
 *   POST /v1/public/instagram/webhook            messages webhook (X-Hub-Signature-256)
 *   POST /v1/public/instagram/data-deletion      Meta data-deletion callback (signed_request)
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { HttpError } from "../../lib/errors.js";
import * as inbox from "../../services/inbox.js";
import { instagramMode } from "../../services/inbox-connectors/index.js";
import { rejectMalformedIds } from "../merchant/params.js";

type Req<P = object> = FastifyRequest<{ Params: { merchantId: string } & P }>;

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);
    await routes(app, ctx);
  });
}

async function routes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/merchants/:merchantId/instagram", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return inbox.instagramStatus(ctx, s.merchant.id);
  });

  app.post("/merchants/:merchantId/instagram/connect", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return inbox.connectInstagram(ctx, s);
  });

  app.post("/merchants/:merchantId/instagram/disconnect", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return inbox.disconnectInstagram(ctx, s);
  });

  app.get("/public/instagram/callback", async (req: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>, reply) => {
    if (instagramMode() !== "live") throw new HttpError(404, "not_found", "Not found");
    const q = req.query;
    if (q.error || !q.code || !q.state) return reply.redirect(`${ctx.config.publicWebUrl}/m?instagram=cancelled`);
    const r = await inbox.completeInstagramOAuth(ctx, q.code, q.state);
    return reply.redirect(`${ctx.config.publicWebUrl}/m/${r.merchantId}/inbox?instagram=connected`);
  });

  app.get("/public/instagram/webhook", async (req: FastifyRequest<{ Querystring: Record<string, string> }>, reply) => {
    if (instagramMode() === "off") throw new HttpError(404, "not_found", "Not found");
    const q = req.query;
    const token = process.env.INSTAGRAM_VERIFY_TOKEN;
    if (q["hub.mode"] === "subscribe" && token && q["hub.verify_token"] === token) return reply.type("text/plain").send(q["hub.challenge"] ?? "");
    throw new HttpError(403, "forbidden", "Verification failed");
  });

  app.post("/public/instagram/webhook", async (req) => {
    if (instagramMode() === "off") throw new HttpError(404, "not_found", "Not found");
    return inbox.instagramWebhook(ctx, req.headers, req.rawBody ?? "");
  });

  app.post("/public/instagram/data-deletion", async (req) => {
    const body = (req.body ?? {}) as { signed_request?: string };
    return inbox.instagramDataDeletion(ctx, body.signed_request);
  });
}
