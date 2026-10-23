import { and, eq, inArray } from "drizzle-orm";
import { featureInterest, featureOverrides, featureRollouts, merchantAddOns, merchants } from "@ll/db";
import { FEATURE_KEYS, FEATURES, isFeatureEnabled, type FeatureKey, type PlanId, type RolloutStage } from "@ll/shared";
import type { DbOrTx } from "@ll/db";
import { HttpError, featureLocked, notFound } from "../lib/errors.js";

type Merchant = Pick<typeof merchants.$inferSelect, "id" | "plan" | "betaOptIn"> & { restaurantTier?: (typeof merchants.$inferSelect)["restaurantTier"] };

/** Active add-on ids per merchant (merchant_add_ons.status = active). */
export async function activeAddOns(db: DbOrTx, merchantIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!merchantIds.length) return out;
  const rows = await db.select().from(merchantAddOns).where(and(inArray(merchantAddOns.merchantId, merchantIds), eq(merchantAddOns.status, "active")));
  for (const r of rows) out.set(r.merchantId, [...(out.get(r.merchantId) ?? []), r.addOnId]);
  return out;
}

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
  const [stages, overrides, addOns] = await Promise.all([
    getRolloutStages(db),
    db.select().from(featureOverrides).where(eq(featureOverrides.merchantId, merchant.id)),
    activeAddOns(db, [merchant.id]),
  ]);
  const ov = new Map(overrides.map((o) => [o.key, o.enabled]));
  const out = {} as Record<FeatureKey, FeatureState>;
  for (const key of FEATURE_KEYS) {
    const stage = stages[key];
    const enabled = isFeatureEnabled(key, { plan: merchant.plan, restaurantTier: merchant.restaurantTier, addOns: addOns.get(merchant.id), stage, betaOptIn: merchant.betaOptIn, override: ov.get(key) ?? null });
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

/** Is one feature on for this merchant (plan + rollout + admin override)? Never throws. */
export async function isFeatureOn(db: DbOrTx, merchant: Merchant, key: FeatureKey): Promise<boolean> {
  return (await enabledFeaturesFor(db, [merchant], [key])).get(merchant.id)?.has(key) ?? false;
}

/**
 * Batched: which of `keys` each merchant has enabled. One rollout read + one
 * overrides read for any number of merchants (use it on customer-facing lists).
 */
export async function enabledFeaturesFor(db: DbOrTx, list: Merchant[], keys: readonly FeatureKey[]): Promise<Map<string, Set<FeatureKey>>> {
  const out = new Map<string, Set<FeatureKey>>();
  if (!list.length || !keys.length) return out;
  const [stages, overrides, addOns] = await Promise.all([
    getRolloutStages(db),
    db
      .select()
      .from(featureOverrides)
      .where(and(inArray(featureOverrides.merchantId, list.map((m) => m.id)), inArray(featureOverrides.key, [...keys]))),
    activeAddOns(db, list.map((m) => m.id)),
  ]);
  const ov = new Map(overrides.map((o) => [`${o.merchantId}:${o.key}`, o.enabled]));
  for (const m of list) {
    const on = new Set<FeatureKey>();
    for (const key of keys) {
      if (isFeatureEnabled(key, { plan: m.plan, restaurantTier: m.restaurantTier, addOns: addOns.get(m.id), stage: stages[key], betaOptIn: m.betaOptIn, override: ov.get(`${m.id}:${key}`) ?? null })) on.add(key);
    }
    out.set(m.id, on);
  }
  return out;
}

/** Same as enabledFeaturesFor, when only merchant ids are at hand. */
export async function enabledFeaturesByMerchantId(db: DbOrTx, ids: string[], keys: readonly FeatureKey[]): Promise<Map<string, Set<FeatureKey>>> {
  if (!ids.length) return new Map();
  const rows = await db.select({ id: merchants.id, plan: merchants.plan, betaOptIn: merchants.betaOptIn, restaurantTier: merchants.restaurantTier }).from(merchants).where(inArray(merchants.id, [...new Set(ids)]));
  return enabledFeaturesFor(db, rows, keys);
}

/** Which promo kinds need which feature: boosts (multiplier / bonus points) need promos.double_points. */
export function promoFeature(kind: string): FeatureKey {
  return kind === "multiplier" || kind === "bonus_points" ? "promos.double_points" : "promos.basic";
}

/** Customer-facing entry points per shop (enabled features only), so apps don't probe for 402s. */
export interface CustomerFeatures {
  orderAhead: boolean;
  pickupSlots: boolean;
  serviceTickets: boolean;
  /** Customers can book a drop-off time (booking.dropoff_scheduling). */
  dropoffScheduling: boolean;
  /** Customers can book a stylist and a time (booking.appointments). */
  appointments: boolean;
  inAppPayments: boolean;
  /** Paid (Plus): promos in the feed / shop page, discount cards, referrals, VIP levels, birthday points. */
  promos: boolean;
  discountCards: boolean;
  referrals: boolean;
  vipLevels: boolean;
  birthdayBonus: boolean;
  /** Restaurant pack entry points. */
  tiffin: boolean;
  catering: boolean;
  banquet: boolean;
  whatsapp: boolean;
  dietaryTags: boolean;
}
const CUSTOMER_FEATURE_KEYS = {
  orderAhead: "orders.order_ahead",
  pickupSlots: "booking.pickup_slots",
  serviceTickets: "service.tickets",
  dropoffScheduling: "booking.dropoff_scheduling",
  appointments: "booking.appointments",
  inAppPayments: "payments.in_app",
  promos: "promos.basic",
  discountCards: "discount_cards",
  referrals: "loyalty.referrals",
  vipLevels: "loyalty.vip_levels",
  birthdayBonus: "loyalty.birthday_bonus",
  tiffin: "restaurant.tiffin",
  catering: "restaurant.catering",
  banquet: "restaurant.banquet",
  whatsapp: "restaurant.whatsapp_notifications",
  dietaryTags: "restaurant.dietary_tags",
} as const satisfies Record<keyof CustomerFeatures, FeatureKey>;

/** Batched: one rollout read + one overrides read for any number of merchants. */
export async function customerFeaturesFor(db: DbOrTx, list: Merchant[]): Promise<Map<string, CustomerFeatures>> {
  const out = new Map<string, CustomerFeatures>();
  const on = await enabledFeaturesFor(db, list, Object.values(CUSTOMER_FEATURE_KEYS));
  for (const m of list) {
    const set = on.get(m.id) ?? new Set<FeatureKey>();
    out.set(m.id, Object.fromEntries(Object.entries(CUSTOMER_FEATURE_KEYS).map(([k, key]) => [k, set.has(key)])) as unknown as CustomerFeatures);
  }
  return out;
}
