/**
 * CSV export after leaving. Merchant agreement 2.1: whatever your plan, when you leave we give you an export of your
 * members and their visits at no charge for RETENTION.leaverExportDays (90). "Leave" means the shop closed
 * (merchant.status_changed to closed) or fell back to Free (billing.plan_changed to free, whether it was cancelled
 * now, at the end of the period, or by a failed payment). During the window the owner can download the members CSV
 * and the visits (activity) CSV even though the Pro feature (customers.csv_export) is off.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { auditLogs, type DbOrTx, type merchants } from "@ll/db";
import { RETENTION } from "@ll/shared";
import type { AppContext } from "../context.js";
import { HttpError } from "../lib/errors.js";
import { requireFeature } from "./features.js";

type Merchant = typeof merchants.$inferSelect;
const DAY = 86_400_000;

export interface ExportWindow {
  /** When the shop left (closed or fell back to Free), or null if it has not. */
  leftAt: Date | null;
  /** Last moment the free export works, or null. */
  until: Date | null;
}

export async function exportWindow(db: DbOrTx, merchant: Pick<Merchant, "id" | "plan" | "status" | "updatedAt">): Promise<ExportWindow> {
  const rows = await db
    .select({ action: auditLogs.action, data: auditLogs.data, createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(and(eq(auditLogs.merchantId, merchant.id), inArray(auditLogs.action, ["billing.plan_changed", "merchant.status_changed"])))
    .orderBy(desc(auditLogs.createdAt));
  let leftAt: Date | null = null;
  if (merchant.status === "closed") {
    leftAt = rows.find((r) => r.action === "merchant.status_changed" && (r.data as { to?: string } | null)?.to === "closed")?.createdAt ?? merchant.updatedAt;
  } else if (merchant.plan === "free") {
    leftAt = rows.find((r) => r.action === "billing.plan_changed" && (r.data as { to?: string } | null)?.to === "free")?.createdAt ?? null;
  }
  return { leftAt, until: leftAt ? new Date(leftAt.getTime() + RETENTION.leaverExportDays * DAY) : null };
}

/** Throws 402 feature_locked unless the plan includes CSV export or the shop left within the last 90 days. */
export async function requireCsvExport(ctx: AppContext, merchant: Merchant): Promise<{ viaLeaverWindow: boolean }> {
  try {
    await requireFeature(ctx.db, merchant, "customers.csv_export");
    return { viaLeaverWindow: false };
  } catch (err) {
    if (!(err instanceof HttpError) || err.statusCode !== 402) throw err;
    const w = await exportWindow(ctx.db, merchant);
    if (w.until && ctx.now() < w.until) return { viaLeaverWindow: true };
    throw err;
  }
}
