import { eq } from "drizzle-orm";
import { featureOverrides, featureRollouts, type merchants } from "@ll/db";
import { FEATURE_KEYS, FEATURES, isFeatureEnabled, type FeatureKey, type PlanId, type RolloutStage } from "@ll/shared";
import type { DbOrTx } from "@ll/db";
import { featureLocked } from "../lib/errors.js";

type Merchant = Pick<typeof merchants.$inferSelect, "id" | "plan" | "betaOptIn">;

export async function getRolloutStages(db: DbOrTx): Promise<Record<FeatureKey, RolloutStage>> {
  const rows = await db.select().from(featureRollouts);
  const stored = new Map(rows.map((r) => [r.key, r.stage]));
  return Object.fromEntries(FEATURE_KEYS.map((k) => [k, (stored.get(k) as RolloutStage) ?? FEATURES[k].defaultStage])) as Record<
    FeatureKey,
    RolloutStage
  >;
}

export interface FeatureState {
  key: FeatureKey;
  enabled: boolean;
  stage: RolloutStage;
  minPlan: PlanId;
  /** Why it's off: not on plan, or not rolled out yet. */
  lockedReason: "plan" | "rollout" | null;
}

export async function getMerchantFeatures(db: DbOrTx, merchant: Merchant): Promise<Record<FeatureKey, FeatureState>> {
  const [stages, overrides] = await Promise.all([
    getRolloutStages(db),
    db.select().from(featureOverrides).where(eq(featureOverrides.merchantId, merchant.id)),
  ]);
  const ov = new Map(overrides.map((o) => [o.key, o.enabled]));
  const out = {} as Record<FeatureKey, FeatureState>;
  for (const key of FEATURE_KEYS) {
    const stage = stages[key];
    const enabled = isFeatureEnabled(key, { plan: merchant.plan, stage, betaOptIn: merchant.betaOptIn, override: ov.get(key) ?? null });
    const lockedReason = enabled ? null : stage === "hidden" || (stage === "beta" && !merchant.betaOptIn) ? "rollout" : "plan";
    out[key] = { key, enabled, stage, minPlan: FEATURES[key].minPlan, lockedReason };
  }
  return out;
}

/** Throws 402 feature_locked unless the merchant can use the feature. */
export async function requireFeature(db: DbOrTx, merchant: Merchant, key: FeatureKey): Promise<void> {
  const features = await getMerchantFeatures(db, merchant);
  const f = features[key];
  if (!f.enabled) throw featureLocked(FEATURES[key].name, f.lockedReason ?? "plan");
}
