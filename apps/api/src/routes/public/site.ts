/**
 * Public website pages (workstream G): GET /v1/public/sites/:slug (the /s/<slug> page) and GET /v1/public/sites/by-host/:host
 * (a custom domain, resolved by the web proxy). Registered from routes/site so routes/public/index.ts stays untouched.
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../context.js";
import * as site from "../../services/site.js";

export default async function registerPublicSite(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: { slug: string } }>("/public/sites/:slug", async (req, reply) => {
    reply.header("cache-control", "public, max-age=30");
    return site.publicBySlug(ctx, req.params.slug);
  });
  app.get<{ Params: { host: string } }>("/public/sites/by-host/:host", async (req, reply) => {
    reply.header("cache-control", "public, max-age=30");
    return site.publicByHost(ctx, req.params.host);
  });
}
