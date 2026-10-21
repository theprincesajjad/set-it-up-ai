import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppContext } from "./context.js";
import { verifyAccessToken } from "./lib/auth.js";
import { HttpError } from "./lib/errors.js";
import { registerRoutes } from "./routes/index.js";

declare module "fastify" {
  interface FastifyInstance {
    ctx: AppContext;
  }
  interface FastifyRequest {
    /** Raw request body (string) for webhook signature verification. */
    rawBody?: string;
  }
}

export async function buildApp(ctx: AppContext, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true, bodyLimit: 5 * 1024 * 1024 });
  app.decorate("ctx", ctx);
  app.decorateRequest("authUser", null);

  // Keep the raw body so webhook routes can verify provider signatures.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    req.rawBody = body as string;
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      (err as Error & { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (req, body, done) => {
    req.rawBody = body as string;
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  await app.register(cors, { origin: ctx.config.env === "production" ? ctx.config.corsOrigins : true, credentials: true });
  if (ctx.config.env !== "test") {
    await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  }

  app.addHook("onRequest", async (req) => {
    const h = req.headers.authorization;
    if (h?.startsWith("Bearer ")) req.authUser = await verifyAccessToken(ctx, h.slice(7));
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    const e = err as { statusCode?: number; message?: string; validation?: unknown };
    if (e.statusCode && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: { code: "bad_request", message: e.message } });
    }
    req.log.error(err);
    if (ctx.config.env !== "production") console.error(err);
    return reply.status(500).send({ error: { code: "internal", message: "Something went wrong" } });
  });

  app.get("/health", async () => ({ ok: true, time: ctx.now().toISOString() }));
  await app.register(async (v1) => registerRoutes(v1, ctx), { prefix: "/v1" });
  return app;
}
