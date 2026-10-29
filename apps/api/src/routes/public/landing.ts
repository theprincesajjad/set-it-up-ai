/**
 * Landing-page A/B tests, public side (docs/engineering/api/experiments.md):
 *  - POST /v1/public/landing-events: the page's beacon (no login). 60 a minute per IP (the IP is the limiter's key only and is
 *    never stored), body at most 2 KB, at most 10 events, unknown kinds dropped, bots dropped. Always 204 unless refused.
 *  - GET /v1/public/experiments: the tests ended from the admin page, for the web proxy's assignment (cached there a minute).
 */
import type { FastifyInstance } from "fastify";
import { EXPERIMENTS_CLOCK_HEADER, experimentsApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { tooMany } from "../../lib/errors.js";
import { allow } from "../../lib/rate-limit.js";
import { parse } from "../../lib/validate.js";
import { endedExperimentIds, recordLandingEvents } from "../../services/landing-events.js";

export const LANDING_EVENTS_PER_MINUTE = 60;

export default async function registerLanding(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post("/public/landing-events", { bodyLimit: experimentsApi.BEACON_MAX_BYTES }, async (req, reply) => {
    if (!(await allow(ctx, `landing-events:${req.ip}`, LANDING_EVENTS_PER_MINUTE, 60_000))) {
      throw tooMany("Too many requests. Try again in a minute.");
    }
    // sendBeacon may send the JSON as text/plain; accept either.
    const raw = typeof req.body === "string" ? safeJson(req.body) : req.body;
    const body = parse(experimentsApi.landingEventsBody, raw);
    await recordLandingEvents(ctx, body, { userAgent: req.headers["user-agent"] ?? null, clockHeader: req.headers[EXPERIMENTS_CLOCK_HEADER] });
    return reply.status(204).header("cache-control", "no-store").send();
  });

  app.get("/public/experiments", async (_req, reply): Promise<experimentsApi.PublicExperimentsState> => {
    reply.header("cache-control", "no-store");
    return { ended: await endedExperimentIds(ctx) };
  });
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
