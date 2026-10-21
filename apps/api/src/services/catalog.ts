/** Catalog (menu) for order-ahead. Every query is scoped by merchant_id. */
import { and, asc, eq } from "drizzle-orm";
import { catalogItems, locations, merchantCategories, merchants, type DbOrTx } from "@ll/db";
import type { commerceApi } from "@ll/shared";
import type { z } from "zod";
import { badRequest, notFound } from "../lib/errors.js";
import { paymentsReady } from "./commerceShared.js";
import { getMerchantFeatures } from "./features.js";
import { merchantProvince, taxLabel } from "./tax.js";

type Item = typeof catalogItems.$inferSelect;
type Category = typeof merchantCategories.$inferSelect;
type Merchant = typeof merchants.$inferSelect;

export function itemDto(i: Item): commerceApi.CatalogItemDto {
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
  const [cats, items] = await Promise.all([
    db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, merchantId)).orderBy(asc(merchantCategories.name)),
    db.select().from(catalogItems).where(eq(catalogItems.merchantId, merchantId)).orderBy(asc(catalogItems.sortOrder), asc(catalogItems.name)),
  ]);
  return { categories: cats.map(categoryDto), items: items.map(itemDto) };
}

export async function createItem(db: DbOrTx, merchantId: string, body: z.infer<typeof commerceApi.createCatalogItemBody>) {
  await assertCategory(db, merchantId, body.categoryId);
  assertModifiers(body.modifiers);
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
    })
    .returning();
  return itemDto(row!);
}

export async function updateItem(db: DbOrTx, merchantId: string, itemId: string, body: z.infer<typeof commerceApi.updateCatalogItemBody>) {
  await assertCategory(db, merchantId, body.categoryId);
  assertModifiers(body.modifiers);
  const patch: Partial<typeof catalogItems.$inferInsert> = {};
  for (const k of ["name", "description", "priceCents", "categoryId", "imageUrl", "modifiers", "available", "orderable", "sortOrder"] as const) {
    if (body[k] !== undefined) (patch as Record<string, unknown>)[k] = body[k];
  }
  if (!Object.keys(patch).length) throw badRequest("Nothing to update");
  const [row] = await db.update(catalogItems).set(patch).where(and(eq(catalogItems.id, itemId), eq(catalogItems.merchantId, merchantId))).returning();
  if (!row) throw notFound("Catalog item");
  return itemDto(row);
}

/** Archive (items referenced by past orders are kept for receipts). */
export async function archiveItem(db: DbOrTx, merchantId: string, itemId: string) {
  const [row] = await db.update(catalogItems).set({ available: false, orderable: false }).where(and(eq(catalogItems.id, itemId), eq(catalogItems.merchantId, merchantId))).returning();
  if (!row) throw notFound("Catalog item");
  return itemDto(row);
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

/** Public menu: only available + orderable items. Caller checks orders.order_ahead. */
export async function publicMenu(db: DbOrTx, merchant: Merchant): Promise<commerceApi.PublicMenuResponse> {
  const [catalog, locs, features, province, payInApp] = await Promise.all([
    getCatalog(db, merchant.id),
    db.select().from(locations).where(and(eq(locations.merchantId, merchant.id), eq(locations.active, true))).orderBy(asc(locations.createdAt)),
    getMerchantFeatures(db, merchant),
    merchantProvince(db, merchant),
    paymentsReady(db, merchant),
  ]);
  const items = catalog.items.filter((i) => i.available && i.orderable);
  const tax = taxLabel(province);
  return {
    merchant: { id: merchant.id, slug: merchant.slug, name: merchant.name, logoUrl: merchant.logoUrl, brandColor: merchant.brandColor, timezone: merchant.timezone },
    locations: locs.map((l) => ({ id: l.id, name: l.name, address: l.address, hours: l.hours ?? null })),
    categories: catalog.categories.map((c) => ({ ...c, items: items.filter((i) => i.categoryId === c.id) })).filter((c) => c.items.length > 0),
    uncategorized: items.filter((i) => !i.categoryId),
    tax: { province, label: tax.label, ratePpm: tax.ratePpm },
    payInApp,
    pickupSlots: features["booking.pickup_slots"].enabled,
  };
}
