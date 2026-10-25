import type { FastifyInstance, FastifyRequest } from "fastify";
import { adminApi } from "@ll/shared";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { supportSessions } from "@ll/db";
import type { AppContext } from "../../context.js";
import { requirePlatformRole } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import * as ops from "../../services/admin-ops.js";
import * as rep from "../../services/rep.js";
import { rejectMalformedIds } from "../merchant/params.js";

type Req<P = object> = FastifyRequest<{ Params: P }>;

/**
 * Support sessions for staff of the platform: an admin on any shop, a rep on the shops they signed.
 * One click with a reason opens a 30-minute window in which writes inside the shop are allowed (and audited).
 */
export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);

    /** The caller's current session on this shop, or null. */
    app.get("/support/merchants/:merchantId/session", async (req: Req<{ merchantId: string }>) => {
      const user = requirePlatformRole(req, "rep");
      await rep.assertRepMerchant(ctx, user, req.params.merchantId);
      const [row] = await ctx.db
        .select({ id: supportSessions.id })
        .from(supportSessions)
        .where(and(eq(supportSessions.adminUserId, user.id), eq(supportSessions.merchantId, req.params.merchantId), isNull(supportSessions.endedAt), gt(supportSessions.expiresAt, ctx.now())))
        .orderBy(desc(supportSessions.startedAt))
        .limit(1);
      if (!row) return { session: null };
      const list = await ops.listSupportSessions(ctx, req.params.merchantId);
      return { session: list.items.find((s) => s.id === row.id) ?? null };
    });

    app.post("/support/merchants/:merchantId/session", async (req: Req<{ merchantId: string }>, reply) => {
      const user = requirePlatformRole(req, "rep");
      await rep.assertRepMerchant(ctx, user, req.params.merchantId);
      reply.status(201);
      return ops.startSupportSession(ctx, user.id, req.params.merchantId, parse(adminApi.startSupportSessionBody, req.body).reason, req.ip);
    });

    app.post("/support/sessions/:sessionId/end", async (req: Req<{ sessionId: string }>) => {
      const user = requirePlatformRole(req, "rep");
      return ops.endSupportSession(ctx, user.id, req.params.sessionId, user.platformRole === "admin");
    });
  });
}
