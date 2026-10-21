import type { FastifyInstance } from "fastify";
import { notFound } from "../../lib/errors.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reject malformed ids in path params (`merchantId`, `memberId`, ...) with a
 * 404 before they reach Postgres (which would 500 on an invalid uuid).
 * Register inside an encapsulated plugin so it only affects that area's routes.
 */
export function rejectMalformedIds(app: FastifyInstance, except: string[] = []) {
  app.addHook("preValidation", async (req) => {
    const params = (req.params ?? {}) as Record<string, string>;
    for (const [k, v] of Object.entries(params)) {
      if (k.endsWith("Id") && !except.includes(k) && !UUID_RE.test(v)) throw notFound(k.slice(0, -2).replace(/^./, (c) => c.toUpperCase()));
    }
  });
}
