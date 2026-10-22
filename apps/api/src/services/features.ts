import { and, eq, inArray } from "drizzle-orm";
import { featureInterest, featureOverrides, featureRollouts, type merchants } from "@ll/db";
import { FEATURE_KEYS, FEATURES, isFeatureEnabled, type FeatureKey, type PlanId, type RolloutStage } from "@ll/shared";
import type { DbOrTx } from "@ll/db";
import { HttpError, featureLocked, notFound } from "../lib/errors.js";

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

/**
 * "Notify me" for a coming-soon feature (stage hidden or beta). One row per
 * merchant + feature (idempotent); admins see the count in GET /v1/admin/features.
 */
export async function recordFeatureInterest(
  db: DbOrTx,
  merchantId: string,
  key: string,
  userId: string,
  now: Date,
): Promise<{ key: FeatureKey; interested: true; createdAt: string; created: boolean }> {
  if (!(FEATURE_KEYS as readonly string[]).includes(key)) throw notFound("Feature");
  const k = key as FeatureKey;
  const stage = (await getRolloutStages(db))[k];
  if (stage === "ga") throw new HttpError(409, "feature_released", `${FEATURES[k].name} is already available`);
  const [inserted] = await db.insert(featureInterest).values({ merchantId, featureKey: k, userId, createdAt: now }).onConflictDoNothing().returning();
  const row =
    inserted ?? (await db.select().from(featureInterest).where(and(eq(featureInterest.merchantId, merchantId), eq(featureInterest.featureKey, k))).limit(1))[0]!;
  return { key: k, interested: true, createdAt: row.createdAt.toISOString(), created: !!inserted };
}

/** Customer-facing entry points per shop (enabled features only), so apps don't probe for 402s. */
export interface CustomerFeatures {
  orderAhead: boolean;
  pickupSlots: boolean;
  serviceTickets: boolean;
  inAppPayments: boolean;
}
const CUSTOMER_FEATURE_KEYS = {
  orderAhead: "orders.order_ahead",
  pickupSlots: "booking.pickup_slots",
  serviceTickets: "service.tickets",
  inAppPayments: "payments.in_app",
} as const satisfies Record<keyof CustomerFeatures, FeatureKey>;

/** Batched: one rollout read + one overrides read for any number of merchants. */
export async function customerFeaturesFor(db: DbOrTx, list: Merchant[]): Promise<Map<string, CustomerFeatures>> {
  const out = new Map<string, CustomerFeatures>();
  if (!list.length) return out;
  const keys = Object.values(CUSTOMER_FEATURE_KEYS) as FeatureKey[];
  const [stages, overrides] = await Promise.all([
    getRolloutStages(db),
    db
      .select()
      .from(featureOverrides)
      .where(and(inArray(featureOverrides.merchantId, list.map((m) => m.id)), inArray(featureOverrides.key, keys))),
  ]);
  const ov = new Map(overrides.map((o) => [`${o.merchantId}:${o.key}`, o.enabled]));
  for (const m of list) {
    const on = (key: FeatureKey) => isFeatureEnabled(key, { plan: m.plan, stage: stages[key], betaOptIn: m.betaOptIn, override: ov.get(`${m.id}:${key}`) ?? null });
    out.set(m.id, {
      orderAhead: on(CUSTOMER_FEATURE_KEYS.orderAhead),
      pickupSlots: on(CUSTOMER_FEATURE_KEYS.pickupSlots),
      serviceTickets: on(CUSTOMER_FEATURE_KEYS.serviceTickets),
      inAppPayments: on(CUSTOMER_FEATURE_KEYS.inAppPayments),
    });
  }
  return out;
}
