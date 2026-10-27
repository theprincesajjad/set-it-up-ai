/** The pre-order cancel rule: free until N hours before pickup, then the deposit is kept (the shop can still cancel and refund). */
import { eq } from "drizzle-orm";
import { merchants } from "@ll/db";
import { restaurantWebApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { writeAudit } from "./admin-audit.js";
import { requireAnyFeature, PREORDER_FEATURES } from "./features.js";

type Merchant = typeof merchants.$inferSelect;

export async function getCancelRule(ctx: AppContext, merchant: Merchant): Promise<restaurantWebApi.CancelRuleResponse> {
  await requireAnyFeature(ctx.db, merchant, PREORDER_FEATURES);
  return { cancelCutoffHours: merchant.preorderCancelCutoffHours };
}

export async function setCancelRule(ctx: AppContext, merchant: Merchant, actorUserId: string, input: unknown): Promise<restaurantWebApi.CancelRuleResponse> {
  await requireAnyFeature(ctx.db, merchant, PREORDER_FEATURES);
  const b = restaurantWebApi.cancelRuleBody.parse(input);
  await ctx.db.update(merchants).set({ preorderCancelCutoffHours: b.cancelCutoffHours, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "preorders.cancel_rule", entity: "merchant", entityId: merchant.id, data: b });
  return { cancelCutoffHours: b.cancelCutoffHours };
}
