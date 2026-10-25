/**
 * The owner's data export: GET /merchants/:id/exports/:dataset.csv for one kind of record and /exports/all.zip for
 * everything (merchant agreement 2.1). Same access rule as the members CSV: a paid plan, or the 90-day window after
 * the shop left (services/leaver-export.ts). Every download is audited, because full phone numbers and
 * conversations leave the system.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { notFound } from "../../lib/errors.js";
import { writeAudit } from "../../services/admin-audit.js";
import { exportWindow, requireCsvExport } from "../../services/leaver-export.js";
import { buildExportCsv, buildExportZip, isExportKey } from "../../services/merchant-export.js";

type Req<P = object> = FastifyRequest<{ Params: { merchantId: string } & P }>;

export default async function registerExports(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const stamp = (now: Date) => now.toISOString().slice(0, 10);

  app.get("/merchants/:merchantId/exports/all.zip", async (req: Req, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await requireCsvExport(ctx, s.merchant);
    const w = await exportWindow(ctx.db, s.merchant);
    const { zip, files } = await buildExportZip(ctx, s.merchant, w);
    await writeAudit(ctx.db, { actorUserId: s.user.id, merchantId: s.merchant.id, action: "data.exported", entity: "merchant", entityId: s.merchant.id, data: { dataset: "all", files: files.length }, ip: req.ip });
    return reply.header("content-type", "application/zip").header("content-disposition", `attachment; filename="${s.merchant.slug}-customer-data-${stamp(ctx.now())}.zip"`).send(zip);
  });

  app.get("/merchants/:merchantId/exports/:file", async (req: Req<{ file: string }>, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const key = req.params.file.endsWith(".csv") ? req.params.file.slice(0, -4) : "";
    if (!isExportKey(key)) throw notFound("Export");
    await requireCsvExport(ctx, s.merchant);
    const csv = await buildExportCsv(ctx, s.merchant.id, key);
    await writeAudit(ctx.db, { actorUserId: s.user.id, merchantId: s.merchant.id, action: "data.exported", entity: "merchant", entityId: s.merchant.id, data: { dataset: key }, ip: req.ip });
    return reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="${s.merchant.slug}-${key}-${stamp(ctx.now())}.csv"`).send(csv);
  });
}
