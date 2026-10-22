/**
 * Phone ordering assistant: telephony webhook (Twilio-style) and the merchant's
 * call list with confirm / discard.
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { merchants } from "@ll/db";
import { whatsappApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { verifyTwilioSignature } from "../../providers/twilio.js";
import * as svc from "../../services/phone.js";
import { rejectMalformedIds } from "../merchant/params.js";

type Req<P = object> = FastifyRequest<{ Params: { merchantId: string } & P }>;

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);

    app.post("/webhooks/phone/:merchantId", async (req: Req, reply) => {
      const params = Object.fromEntries(Object.entries((req.body ?? {}) as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v : String(v ?? "")]));
      const token = ctx.config.phone.authToken;
      const url = `${ctx.config.publicApiUrl}${req.url}`;
      const header = req.headers["x-twilio-signature"];
      const sig = Array.isArray(header) ? header[0] : header;
      // Unsigned requests are only accepted in dev/test when no auth token is configured.
      const ok = token ? verifyTwilioSignature(token, url, params, sig) : ctx.config.env !== "production";
      if (!ok) return reply.status(403).send({ error: { code: "invalid_signature", message: "Signature verification failed" } });
      const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, req.params.merchantId)).limit(1);
      if (!merchant) throw notFound("Merchant");
      const { xml } = await svc.ingestCall(ctx, merchant, svc.readCallParams(params), url);
      return reply.type("text/xml").send(xml);
    });

    app.get("/merchants/:merchantId/phone/calls", async (req: Req) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
      return svc.listCalls(ctx, s.merchant, parse(whatsappApi.listCallsQuery, req.query));
    });

    app.get("/merchants/:merchantId/phone/calls/:callId", async (req: Req<{ callId: string }>) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
      return svc.getCall(ctx, s.merchant, req.params.callId);
    });

    app.post("/merchants/:merchantId/phone/calls/:callId/confirm", async (req: Req<{ callId: string }>) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
      return svc.confirmCall(ctx, s.merchant, req.params.callId, parse(whatsappApi.confirmCallBody, req.body ?? {}));
    });

    app.post("/merchants/:merchantId/phone/calls/:callId/discard", async (req: Req<{ callId: string }>) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
      return svc.discardCall(ctx, s.merchant, req.params.callId);
    });
  });
}
