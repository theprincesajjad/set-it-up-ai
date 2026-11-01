/**
 * The founder's cockpit (team admin, wave N), registered inside the admin plugin (routes/admin/index.ts), so the platform-role check
 * there runs first. On top of it every route here re-reads the caller's role from the database: an admin demoted a minute ago
 * whose access token is still valid gets a 403, because these pages list every business.
 *
 *   GET /v1/admin/cockpit?days=7|30|90
 *   GET /v1/admin/businesses?q&trade&plan&city&status&signedFrom&signedTo&activeWithin&sort&dir&limit&offset[&format=csv]
 *   GET /v1/admin/businesses/:merchantId         (written to the audit log)
 *   GET /v1/admin/funnel?days&by=page|variant|source|device
 *   GET /v1/admin/health
 *   GET /v1/admin/performance?hours
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users } from "@ll/db";
import { adminCockpitApi as api } from "@ll/shared";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { requirePlatformRole } from "../../lib/auth.js";
import { forbidden } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import * as cockpit from "../../services/admin-cockpit.js";
import { performanceReport } from "../../services/admin-performance.js";
import { toCsv } from "../../services/csv.js";

export default async function cockpitRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.addHook("preHandler", async (req) => {
    const u = requirePlatformRole(req, "admin");
    const [row] = await ctx.db.select({ role: users.platformRole, deletedAt: users.deletedAt }).from(users).where(eq(users.id, u.id)).limit(1);
    if (!row || row.deletedAt || row.role !== "admin") throw forbidden();
  });
  const actor = (req: FastifyRequest) => requirePlatformRole(req, "admin").id;

  app.get("/admin/cockpit", async (req) => cockpit.cockpit(ctx, parse(api.cockpitQuery, req.query).days as api.CockpitPeriod));

  app.get("/admin/businesses", async (req, reply) => {
    const { format, ...rest } = parse(api.listBusinessesQuery.extend({ format: z.enum(["json", "csv"]).default("json") }), req.query);
    if (format === "csv") {
      const all = await cockpit.listBusinesses(ctx, { ...rest, offset: 0, limit: 100_000 });
      const day = ctx.now().toISOString().slice(0, 10);
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="businesses-${day}.csv"`)
        .header("cache-control", "no-store")
        .send(toCsv(cockpit.BUSINESS_CSV_HEADERS, cockpit.businessCsvRows(all.items)));
    }
    return cockpit.listBusinesses(ctx, rest);
  });

  app.get("/admin/businesses/:merchantId", async (req: FastifyRequest<{ Params: { merchantId: string } }>) => cockpit.businessDetail(ctx, actor(req), req.params.merchantId, req.ip));

  app.get("/admin/funnel", async (req) => {
    const q = parse(api.funnelQuery, req.query);
    return cockpit.landingFunnel(ctx, q.days as api.CockpitPeriod, q.by);
  });

  app.get("/admin/health", async () => cockpit.healthReport(ctx));

  app.get("/admin/performance", async (req) => performanceReport(ctx, parse(api.performanceQuery, req.query).hours, app.metrics?.snapshot()));
}
