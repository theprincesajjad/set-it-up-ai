/** Catalog (menu) for order-ahead. Every query is scoped by merchant_id. */
import { and, asc, eq } from "drizzle-orm";
import { catalogItems, locations, merchantCategories, merchants, type DbOrTx } from "@ll/db";
import { restaurantApi, restaurantWebApi, type commerceApi, type FeatureKey } from "@ll/shared";
import type { z } from "zod";
import { HttpError, badRequest, notFound } from "../lib/errors.js";
import type { AppContext } from "../context.js";
import { paymentsReady } from "./commerceShared.js";
import { getMerchantFeatures, requireFeature } from "./features.js";
import { publicCertification } from "./halal.js";
import { merchantProvince, taxLabel } from "./tax.js";

type Item = typeof catalogItems.$inferSelect;
type Category = typeof merchantCategories.$inferSelect;
type Merchant = typeof merchants.$inferSelect;

/** Restaurant-pack fields are only returned for restaurant-tier shops, so other shops' output is unchanged. */
export function itemDto(i: Item, restaurant = false): commerceApi.CatalogItemDto {
  return {
    id: i.id,
    merchantId: i.merchantId,
    categoryId: i.categoryId,
    name: i.name,
    description: i.description,
    priceCents: i.priceCents,
    imageUrl: i.imageUrl,
    modifiers: i.modifiers,
    available: i.available,
    orderable: i.orderable,
    sortOrder: i.sortOrder,
    createdAt: i.createdAt.toISOString(),
    ...(restaurant
      ? { dietary: i.dietary, translations: i.translations, preorderOnly: i.preorderOnly, leadTimeHours: i.leadTimeHours, serves: i.serves, depositBps: i.depositBps, station: i.station, options: i.options ?? null, cookMinutes: i.cookMinutes, recipe: i.recipe ?? null, soldOutUntil: i.soldOutUntil ? i.soldOutUntil.toISOString() : null }
      : {}),
  };
}

export function categoryDto(c: Category): commerceApi.CatalogCategoryDto {
  return { id: c.id, name: c.name, earnEligible: c.earnEligible, discountEligible: c.discountEligible };
}

async function assertCategory(db: DbOrTx, merchantId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const [c] = await db.select({ id: merchantCategories.id }).from(merchantCategories).where(and(eq(merchantCategories.id, categoryId), eq(merchantCategories.merchantId, merchantId))).limit(1);
  if (!c) throw badRequest("Unknown category");
}

function assertModifiers(mods: { name: string; options: { name: string }[] }[] | undefined) {
  if (!mods) return;
  const names = new Set<string>();
  for (const g of mods) {
    const key = g.name.toLowerCase();
    if (names.has(key)) throw badRequest(`Duplicate modifier group "${g.name}"`);
    names.add(key);
    const opts = new Set(g.options.map((o) => o.name.toLowerCase()));
    if (opts.size !== g.options.length) throw badRequest(`Duplicate option in modifier group "${g.name}"`);
  }
}

export async function getCatalog(db: DbOrTx, merchantId: string): Promise<commerceApi.CatalogResponse> {
  const [m] = await db.select({ tier: merchants.restaurantTier }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  const restaurant = !!m?.tier;
  const [cats, items] = await Promise.all([
    db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, merchantId)).orderBy(asc(merchantCategories.name)),
    db.select().from(catalogItems).where(eq(catalogItems.merchantId, merchantId)).orderBy(asc(catalogItems.sortOrder), asc(catalogItems.name)),
  ]);
  return { categories: cats.map(categoryDto), items: items.map((i) => itemDto(i, restaurant)) };
}

/** Restaurant-pack fields on a create/update body, with the feature each one needs. */
const RESTAURANT_ITEM_FIELDS: { keys: readonly (keyof commerceApi.UpdateCatalogItemBody)[]; feature: FeatureKey }[] = [
  { keys: ["dietary"], feature: "restaurant.dietary_tags" },
  { keys: ["translations"], feature: "restaurant.multilingual_menu" },
  { keys: ["preorderOnly", "leadTimeHours", "serves", "depositBps"], feature: "restaurant.degh_preorders" },
  { keys: ["station"], feature: "restaurant.kds" },
  { keys: ["cookMinutes", "recipe"], feature: "restaurant.degh_preorders" },
  { keys: ["options"], feature: "restaurant.dietary_tags" },
];

async function gateRestaurantFields(db: DbOrTx, merchantId: string, body: commerceApi.UpdateCatalogItemBody) {
  const used = RESTAURANT_ITEM_FIELDS.filter((g) => g.keys.some((k) => body[k] !== undefined));
  if (!used.length) return;
  const [m] = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  for (const g of used) await requireFeature(db, m, g.feature);
}

function normaliseDietary(d: NonNullable<commerceApi.CreateCatalogItemBody["dietary"]>) {
  // Zabihah is a halal claim too; vegan food is vegetarian.
  return { ...d, ...(d.zabihah ? { halal: true } : {}), ...(d.vegan ? { vegetarian: true } : {}) };
}

export async function createItem(db: DbOrTx, merchantId: string, body: z.infer<typeof commerceApi.createCatalogItemBody>) {
  await assertCategory(db, merchantId, body.categoryId);
  assertModifiers(body.modifiers);
  await gateRestaurantFields(db, merchantId, body);
  const restaurant = RESTAURANT_ITEM_FIELDS.some((g) => g.keys.some((k) => body[k] !== undefined));
  const [row] = await db
    .insert(catalogItems)
    .values({
      merchantId,
      name: body.name,
      description: body.description ?? null,
      priceCents: body.priceCents,
      categoryId: body.categoryId ?? null,
      imageUrl: body.imageUrl ?? null,
      modifiers: body.modifiers,
      available: body.available,
      orderable: body.orderable,
      sortOrder: body.sortOrder,
      dietary: body.dietary ? normaliseDietary(body.dietary) : {},
      translations: body.translations ?? {},
      preorderOnly: body.preorderOnly ?? false,
      leadTimeHours: body.leadTimeHours ?? 0,
      serves: body.serves ?? null,
      depositBps: body.depositBps ?? 0,
      station: body.station ?? null,
      cookMinutes: body.cookMinutes ?? 0,
      recipe: body.recipe ?? null,
      options: body.options ?? null,
    })
    .returning();
  return itemDto(row!, restaurant || !!(await isRestaurantShop(db, merchantId)));
}

async function isRestaurantShop(db: DbOrTx, merchantId: string): Promise<boolean> {
  const [m] = await db.select({ tier: merchants.restaurantTier }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  return !!m?.tier;
}

export async function updateItem(db: DbOrTx, merchantId: string, itemId: string, body: z.infer<typeof commerceApi.updateCatalogItemBody>) {
  await assertCategory(db, merchantId, body.categoryId);
  assertModifiers(body.modifiers);
  await gateRestaurantFields(db, merchantId, body);
  const patch: Partial<typeof catalogItems.$inferInsert> = {};
  for (const k of ["name", "description", "priceCents", "categoryId", "imageUrl", "modifiers", "available", "orderable", "sortOrder", "translations", "preorderOnly", "leadTimeHours", "serves", "depositBps", "station", "options", "cookMinutes", "recipe"] as const) {
    if (body[k] !== undefined) (patch as Record<string, unknown>)[k] = body[k];
  }
  if (body.dietary !== undefined) patch.dietary = normaliseDietary(body.dietary);
  if (body.soldOutUntil !== undefined) patch.soldOutUntil = body.soldOutUntil ? new Date(body.soldOutUntil) : null;
  if (!Object.keys(patch).length) throw badRequest("Nothing to update");
  const [row] = await db.update(catalogItems).set(patch).where(and(eq(catalogItems.id, itemId), eq(catalogItems.merchantId, merchantId))).returning();
  if (!row) throw notFound("Catalog item");
  return itemDto(row, await isRestaurantShop(db, merchantId));
}

/** Archive (items referenced by past orders are kept for receipts). */
export async function archiveItem(db: DbOrTx, merchantId: string, itemId: string) {
  const [row] = await db.update(catalogItems).set({ available: false, orderable: false }).where(and(eq(catalogItems.id, itemId), eq(catalogItems.merchantId, merchantId))).returning();
  if (!row) throw notFound("Catalog item");
  return itemDto(row, await isRestaurantShop(db, merchantId));
}

export async function createCategory(db: DbOrTx, merchantId: string, body: z.infer<typeof commerceApi.createCategoryBody>) {
  const [row] = await db.insert(merchantCategories).values({ merchantId, ...body }).returning();
  return categoryDto(row!);
}

export async function updateCategory(db: DbOrTx, merchantId: string, categoryId: string, body: z.infer<typeof commerceApi.updateCategoryBody>) {
  if (!Object.keys(body).length) throw badRequest("Nothing to update");
  const [row] = await db.update(merchantCategories).set(body).where(and(eq(merchantCategories.id, categoryId), eq(merchantCategories.merchantId, merchantId))).returning();
  if (!row) throw notFound("Category");
  return categoryDto(row);
}

/** Item passes the diner's dietary filters. Untagged spice counts as mild; halal includes zabihah, veg includes vegan and Jain. */
export function matchesDiet(i: Pick<Item, "dietary">, q: { halal?: boolean; veg?: boolean; maxSpice?: number }): boolean {
  const d = i.dietary ?? {};
  if (q.halal && !(d.halal || d.zabihah)) return false;
  if (q.veg && !(d.vegetarian || d.vegan || d.jain)) return false;
  if (q.maxSpice !== undefined && (d.spice ?? 0) > q.maxSpice) return false;
  return true;
}

/** Cash price for dual pricing: the card price less the shop's cash discount. */
export const cashPriceCents = (priceCents: number, bps: number) => Math.round((priceCents * (10_000 - bps)) / 10_000);

/**
 * Public menu: only available + orderable items. Caller checks orders.order_ahead.
 * Restaurant extras (lang, dietary filters, cash price) apply only when the shop has those features.
 */
export async function publicMenu(db: DbOrTx, merchant: Merchant, q: restaurantApi.PublicMenuQuery = { halal: false, veg: false, without: [] }, now: Date = new Date()): Promise<commerceApi.PublicMenuResponse> {
  const [catalog, locs, features, province, payInApp] = await Promise.all([
    getCatalog(db, merchant.id),
    db.select().from(locations).where(and(eq(locations.merchantId, merchant.id), eq(locations.active, true))).orderBy(asc(locations.createdAt)),
    getMerchantFeatures(db, merchant),
    merchantProvince(db, merchant),
    paymentsReady(db, merchant),
  ]);
  const dietOn = features["restaurant.dietary_tags"].enabled;
  const langOn = features["restaurant.multilingual_menu"].enabled;
  const dualOn = features["restaurant.dual_pricing"].enabled && merchant.cashDiscountBps > 0;
  const lang: restaurantApi.MenuLang = langOn && q.lang && (merchant.languages as string[]).includes(q.lang) ? q.lang : "en";
  // Sold out (the kitchen's 86 button) hides a dish until the time it was set to.
  let items = catalog.items.filter((i) => i.available && i.orderable && !(i.soldOutUntil && new Date(i.soldOutUntil).getTime() > now.getTime()));
  if (dietOn) items = items.filter((i) => matchesDiet({ dietary: i.dietary ?? {} }, q));
  if (dietOn && q.without?.length) items = items.filter((i) => !restaurantWebApi.dishAllergens(i.dietary?.allergens).some((a) => q.without.includes(a)));
  const shopCert = dietOn ? publicCertification(merchant.halalCertification, merchant, now) : null;
  const shopCertifier = merchant.halalCertification?.certifier.trim().toLowerCase() ?? null;
  items = items.map((i) => {
    const out = { ...i };
    // The dietary/translation/preorder keys exist only for restaurant-tier shops (see itemDto).
    if (!dietOn) delete out.dietary;
    // The shop-level certificate speaks for every dish; a dish names a certifier only when it is someone else.
    else if (out.dietary?.halalCertifier && out.dietary.halalCertifier.trim().toLowerCase() === shopCertifier) {
      const { halalCertifier: _drop, ...rest } = out.dietary;
      out.dietary = rest;
    }
    if (!langOn) delete out.translations;
    if (lang !== "en") {
      const t = i.translations?.[lang];
      if (t?.name) {
        out.nameEn = i.name;
        out.name = t.name;
      }
      if (t?.description) out.description = t.description;
    }
    if (dualOn) out.cashPriceCents = cashPriceCents(i.priceCents, merchant.cashDiscountBps);
    return out;
  });
  const tax = taxLabel(province);
  return {
    merchant: { id: merchant.id, slug: merchant.slug, name: merchant.name, logoUrl: merchant.logoUrl, brandColor: merchant.brandColor, timezone: merchant.timezone },
    locations: locs.map((l) => ({ id: l.id, name: l.name, address: l.address, hours: l.hours ?? null })),
    categories: catalog.categories.map((c) => ({ ...c, items: items.filter((i) => i.categoryId === c.id) })).filter((c) => c.items.length > 0),
    uncategorized: items.filter((i) => !i.categoryId),
    tax: { province, label: tax.label, ratePpm: tax.ratePpm },
    payInApp,
    pickupSlots: features["booking.pickup_slots"].enabled,
    ...(langOn ? { lang, languages: merchant.languages as restaurantApi.MenuLang[] } : {}),
    ...(dualOn ? { dualPricing: { cashDiscountBps: merchant.cashDiscountBps } } : {}),
    ...(dietOn ? { halalCertification: shopCert } : {}),
  };
}

// ---------------------------------------------------------------------------
// Restaurant menu settings (owner/manager)
// ---------------------------------------------------------------------------
export async function setMenuLanguages(ctx: AppContext, merchant: Merchant, languages: restaurantApi.MenuLang[]): Promise<restaurantApi.MenuLanguagesResponse> {
  await requireFeature(ctx.db, merchant, "restaurant.multilingual_menu");
  const unique = restaurantApi.MENU_LANGS.filter((l) => languages.includes(l));
  await ctx.db.update(merchants).set({ languages: unique, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
  return { languages: unique };
}

export async function getMenuLanguages(db: DbOrTx, merchant: Merchant): Promise<restaurantApi.MenuLanguagesResponse> {
  await requireFeature(db, merchant, "restaurant.multilingual_menu");
  return { languages: merchant.languages as restaurantApi.MenuLang[] };
}

/** Dual pricing (cash discount). Not allowed in Quebec. */
export async function setDualPricing(ctx: AppContext, merchant: Merchant, bps: number): Promise<restaurantApi.DualPricingResponse> {
  await requireFeature(ctx.db, merchant, "restaurant.dual_pricing");
  if (bps > 0 && (await merchantProvince(ctx.db, merchant)) === "QC") {
    throw new HttpError(409, "dual_pricing_not_allowed", "Cash discount pricing isn't available in Quebec.");
  }
  await ctx.db.update(merchants).set({ cashDiscountBps: bps, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
  return { cashDiscountBps: bps, enabled: bps > 0 };
}

export async function getDualPricing(db: DbOrTx, merchant: Merchant): Promise<restaurantApi.DualPricingResponse> {
  await requireFeature(db, merchant, "restaurant.dual_pricing");
  return { cashDiscountBps: merchant.cashDiscountBps, enabled: merchant.cashDiscountBps > 0 };
}

export async function setPreorderCap(ctx: AppContext, merchant: Merchant, cap: number | null): Promise<restaurantApi.PreorderSettingsResponse> {
  await requireFeature(ctx.db, merchant, "restaurant.degh_preorders");
  await ctx.db.update(merchants).set({ preorderDailyCap: cap, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
  return { preorderDailyCap: cap };
}
