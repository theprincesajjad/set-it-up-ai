import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppContext } from "./context.js";
import { verifyAccessToken } from "./lib/auth.js";
import { HttpError, notFound, tooMany } from "./lib/errors.js";
import { jobsStatus } from "./jobs/index.js";
import { sql } from "drizzle-orm";
import { countHits, postgresBlanketStore, recordHit } from "./lib/rate-limit.js";
import { installMetrics } from "./lib/metrics.js";
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

/** Misses per address per window before slowing down; MISS_LIMIT lifts it for screenshot and load runs that open many dead links from one machine. */
const MISS_LIMIT = Number(process.env.MISS_LIMIT) || 40;
const MISS_WINDOW_MS = 10 * 60_000;

export async function buildApp(ctx: AppContext, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    // Secret links carry their credential in the path or query: log the route template, never the raw URL, and never auth headers.
    logger: opts.logger ? { redact: { paths: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"], censor: "[redacted]" }, serializers: { req: (req: { method?: string; routeOptions?: { url?: string }; url?: string; id?: string }) => ({ method: req.method, url: req.routeOptions?.url ?? (req.url ?? "").split("?")[0]!.replace(/\/public\/[^/]+\/[^/]+/, "/public/…"), reqId: req.id }) } } : false,
    // A path with a broken percent-escape never reaches a route: answer it in our envelope too.
    frameworkErrors: (err, _req, reply) => {
      const [status, code, message] =
        err.code === "FST_ERR_BAD_URL" ? [404, "not_found", "We couldn't find that page."]
        : err.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE" ? [415, "unsupported_media_type", "We couldn't read that kind of request."]
        : err.code === "FST_ERR_CTP_BODY_TOO_LARGE" ? [413, "payload_too_large", "That is too large to send. Use a smaller file or shorter text."]
        : [400, "bad_request", "We couldn't read that request. Reload and try again."];
      return (reply.code(status as never) as unknown as { send(b: unknown): unknown }).send({ error: { code, message } });
    },
    trustProxy: typeof ctx.config.trustProxy === "number" ? (_addr: string, hop: number) => hop < (ctx.config.trustProxy as number) : ctx.config.trustProxy,
    bodyLimit: 5 * 1024 * 1024,
  });
  app.decorate("ctx", ctx);
  app.decorateRequest("authUser", null);

  // Keep the raw body so webhook routes can verify provider signatures.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    req.rawBody = body as string;
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(new HttpError(400, "bad_request", "We couldn't read that request. Reload and try again."), undefined);
    }
  });
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (req, body, done) => {
    req.rawBody = body as string;
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  await app.register(cors, { origin: ctx.config.env === "production" ? ctx.config.corsOrigins : true, credentials: true, methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] });
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

  // Baseline response headers on every reply (the API serves JSON and a few tiny pages, none of which belong in a frame).
  // A route that sets one of these itself keeps its value. HSTS only in production, where TLS is terminated in front of us.
  app.addHook("onSend", async (_req, reply, payload) => {
    const set = (name: string, value: string) => {
      if (!reply.hasHeader(name)) reply.header(name, value);
    };
    set("x-content-type-options", "nosniff");
    set("x-frame-options", "DENY");
    set("referrer-policy", "no-referrer");
    set("cross-origin-resource-policy", "same-site");
    set("permissions-policy", "camera=(), geolocation=(), microphone=(), payment=()");
    // JSON and the few tiny pages the API serves load nothing: a page that does (a wallet pass page) sets its own policy.
    set("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    if (ctx.config.env === "production") set("strict-transport-security", "max-age=63072000");
    return payload;
  });

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
    throw tooMany("Too many links that don't exist. Check the link, or try again in a few minutes.", MISS_WINDOW_MS / 1000);
  });
  app.addHook("onResponse", async (req, reply) => {
    if (!GUARDED.test(req.url)) return;
    // 404/410: a link that does not exist or has expired. 400/403 only where the credential is a query parameter (unsubscribe, pay page).
    const credentialInQuery = /\/public\/(messaging\/unsubscribe|onboarding\/unsubscribe|whatsapp\/pay)/.test(req.url);
    if ([404, 410].includes(reply.statusCode) || (credentialInQuery && [400, 403].includes(reply.statusCode))) await recordHit(ctx, `miss:${req.ip}`, MISS_WINDOW_MS);
  });

  // A NUL byte in a path parameter is never a real link. `merchantId` is always a uuid, so a malformed one is caught here with a clear "shop" 404.
  // Other `*Id` params are not checked by name: some are catalog or provider ids ("whatsapp_1000", "diwali", Stripe "pi_…"). A malformed uuid that
  // reaches the database instead fails with Postgres 22P02, which the error handler below answers as 404, never 500.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  app.addHook("preValidation", async (req) => {
    const params = (req.params ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === "string" && v.includes("\u0000")) throw notFound("page");
      if (k === "merchantId" && (typeof v !== "string" || !UUID.test(v))) throw notFound("Merchant");
    }
  });

  // Route templates by method, so an unknown path (404) can be told from a known path with the wrong method (405).
  const known: { method: string; re: RegExp }[] = [];
  app.addHook("onRoute", (r) => {
    const re = new RegExp(`^${r.url.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/:[A-Za-z0-9_]+/g, "[^/]+").replace(/\*/g, ".*")}/?$`);
    for (const m of ([] as string[]).concat(r.method)) known.push({ method: m, re });
  });
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split("?")[0]!;
    const allowed = [...new Set(known.filter((k) => k.re.test(path) && k.method !== "HEAD" && k.method !== "OPTIONS").map((k) => k.method))];
    if (allowed.length && !allowed.includes(req.method)) {
      return reply.status(405).header("allow", allowed.join(", ")).send({ error: { code: "method_not_allowed", message: "That isn't something this address can do." } });
    }
    return reply.status(404).send({ error: { code: "not_found", message: "We couldn't find that page." } });
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
      const retryAfter = err.statusCode === 429 ? (details as { retryAfterSec?: unknown } | undefined)?.retryAfterSec : undefined;
      if (typeof retryAfter === "number" && retryAfter > 0) reply.header("retry-after", String(Math.ceil(retryAfter)));
      // A customer on a public page cannot upgrade a plan: the owner-facing "isn't on your plan yet" becomes something they can act on.
      const message = err.code === "feature_locked" && req.url.startsWith("/v1/public/") ? "This shop doesn't take that online yet. Call the shop to ask." : err.message;
      return reply.status(err.statusCode).send({ error: { code: err.code, message, details } });
    }
    const e = err as { statusCode?: number; message?: string; validation?: unknown };
    if (e.statusCode && e.statusCode < 500) {
      const framework = (err as { code?: string }).code ?? "";
      if (e.statusCode === 429) {
        // @fastify/rate-limit: the library's English sentence is not shown; the wait is in Retry-After and details.
        const wait = Number(reply.getHeader("retry-after")) || undefined;
        return reply.status(429).send({ error: { code: "rate_limited", message: "Too many requests. Wait a moment and try again.", details: wait ? { retryAfterSec: wait } : undefined } });
      }
      const [code, message] =
        e.statusCode === 413 ? ["payload_too_large", "That is too large to send. Use a smaller file or shorter text."]
        : e.statusCode === 415 ? ["unsupported_media_type", "We couldn't read that kind of request."]
        : e.statusCode === 404 ? ["not_found", "We couldn't find that page."]
        : e.statusCode === 401 ? ["unauthorized", "Please sign in to continue."]
        : e.statusCode === 403 ? ["forbidden", "You don't have access to this."]
        : framework.startsWith("FST_ERR_CTP") || e.validation ? ["bad_request", "We couldn't read that request. Reload and try again."]
        : ["bad_request", "We couldn't read that request. Reload and try again."];
      return reply.status(e.statusCode).send({ error: { code, message } });
    }
    // A path id that is not a uuid fails in Postgres with 22P02 (invalid text representation): that link does not exist.
    const pg = err as { code?: string; cause?: { code?: string } };
    if (pg.code === "22P02" || pg.cause?.code === "22P02") return reply.status(404).send({ error: { code: "not_found", message: "We couldn't find that page." } });
    req.log.error(err);
    if (ctx.config.env !== "production") console.error(err);
    return reply.status(500).send({ error: { code: "internal", message: "Something went wrong on our end. Try again in a moment." } });
  });

  // Admin performance page: route-template latency, no PII (lib/metrics.ts). The timer runs outside tests; tests flush by hand.
  installMetrics(app, { db: ctx.db, now: ctx.now, timer: ctx.config.env !== "test" });
  // /health is liveness: cheap, never touches the database. /ready is readiness: a load balancer sends traffic only while the database answers.
  app.get("/health", async () => ({ ok: true, time: ctx.now().toISOString() }));
  app.get("/ready", async (_req, reply) => {
    try {
      await Promise.race([ctx.db.execute(sql`select 1`), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000).unref())]);
    } catch (err) {
      app.log.error({ err }, "readiness check failed");
      return reply.status(503).send({ error: { code: "not_ready", message: "The database isn't answering yet." }, ok: false });
    }
    return { ok: true, time: ctx.now().toISOString(), jobs: jobsStatus() };
  });
  await app.register(async (v1) => registerRoutes(v1, ctx), { prefix: "/v1" });
  return app;
}
