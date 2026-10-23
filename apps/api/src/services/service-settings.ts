import { eq } from "drizzle-orm";
import { merchants } from "@ll/db";
import { DEFAULT_TIP_PRESETS, tipsEnabledFor, type serviceApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";

type Merchant = typeof merchants.$inferSelect;

export function serviceSettingsDto(m: Merchant): serviceApi.ServiceSettingsDto {
  return { intakeTerms: m.intakeTerms, warrantyDays: m.warrantyDays, tipsEnabled: m.tipsEnabled, tipsDefault: tipsEnabledFor(m.vertical, null), tipPresets: m.tipPresets?.length ? m.tipPresets : [...DEFAULT_TIP_PRESETS] };
}

export async function updateServiceSettings(ctx: AppContext, merchant: Merchant, body: z.infer<typeof serviceApi.serviceSettingsBody>) {
  const patch: Partial<typeof merchants.$inferInsert> = { updatedAt: ctx.now() };
  if (body.intakeTerms !== undefined) patch.intakeTerms = body.intakeTerms?.trim() || null;
  if (body.warrantyDays !== undefined) patch.warrantyDays = body.warrantyDays && body.warrantyDays > 0 ? body.warrantyDays : null;
  if (body.tipsEnabled !== undefined) patch.tipsEnabled = body.tipsEnabled;
  if (body.tipPresets !== undefined) patch.tipPresets = [...new Set(body.tipPresets)].sort((a, b) => a - b);
  const [row] = await ctx.db.update(merchants).set(patch).where(eq(merchants.id, merchant.id)).returning();
  return serviceSettingsDto(row!);
}
