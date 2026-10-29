/**
 * The waitlist on the booking page and the one-tap "Take it" link (docs/business/pro-value.md §3.2 P2). No login needed: a signed-in
 * client joins as themselves, anyone else with a name and a phone or email. The /w/<token> link is the client's own (it came to them).
 * Contract: @ll/shared waitlistApi.
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { merchants } from "@ll/db";
import { waitlistApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { requireFeature } from "../../services/features.js";
import * as svc from "../../services/waitlist.js";

const day = /^\d{4}-\d{2}-\d{2}$/;

export default async function registerWaitlist(app: FastifyInstance, ctx: AppContext): Promise<void> {
  async function shop(slug: string) {
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.slug, slug)).limit(1);
    if (!m || m.status === "closed") throw notFound("Shop");
    await requireFeature(ctx.db, m, "booking.appointments");
    return m;
  }

  app.get<{ Params: { slug: string }; Querystring: { from?: string; to?: string } }>("/public/shops/:slug/waitlist", async (req) => {
    const { from, to } = req.query;
    if (!from || !to || !day.test(from) || !day.test(to)) throw badRequest("Ask for from and to as YYYY-MM-DD");
    return svc.publicInfo(ctx, await shop(req.params.slug), { from, to });
  });

  app.post<{ Params: { slug: string } }>("/public/shops/:slug/waitlist", async (req, reply) => {
    const m = await shop(req.params.slug);
    const body = parse(waitlistApi.joinWaitlistBody, req.body);
    return reply.status(201).send(await svc.joinPublic(ctx, m, body, { authUserId: req.authUser?.id ?? null, ip: req.ip }));
  });

  app.get<{ Params: { token: string } }>("/public/w/:token", async (req) => svc.offerByToken(ctx, req.params.token));

  app.post<{ Params: { token: string } }>("/public/w/:token/take", async (req) => svc.takeByToken(ctx, req.params.token));
}
