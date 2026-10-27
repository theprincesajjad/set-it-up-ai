/**
 * Loyalty program configuration: program rules, rewards catalog, VIP levels,
 * categories (incl. regulated no-earn ones), discount cards, promos, locations.
 * Every query is scoped by merchant_id.
 */
import { and, asc, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import {
  catalogItems,
  discountCards,
  locations,
  loyaltyPrograms,
  merchantCategories,
  merchantMembers,
  merchants,
  promos,
  redemptions,
  rewards,
  vipLevels,
  type DbOrTx,
} from "@ll/db";
import { merchantApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { writeAudit } from "./admin-audit.js";
import { requireFeature } from "./features.js";
import { iso, serializeLocation, serializeProgram, uniqueQrCode } from "./merchant.js";
import { assertPharmacyText, isPharmacy, pharmacyVisitEarnError } from "./pharmacy-guard.js";
import { isDispensaryCategoryName } from "@ll/shared";

/** The shop's vertical, for the pharmacy guards below (one small read). */
async function verticalOf(db: DbOrTx, merchantId: string): Promise<{ vertical: string }> {
  const [m] = await db.select({ vertical: merchants.vertical }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  return m ?? { vertical: "" };
}

type Body<T extends z.ZodType> = z.infer<T>;

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------
export async function getProgram(db: DbOrTx, merchantId: string) {
  const [p] = await db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId)).limit(1);
  if (!p) throw notFound("Loyalty program");
  return serializeProgram(p);
}

export async function updateProgram(ctx: AppContext, merchantId: string, actorUserId: string, body: merchantApi.UpdateProgramBody) {
  const [current] = await ctx.db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId)).limit(1);
  if (!current) throw notFound("Loyalty program");
  if (body.expiryMonths !== undefined && body.expiryMonths !== null && body.expiryMonths < 12) {
    throw badRequest("Points expiry must be at least 12 months of inactivity");
  }
  const next = { ...current, ...body };
  // Pharmacies earn on front-store dollars only: a visit or a stamp may include a prescription.
  if (isPharmacy(await verticalOf(ctx.db, merchantId)) && next.earnType !== "per_dollar") throw pharmacyVisitEarnError();
  if (next.earnType === "per_dollar" && next.pointsPerDollar < 1) throw badRequest("Points per dollar must be at least 1");
  if (next.earnType !== "per_dollar" && next.pointsPerVisit < 1) throw badRequest("Points per visit must be at least 1");
  if (next.earnType === "stamps" && next.stampGoal < 1) throw badRequest("Set how many stamps earn the reward");
  // Stamp on scan never applies to per-dollar programs (the amount must be typed).
  if (next.earnType === "per_dollar") body = { ...body, counterAutoStamp: false };
  const [p] = await ctx.db
    .update(loyaltyPrograms)
    .set({ ...body, updatedAt: ctx.now() })
    .where(eq(loyaltyPrograms.merchantId, merchantId))
    .returning();
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "program.updated", entity: "loyalty_program", entityId: p!.id, data: body });
  return serializeProgram(p!);
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------
type RewardRow = typeof rewards.$inferSelect;
const serializeReward = (r: RewardRow): merchantApi.Reward => ({
  id: r.id,
  name: r.name,
  description: r.description,
  pointsCost: r.pointsCost,
  rewardType: r.rewardType,
  value: r.value,
  maxDiscountCents: r.maxDiscountCents,
  catalogItemId: r.catalogItemId,
  imageUrl: r.imageUrl,
  active: r.active,
  sortOrder: r.sortOrder,
  createdAt: r.createdAt.toISOString(),
});

function validateReward(r: { rewardType?: string; value?: number }) {
  if (r.rewardType === "percent_off" && (r.value === undefined || r.value < 1 || r.value > 100)) throw badRequest("Percent-off rewards need a value between 1 and 100");
  if (r.rewardType === "amount_off" && (r.value === undefined || r.value < 1)) throw badRequest("Amount-off rewards need a value in cents");
}

export async function listRewards(db: DbOrTx, merchantId: string) {
  const rows = await db.select().from(rewards).where(eq(rewards.merchantId, merchantId)).orderBy(asc(rewards.sortOrder), asc(rewards.pointsCost));
  return rows.map(serializeReward);
}

async function getReward(db: DbOrTx, merchantId: string, id: string) {
  const [r] = await db.select().from(rewards).where(and(eq(rewards.id, id), eq(rewards.merchantId, merchantId))).limit(1);
  if (!r) throw notFound("Reward");
  return r;
}

async function checkRewardText(ctx: AppContext, merchantId: string, r: { name?: string | null; description?: string | null }) {
  if (!r.name && !r.description) return;
  const shop = await verticalOf(ctx.db, merchantId);
  assertPharmacyText(shop, r.name, "The reward name");
  assertPharmacyText(shop, r.description, "The reward description");
}

export async function createReward(ctx: AppContext, merchantId: string, actorUserId: string, body: Body<typeof merchantApi.createRewardBody>) {
  validateReward(body);
  await checkRewardText(ctx, merchantId, body);
  const [r] = await ctx.db.insert(rewards).values({ merchantId, ...body }).returning();
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "reward.created", entity: "reward", entityId: r!.id });
  return serializeReward(r!);
}

export async function updateReward(ctx: AppContext, merchantId: string, actorUserId: string, id: string, body: Body<typeof merchantApi.updateRewardBody>) {
  const cur = await getReward(ctx.db, merchantId, id);
  validateReward({ rewardType: body.rewardType ?? cur.rewardType, value: body.value ?? cur.value });
  await checkRewardText(ctx, merchantId, body);
  const [r] = await ctx.db.update(rewards).set(body).where(and(eq(rewards.id, id), eq(rewards.merchantId, merchantId))).returning();
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "reward.updated", entity: "reward", entityId: id, data: body });
  return serializeReward(r!);
}

/** Hard-deletes unused rewards; rewards with redemptions are deactivated to keep history. */
export async function deleteReward(ctx: AppContext, merchantId: string, actorUserId: string, id: string) {
  await getReward(ctx.db, merchantId, id);
  const [used] = await ctx.db.select({ id: redemptions.id }).from(redemptions).where(eq(redemptions.rewardId, id)).limit(1);
  if (used) await ctx.db.update(rewards).set({ active: false }).where(eq(rewards.id, id));
  else await ctx.db.delete(rewards).where(and(eq(rewards.id, id), eq(rewards.merchantId, merchantId)));
  await writeAudit(ctx.db, { actorUserId, merchantId, action: used ? "reward.archived" : "reward.deleted", entity: "reward", entityId: id });
  return { deleted: !used, archived: !!used };
}

// ---------------------------------------------------------------------------
// VIP levels
// ---------------------------------------------------------------------------
/** Re-derive every member's VIP level from lifetime points (no points change). */
export async function recomputeVipLevels(db: DbOrTx, merchantId: string) {
  await db.execute(sql`
    update merchant_members mm set vip_level_id = (
      select v.id from vip_levels v
      where v.merchant_id = mm.merchant_id and v.threshold_points <= mm.lifetime_points
      order by v.threshold_points desc limit 1
    ) where mm.merchant_id = ${merchantId}`);
}

export async function listVipLevels(db: DbOrTx, merchantId: string): Promise<merchantApi.VipLevel[]> {
  const rows = await db.select().from(vipLevels).where(eq(vipLevels.merchantId, merchantId)).orderBy(asc(vipLevels.thresholdPoints));
  const counts = await db
    .select({ id: merchantMembers.vipLevelId, n: count() })
    .from(merchantMembers)
    .where(and(eq(merchantMembers.merchantId, merchantId), isNotNull(merchantMembers.vipLevelId)))
    .groupBy(merchantMembers.vipLevelId);
  const byId = new Map(counts.map((c) => [c.id, Number(c.n)]));
  return rows.map((v) => ({ id: v.id, name: v.name, thresholdPoints: v.thresholdPoints, multiplierPct: v.multiplierPct, perks: v.perks, memberCount: byId.get(v.id) ?? 0, createdAt: v.createdAt.toISOString() }));
}

export async function createVipLevel(ctx: AppContext, merchantId: string, actorUserId: string, body: Body<typeof merchantApi.createVipLevelBody>) {
  const [v] = await ctx.db.insert(vipLevels).values({ merchantId, ...body }).returning();
  await recomputeVipLevels(ctx.db, merchantId);
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "vip_level.created", entity: "vip_level", entityId: v!.id });
  return (await listVipLevels(ctx.db, merchantId)).find((l) => l.id === v!.id)!;
}

export async function updateVipLevel(ctx: AppContext, merchantId: string, actorUserId: string, id: string, body: Body<typeof merchantApi.updateVipLevelBody>) {
  const [v] = await ctx.db.update(vipLevels).set(body).where(and(eq(vipLevels.id, id), eq(vipLevels.merchantId, merchantId))).returning();
  if (!v) throw notFound("VIP level");
  await recomputeVipLevels(ctx.db, merchantId);
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "vip_level.updated", entity: "vip_level", entityId: id, data: body });
  return (await listVipLevels(ctx.db, merchantId)).find((l) => l.id === id)!;
}

export async function deleteVipLevel(ctx: AppContext, merchantId: string, actorUserId: string, id: string) {
  await ctx.db.transaction(async (tx) => {
    const [v] = await tx.select({ id: vipLevels.id }).from(vipLevels).where(and(eq(vipLevels.id, id), eq(vipLevels.merchantId, merchantId))).limit(1);
    if (!v) throw notFound("VIP level");
    await tx.update(merchantMembers).set({ vipLevelId: null }).where(and(eq(merchantMembers.merchantId, merchantId), eq(merchantMembers.vipLevelId, id)));
    await tx.delete(vipLevels).where(eq(vipLevels.id, id));
    await recomputeVipLevels(tx, merchantId);
    await writeAudit(tx, { actorUserId, merchantId, action: "vip_level.deleted", entity: "vip_level", entityId: id });
  });
}

// ---------------------------------------------------------------------------
// Categories (no-earn protection)
// ---------------------------------------------------------------------------
/**
 * Regulated categories that can never earn points or be discounted.
 * Ontario: no loyalty inducements on prescriptions or pharmacy services
 * (O. Reg. 264/16 s. 34 under the Drug and Pharmacies Regulation Act, O. Reg. 130/17 s. 6 under the Pharmacy Act, 1991; OCP loyalty points policy); tobacco, lottery and gift cards likewise.
 */
const REGULATED = /(prescription|\brx\b|pharmacy services?|dispensing|tobacco|cigarette|vape|lottery|lotto|gift ?cards?)/i;
export const isRegulatedCategory = (name: string) => REGULATED.test(name);

type CategoryRow = typeof merchantCategories.$inferSelect;
const serializeCategory = (c: CategoryRow): merchantApi.Category => ({
  id: c.id,
  name: c.name,
  earnEligible: c.earnEligible,
  discountEligible: c.discountEligible,
  protected: c.dispensary || isRegulatedCategory(c.name),
  externalIds: c.externalIds,
  ...(Object.keys(c.translations ?? {}).length ? { translations: c.translations } : {}),
  createdAt: c.createdAt.toISOString(),
});

export const regulatedCategoryError = (name: string) =>
  new HttpError(
    422,
    "no_earn_category",
    `"${name}" is a regulated category and can never earn points or receive discounts (Ontario rules on prescriptions and pharmacy services; also tobacco, lottery and gift cards).`,
    { category: name },
  );

function assertCategoryAllowed(name: string, earnEligible: boolean, discountEligible: boolean, locked = false) {
  if ((locked || isRegulatedCategory(name)) && (earnEligible || discountEligible)) throw regulatedCategoryError(name);
}

export async function listCategories(db: DbOrTx, merchantId: string) {
  const rows = await db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, merchantId)).orderBy(asc(merchantCategories.createdAt), asc(merchantCategories.name));
  return rows.map(serializeCategory);
}

async function getCategory(db: DbOrTx, merchantId: string, id: string) {
  const [c] = await db.select().from(merchantCategories).where(and(eq(merchantCategories.id, id), eq(merchantCategories.merchantId, merchantId))).limit(1);
  if (!c) throw notFound("Category");
  return c;
}

/** Tab names in hi / ur / pa belong to the multilingual menu feature. */
async function requireTranslationsFeature(ctx: AppContext, merchantId: string) {
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  await requireFeature(ctx.db, m, "restaurant.multilingual_menu");
}

export async function createCategory(ctx: AppContext, merchantId: string, actorUserId: string, body: Body<typeof merchantApi.createCategoryBody>) {
  // Regulated names default to no-earn/no-discount; explicitly asking for earn/discount is an error.
  // At a pharmacy, anything that names the dispensary (medication, vaccine, blister pack...) is locked too, and stays locked if renamed.
  const dispensary = isPharmacy(await verticalOf(ctx.db, merchantId)) && isDispensaryCategoryName(body.name);
  const regulated = dispensary || isRegulatedCategory(body.name);
  const earnEligible = body.earnEligible ?? !regulated;
  const discountEligible = body.discountEligible ?? !regulated;
  assertCategoryAllowed(body.name, earnEligible, discountEligible, dispensary);
  if (body.translations) await requireTranslationsFeature(ctx, merchantId);
  const [c] = await ctx.db
    .insert(merchantCategories)
    .values({ merchantId, name: body.name, earnEligible, discountEligible, dispensary, externalIds: body.externalIds ?? {}, translations: body.translations ?? {} })
    .returning();
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "category.created", entity: "category", entityId: c!.id, data: body });
  return serializeCategory(c!);
}

export async function updateCategory(ctx: AppContext, merchantId: string, actorUserId: string, id: string, body: Body<typeof merchantApi.updateCategoryBody>) {
  const cur = await getCategory(ctx.db, merchantId, id);
  if (body.translations) await requireTranslationsFeature(ctx, merchantId);
  const nextEarn = body.earnEligible ?? cur.earnEligible;
  const nextDiscount = body.discountEligible ?? cur.discountEligible;
  // Renaming a protected category doesn't unlock it: check both old and new names.
  assertCategoryAllowed(cur.name, nextEarn, nextDiscount, cur.dispensary);
  if (body.name) assertCategoryAllowed(body.name, nextEarn, nextDiscount, cur.dispensary);
  if ((cur.dispensary || isRegulatedCategory(cur.name)) && body.name && body.name !== cur.name && (cur.dispensary || !isRegulatedCategory(body.name))) {
    throw new HttpError(422, "no_earn_category", `"${cur.name}" is a regulated category and can't be renamed.`, { category: cur.name });
  }
  const [c] = await ctx.db
    .update(merchantCategories)
    .set({ ...body, externalIds: body.externalIds ?? cur.externalIds })
    .where(and(eq(merchantCategories.id, id), eq(merchantCategories.merchantId, merchantId)))
    .returning();
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "category.updated", entity: "category", entityId: id, data: body });
  return serializeCategory(c!);
}

export async function deleteCategory(ctx: AppContext, merchantId: string, actorUserId: string, id: string) {
  const cur = await getCategory(ctx.db, merchantId, id);
  if (cur.dispensary || isRegulatedCategory(cur.name)) {
    throw new HttpError(422, "no_earn_category", `"${cur.name}" keeps regulated sales out of your loyalty program and can't be deleted.`, { category: cur.name });
  }
  const [item] = await ctx.db.select({ id: catalogItems.id }).from(catalogItems).where(eq(catalogItems.categoryId, id)).limit(1);
  if (item) throw conflict("Move catalog items out of this category before deleting it");
  const [promo] = await ctx.db.select({ id: promos.id }).from(promos).where(and(eq(promos.merchantId, merchantId), eq(promos.categoryId, id))).limit(1);
  if (promo) throw conflict("A promo targets this category; edit or archive it first");
  await ctx.db.delete(merchantCategories).where(and(eq(merchantCategories.id, id), eq(merchantCategories.merchantId, merchantId)));
  // Drop it from discount card exclusions.
  await ctx.db.execute(sql`
    update discount_cards set excluded_category_ids = coalesce((
      select jsonb_agg(e) from jsonb_array_elements(excluded_category_ids) e where e <> to_jsonb(${id}::text)
    ), '[]'::jsonb) where merchant_id = ${merchantId}`);
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "category.deleted", entity: "category", entityId: id });
}

// ---------------------------------------------------------------------------
// Discount cards
// ---------------------------------------------------------------------------
type CardRow = typeof discountCards.$inferSelect;
const serializeCard = (c: CardRow): merchantApi.DiscountCard => ({
  id: c.id,
  name: c.name,
  percentOff: c.percentOff,
  amountOffCents: c.amountOffCents,
  terms: c.terms,
  eligibility: c.eligibility as merchantApi.DiscountCard["eligibility"],
  excludedCategoryIds: c.excludedCategoryIds,
  active: c.active,
  createdAt: c.createdAt.toISOString(),
});

/** Validate excluded ids belong to the merchant, and always exclude non-discount-eligible categories. */
async function resolveExclusions(db: DbOrTx, merchantId: string, requested: string[]) {
  const cats = await db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, merchantId));
  const ids = new Set(cats.map((c) => c.id));
  for (const id of requested) if (!ids.has(id)) throw badRequest("Unknown category in exclusions");
  return [...new Set([...requested, ...cats.filter((c) => !c.discountEligible || c.dispensary).map((c) => c.id)])];
}

export async function listDiscountCards(db: DbOrTx, merchantId: string) {
  return (await db.select().from(discountCards).where(eq(discountCards.merchantId, merchantId)).orderBy(asc(discountCards.createdAt))).map(serializeCard);
}

async function checkCardText(ctx: AppContext, merchantId: string, b: { name?: string | null; terms?: string | null }) {
  const shop = await verticalOf(ctx.db, merchantId);
  assertPharmacyText(shop, b.name, "The card name");
  assertPharmacyText(shop, b.terms, "The card terms");
}

export async function createDiscountCard(ctx: AppContext, merchantId: string, actorUserId: string, body: Body<typeof merchantApi.createDiscountCardBody>) {
  if (!body.percentOff && !body.amountOffCents) throw badRequest("Set a percent or amount off");
  await checkCardText(ctx, merchantId, body);
  const excludedCategoryIds = await resolveExclusions(ctx.db, merchantId, body.excludedCategoryIds);
  const [c] = await ctx.db.insert(discountCards).values({ merchantId, ...body, excludedCategoryIds }).returning();
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "discount_card.created", entity: "discount_card", entityId: c!.id });
  return serializeCard(c!);
}

export async function updateDiscountCard(ctx: AppContext, merchantId: string, actorUserId: string, id: string, body: Body<typeof merchantApi.updateDiscountCardBody>) {
  const [cur] = await ctx.db.select().from(discountCards).where(and(eq(discountCards.id, id), eq(discountCards.merchantId, merchantId))).limit(1);
  if (!cur) throw notFound("Discount card");
  await checkCardText(ctx, merchantId, body);
  const excludedCategoryIds = await resolveExclusions(ctx.db, merchantId, body.excludedCategoryIds ?? cur.excludedCategoryIds);
  const [c] = await ctx.db.update(discountCards).set({ ...body, excludedCategoryIds }).where(eq(discountCards.id, id)).returning();
  if (!c!.percentOff && !c!.amountOffCents) throw badRequest("Set a percent or amount off");
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "discount_card.updated", entity: "discount_card", entityId: id, data: body });
  return serializeCard(c!);
}

export async function deleteDiscountCard(ctx: AppContext, merchantId: string, actorUserId: string, id: string) {
  const r = await ctx.db.delete(discountCards).where(and(eq(discountCards.id, id), eq(discountCards.merchantId, merchantId))).returning({ id: discountCards.id });
  if (!r.length) throw notFound("Discount card");
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "discount_card.deleted", entity: "discount_card", entityId: id });
}

// ---------------------------------------------------------------------------
// Promos
// ---------------------------------------------------------------------------
type PromoRow = typeof promos.$inferSelect;
export const serializePromo = (p: PromoRow): merchantApi.Promo => ({
  id: p.id,
  title: p.title,
  body: p.body,
  imageUrl: p.imageUrl,
  kind: p.kind,
  multiplierPct: p.multiplierPct,
  bonusPoints: p.bonusPoints,
  percentOff: p.percentOff,
  itemId: p.itemId,
  categoryId: p.categoryId,
  daysOfWeek: p.daysOfWeek,
  startTime: p.startTime,
  endTime: p.endTime,
  startsAt: p.startsAt.toISOString(),
  endsAt: iso(p.endsAt),
  audience: p.audience as merchantApi.Promo["audience"],
  status: p.status,
  viewCount: p.viewCount,
  claimCount: p.claimCount,
  createdAt: p.createdAt.toISOString(),
});

interface PromoShape {
  kind: PromoRow["kind"];
  multiplierPct?: number | null;
  bonusPoints?: number | null;
  percentOff?: number | null;
  categoryId?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  startTime?: string | null;
  endTime?: string | null;
}

async function validatePromo(db: DbOrTx, merchantId: string, p: PromoShape) {
  if (p.kind === "multiplier" && !p.multiplierPct) throw badRequest("Multiplier promos need multiplierPct (200 = double points)");
  if (p.kind === "bonus_points" && !p.bonusPoints) throw badRequest("Bonus point promos need bonusPoints");
  if (p.kind === "discount" && !p.percentOff) throw badRequest("Discount promos need percentOff");
  if (p.endsAt && p.endsAt <= p.startsAt) throw badRequest("End must be after start");
  if (p.startTime && p.endTime && p.endTime <= p.startTime) throw badRequest("End time must be after start time");
  if (p.categoryId) {
    const c = await getCategory(db, merchantId, p.categoryId).catch(() => {
      throw badRequest("Unknown category");
    });
    if ((p.kind === "multiplier" || p.kind === "bonus_points") && !c.earnEligible) throw regulatedCategoryError(c.name);
    if (p.kind === "discount" && !c.discountEligible) throw regulatedCategoryError(c.name);
  }
}

export async function listPromos(db: DbOrTx, merchantId: string, status?: merchantApi.PromoStatus) {
  const rows = await db
    .select()
    .from(promos)
    .where(and(eq(promos.merchantId, merchantId), status ? eq(promos.status, status) : undefined))
    .orderBy(desc(promos.startsAt));
  return rows.map(serializePromo);
}

export async function getPromo(db: DbOrTx, merchantId: string, id: string) {
  const [p] = await db.select().from(promos).where(and(eq(promos.id, id), eq(promos.merchantId, merchantId))).limit(1);
  if (!p) throw notFound("Promo");
  return p;
}

async function checkPromoText(ctx: AppContext, merchantId: string, p: { title?: string | null; body?: string | null }) {
  const shop = await verticalOf(ctx.db, merchantId);
  assertPharmacyText(shop, p.title, "The promo title");
  assertPharmacyText(shop, p.body, "The promo text");
}

export async function createPromo(ctx: AppContext, merchantId: string, actorUserId: string, body: Body<typeof merchantApi.createPromoBody>) {
  const { publish, startsAt, endsAt, ...rest } = body;
  const shape = { ...rest, startsAt: new Date(startsAt), endsAt: endsAt ? new Date(endsAt) : null };
  await checkPromoText(ctx, merchantId, rest);
  await validatePromo(ctx.db, merchantId, shape);
  const now = ctx.now();
  if (publish && shape.endsAt && shape.endsAt <= now) throw badRequest("This promo would already be over");
  const status = publish ? (shape.startsAt <= now ? "live" : "scheduled") : "draft";
  const [p] = await ctx.db.insert(promos).values({ merchantId, ...shape, status }).returning();
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "promo.created", entity: "promo", entityId: p!.id, data: { status } });
  return serializePromo(p!);
}

const LIVE_EDITABLE = new Set(["title", "body", "imageUrl", "endsAt"]);

export async function updatePromo(ctx: AppContext, merchantId: string, actorUserId: string, id: string, body: Body<typeof merchantApi.updatePromoBody>) {
  const cur = await getPromo(ctx.db, merchantId, id);
  if (cur.status === "ended" || cur.status === "archived") throw conflict(`An ${cur.status} promo can't be edited`);
  if (cur.status === "live") {
    const bad = Object.keys(body).filter((k) => !LIVE_EDITABLE.has(k));
    if (bad.length) throw conflict(`A live promo can only change its title, text, image or end date (not ${bad.join(", ")})`);
  }
  const { startsAt, endsAt, ...rest } = body;
  const set: Partial<typeof promos.$inferInsert> = { ...rest };
  if (startsAt !== undefined) set.startsAt = new Date(startsAt);
  if (endsAt !== undefined) set.endsAt = endsAt ? new Date(endsAt) : null;
  await checkPromoText(ctx, merchantId, rest);
  await validatePromo(ctx.db, merchantId, { ...cur, ...set } as PromoShape);
  const [p] = await ctx.db.update(promos).set(set).where(eq(promos.id, id)).returning();
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "promo.updated", entity: "promo", entityId: id, data: body });
  return serializePromo(p!);
}

export async function transitionPromo(ctx: AppContext, merchantId: string, actorUserId: string, id: string, to: merchantApi.PromoStatus) {
  const cur = await getPromo(ctx.db, merchantId, id);
  if (cur.status === to) return serializePromo(cur);
  if (!merchantApi.PROMO_TRANSITIONS[cur.status].includes(to)) {
    throw new HttpError(409, "invalid_transition", `Can't move a promo from ${cur.status} to ${to}`, { from: cur.status, to, allowed: merchantApi.PROMO_TRANSITIONS[cur.status] });
  }
  const now = ctx.now();
  const set: Partial<typeof promos.$inferInsert> = { status: to };
  if (to === "live" && cur.startsAt > now) set.startsAt = now;
  if (to === "scheduled" && cur.endsAt && cur.endsAt <= now) throw badRequest("This promo's end date has passed");
  if (to === "scheduled" && cur.startsAt <= now) set.status = "live";
  if (to === "ended" && (!cur.endsAt || cur.endsAt > now)) set.endsAt = now;
  const [p] = await ctx.db.update(promos).set(set).where(eq(promos.id, id)).returning();
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "promo.status_changed", entity: "promo", entityId: id, data: { from: cur.status, to: p!.status } });
  return serializePromo(p!);
}

export async function deletePromo(ctx: AppContext, merchantId: string, actorUserId: string, id: string) {
  const cur = await getPromo(ctx.db, merchantId, id);
  if (cur.status !== "draft") throw conflict("Only drafts can be deleted; archive it instead");
  await ctx.db.delete(promos).where(eq(promos.id, id));
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "promo.deleted", entity: "promo", entityId: id });
}

/** Job helper: scheduled → live at startsAt; live/scheduled → ended after endsAt. */
export async function advancePromoStatuses(db: DbOrTx, now: Date) {
  await db.execute(sql`update promos set status = 'ended' where status in ('scheduled','live') and ends_at is not null and ends_at <= ${now.toISOString()}::timestamptz`);
  await db.execute(sql`update promos set status = 'live' where status = 'scheduled' and starts_at <= ${now.toISOString()}::timestamptz`);
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------
export async function listLocations(ctx: AppContext, merchantId: string) {
  const rows = await ctx.db.select().from(locations).where(eq(locations.merchantId, merchantId)).orderBy(asc(locations.createdAt), asc(locations.id));
  return rows.map((l) => serializeLocation(ctx, l));
}

export async function createLocation(ctx: AppContext, merchantId: string, actorUserId: string, body: Body<typeof merchantApi.createLocationBody>) {
  const [l] = await ctx.db
    .insert(locations)
    .values({ merchantId, ...body, city: body.city ?? "Toronto", hours: body.hours ?? null, qrCode: await uniqueQrCode(ctx.db) })
    .returning();
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "location.created", entity: "location", entityId: l!.id });
  return serializeLocation(ctx, l!);
}

export async function updateLocation(ctx: AppContext, merchantId: string, actorUserId: string, id: string, body: Body<typeof merchantApi.updateLocationBody>) {
  const [l] = await ctx.db.update(locations).set(body).where(and(eq(locations.id, id), eq(locations.merchantId, merchantId))).returning();
  if (!l) throw notFound("Location");
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "location.updated", entity: "location", entityId: id, data: body });
  return serializeLocation(ctx, l);
}

/** Locations are deactivated, not deleted (visits and transactions reference them). Keeps at least one active. */
export async function deactivateLocation(ctx: AppContext, merchantId: string, actorUserId: string, id: string) {
  const all = await ctx.db.select().from(locations).where(and(eq(locations.merchantId, merchantId), eq(locations.active, true)));
  if (!all.some((l) => l.id === id)) {
    const [exists] = await ctx.db.select({ id: locations.id }).from(locations).where(and(eq(locations.id, id), eq(locations.merchantId, merchantId))).limit(1);
    if (!exists) throw notFound("Location");
    return;
  }
  if (all.length <= 1) throw conflict("You need at least one active location");
  await ctx.db.update(locations).set({ active: false }).where(and(eq(locations.id, id), eq(locations.merchantId, merchantId)));
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "location.deactivated", entity: "location", entityId: id });
}

/** Issue a fresh QR code for a location (e.g. stand stolen). The old code stops working. */
export async function rotateLocationQr(ctx: AppContext, merchantId: string, actorUserId: string, id: string) {
  const [l] = await ctx.db.update(locations).set({ qrCode: await uniqueQrCode(ctx.db) }).where(and(eq(locations.id, id), eq(locations.merchantId, merchantId))).returning();
  if (!l) throw notFound("Location");
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "location.qr_rotated", entity: "location", entityId: id });
  return serializeLocation(ctx, l);
}

