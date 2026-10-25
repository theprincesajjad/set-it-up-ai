import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppContext } from "./context.js";
import { verifyAccessToken } from "./lib/auth.js";
import { HttpError, tooMany } from "./lib/errors.js";
import { countHits, postgresBlanketStore, recordHit } from "./lib/rate-limit.js";
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

const MISS_LIMIT = 40;
const MISS_WINDOW_MS = 10 * 60_000;

export async function buildApp(ctx: AppContext, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: typeof ctx.config.trustProxy === "number" ? (_addr: string, hop: number) => hop < (ctx.config.trustProxy as number) : ctx.config.trustProxy, bodyLimit: 5 * 1024 * 1024 });
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
    // Runs after the auth hook so signed-in traffic is limited per user. The
    // web app's server-side calls all come from one IP, so keying by IP alone
    // would throttle every dashboard user together.
    await app.register(rateLimit, {
      max: 300,
      timeWindow: "1 minute",
      hook: "preHandler",
      keyGenerator: (req) => (req.authUser ? `user:${req.authUser.id}` : `ip:${req.ip}`),
      // RATE_LIMIT_STORE=postgres: one shared counter per key across API instances (default: per process).
      ...(ctx.config.rateLimit.store === "postgres" ? { store: postgresBlanketStore(ctx) } : {}),
    });
  }

  app.addHook("onRequest", async (req) => {
    const h = req.headers.authorization;
    if (h?.startsWith("Bearer ")) req.authUser = await verifyAccessToken(ctx, h.slice(7));
  });

  // Enumeration guard for the public pages that are opened by a secret link or code: an address that keeps
  // asking for links that do not exist is slowed down. The tokens themselves carry 128+ bits, so this is
  // defence in depth (and a cheap way to spot a scanner), not the primary control.
  const GUARDED = /^\/v1\/public\/(tiffin\/driver|tickets|reviews|catering|splits|quotes|invoices|payments|join|whatsapp\/pay|messaging\/unsubscribe|onboarding\/unsubscribe)\b/;
  app.addHook("preHandler", async (req) => {
    if (!GUARDED.test(req.url) || (await countHits(ctx, `miss:${req.ip}`, MISS_WINDOW_MS)) < MISS_LIMIT) return;
    throw tooMany("Too many links that don't exist. Check the link, or try again in a few minutes.");
  });
  app.addHook("onResponse", async (req, reply) => {
    if (!GUARDED.test(req.url)) return;
    // 404/410: a link that does not exist or has expired. 400/403 only where the credential is a query parameter (unsubscribe, pay page).
    const credentialInQuery = /\/public\/(messaging\/unsubscribe|onboarding\/unsubscribe|whatsapp\/pay)/.test(req.url);
    if ([404, 410].includes(reply.statusCode) || (credentialInQuery && [400, 403].includes(reply.statusCode))) await recordHit(ctx, `miss:${req.ip}`, MISS_WINDOW_MS);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      // Provider error text (`cause`, `reason`) is for our logs, never for the caller: it can name accounts, keys or internals.
      let details = err.details;
      if (details && typeof details === "object" && ("cause" in details || (err.code === "invalid_signature" && "reason" in details))) {
        const { cause, reason, ...rest } = details as Record<string, unknown>;
        req.log.warn({ code: err.code, cause, reason }, "error detail withheld from response");
        details = Object.keys(rest).length ? rest : undefined;
      }
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details } });
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
