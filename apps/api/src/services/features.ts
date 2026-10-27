import { and, eq, inArray, sql } from "drizzle-orm";
import { featureInterest, featureOverrides, featureRollouts, merchantAddOns, merchants } from "@ll/db";
import { FEATURE_KEYS, FEATURES, isFeatureEnabled, type FeatureKey, type PlanId, type RolloutStage } from "@ll/shared";
import type { DbOrTx } from "@ll/db";
import { HttpError, featureLocked, notFound } from "../lib/errors.js";
import { rowsOf } from "../lib/sql.js";


type Merchant = Pick<typeof merchants.$inferSelect, "id" | "plan" | "betaOptIn"> & { restaurantTier?: (typeof merchants.$inferSelect)["restaurantTier"]; vertical?: string | null };

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


interface FeatureInputs {
  stages: Map<string, string>;
  overrides: Map<string, boolean>;
  addOns: Map<string, string[]>;
}

/**
 * Everything feature resolution needs (rollout stages, per-merchant overrides, active add-ons) in ONE round trip:
 * three scalar sub-selects returning JSON. `keys` narrows the overrides read (all keys when omitted).
 */
async function loadFeatureInputs(db: DbOrTx, merchantIds: string[], keys?: readonly FeatureKey[]): Promise<FeatureInputs> {
  const ids = sql.join(merchantIds.map((i) => sql`${i}`), sql`, `);
  const keyFilter = keys?.length ? sql` and key in (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})` : sql``;
  const res = await db.execute(sql`
    select
      (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'stage', stage)), '[]'::jsonb) from feature_rollouts) as rollouts,
      (select coalesce(jsonb_agg(jsonb_build_object('merchantId', merchant_id, 'key', key, 'enabled', enabled)), '[]'::jsonb) from feature_overrides where merchant_id in (${ids})${keyFilter}) as overrides,
      (select coalesce(jsonb_agg(jsonb_build_object('merchantId', merchant_id, 'addOnId', add_on_id)), '[]'::jsonb) from merchant_add_ons where merchant_id in (${ids}) and status = 'active') as add_ons`);
  const row = rowsOf<Record<string, unknown>>(res)[0] ?? {};
  const arr = <T>(v: unknown): T[] => (typeof v === "string" ? (JSON.parse(v) as T[]) : ((v as T[] | null) ?? []));
  const addOns = new Map<string, string[]>();
  for (const a of arr<{ merchantId: string; addOnId: string }>(row.add_ons)) addOns.set(a.merchantId, [...(addOns.get(a.merchantId) ?? []), a.addOnId]);
  return {
    stages: new Map(arr<{ key: string; stage: string }>(row.rollouts).map((r) => [r.key, r.stage])),
    overrides: new Map(arr<{ merchantId: string; key: string; enabled: boolean }>(row.overrides).map((o) => [`${o.merchantId}:${o.key}`, o.enabled])),
    addOns,
  };
}

const stageOf = (inputs: FeatureInputs, key: FeatureKey) => (inputs.stages.get(key) as RolloutStage | undefined) ?? FEATURES[key].defaultStage;

export interface FeatureState {
  key: FeatureKey;
  enabled: boolean;
  stage: RolloutStage;
  minPlan: PlanId;
  /** Why it's off: not on plan, or not rolled out yet. */
  lockedReason: "plan" | "rollout" | null;
}

export async function getMerchantFeatures(db: DbOrTx, merchant: Merchant): Promise<Record<FeatureKey, FeatureState>> {
  const inputs = await loadFeatureInputs(db, [merchant.id]);
  const out = {} as Record<FeatureKey, FeatureState>;
  for (const key of FEATURE_KEYS) {
    const stage = stageOf(inputs, key);
    const enabled = isFeatureEnabled(key, { plan: merchant.plan, restaurantTier: merchant.restaurantTier, vertical: merchant.vertical, addOns: inputs.addOns.get(merchant.id), stage, betaOptIn: merchant.betaOptIn, override: inputs.overrides.get(`${merchant.id}:${key}`) ?? null });
    const lockedReason = enabled ? null : stage === "hidden" || (stage === "beta" && !merchant.betaOptIn) ? "rollout" : "plan";
    out[key] = { key, enabled, stage, minPlan: FEATURES[key].minPlan, lockedReason };
  }
  return out;
}

/** Throws 402 feature_locked unless the merchant can use the feature. */
export async function requireFeature(db: DbOrTx, merchant: Merchant, key: FeatureKey): Promise<void> {
  requireFeatureFrom(await getMerchantFeatures(db, merchant), key);
}

/** Same check against features already resolved by the caller (each resolution is one query). */
export function requireFeatureFrom(features: Record<FeatureKey, FeatureState>, key: FeatureKey): void {
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
 * Batched: which of `keys` each merchant has enabled. One query (rollouts, overrides and add-ons together)
 * for any number of merchants (use it on customer-facing lists).
 */
export async function enabledFeaturesFor(db: DbOrTx, list: Merchant[], keys: readonly FeatureKey[]): Promise<Map<string, Set<FeatureKey>>> {
  const out = new Map<string, Set<FeatureKey>>();
  if (!list.length || !keys.length) return out;
  const inputs = await loadFeatureInputs(db, list.map((m) => m.id), keys);
  for (const m of list) {
    const on = new Set<FeatureKey>();
    for (const key of keys) {
      if (isFeatureEnabled(key, { plan: m.plan, restaurantTier: m.restaurantTier, vertical: m.vertical, addOns: inputs.addOns.get(m.id), stage: stageOf(inputs, key), betaOptIn: m.betaOptIn, override: inputs.overrides.get(`${m.id}:${key}`) ?? null })) on.add(key);
    }
    out.set(m.id, on);
  }
  return out;
}

/** Same as enabledFeaturesFor, when only merchant ids are at hand. */
export async function enabledFeaturesByMerchantId(db: DbOrTx, ids: string[], keys: readonly FeatureKey[]): Promise<Map<string, Set<FeatureKey>>> {
  if (!ids.length) return new Map();
  const rows = await db.select({ id: merchants.id, plan: merchants.plan, betaOptIn: merchants.betaOptIn, restaurantTier: merchants.restaurantTier, vertical: merchants.vertical }).from(merchants).where(inArray(merchants.id, [...new Set(ids)]));
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

/**
 * Pre-orders run on one engine: a restaurant's biryani pots (restaurant.degh_preorders) and a butcher counter's goats, cuts and
 * qurbani (grocery.counter_preorders) share caps, Eid rules, deposits, pick-up hours and the wait list.
 */
export const PREORDER_FEATURES = ["restaurant.degh_preorders", "grocery.counter_preorders"] as const satisfies readonly FeatureKey[];
/** The WhatsApp inbox (replies in the 24 hour window, pay links): restaurants and grocers. */
export const WHATSAPP_INBOX_FEATURES = ["restaurant.whatsapp_notifications", "grocery.whatsapp_orders"] as const satisfies readonly FeatureKey[];

/** Throws 402 feature_locked unless at least one of the features is on (the error names the first). */
export async function requireAnyFeature(db: DbOrTx, merchant: Merchant, keys: readonly FeatureKey[]): Promise<void> {
  const f = await getMerchantFeatures(db, merchant);
  if (keys.some((k) => f[k].enabled)) return;
  requireFeatureFrom(f, keys[0]!);
}

/** Never throws: is at least one of the features on? */
export async function isAnyFeatureOn(db: DbOrTx, merchant: Merchant, keys: readonly FeatureKey[]): Promise<boolean> {
  const on = (await enabledFeaturesFor(db, [merchant], keys)).get(merchant.id);
  return !!on && on.size > 0;
}
