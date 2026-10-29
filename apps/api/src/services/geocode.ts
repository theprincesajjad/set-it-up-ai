/**
 * Where a new shop is: a map pin from its street address, and the street (neighbourhood) it belongs to, so the owner never has to
 * pick from a short list (docs/audits/main-street-self-serve.md F1, F2).
 *
 *  1. Geocode the address (providers/geocoder.ts). Without a geocoder, or when it finds nothing, an address that names a live or pilot
 *     street ("... Roncesvalles Ave") is pinned at that street's centre: close enough for a map pin, better than none.
 *  2. The street is the nearest live or pilot neighbourhood whose radius covers the pin.
 *  3. No street covers it: the owner can ask for theirs (requestStreet). That adds a "scouting" neighbourhood, hidden from the public
 *     list until the area opens, and puts the shop on it, so we can see where owners are asking and open the street at 5 shops.
 */
import { and, asc, count, eq, ilike, inArray, isNotNull } from "drizzle-orm";
import { locations, merchants, neighbourhoods, type DbOrTx } from "@ll/db";
import { cityCentroid, distanceMetres, normalizePostal, offsetPin, postalFsa, type AddressVisibility, type merchantApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { badRequest, notFound } from "../lib/errors.js";
import { geocoderFromConfig, type Geocoder } from "../providers/geocoder.js";
import { writeAudit } from "./admin-audit.js";
import { slugify } from "./merchant.js";

/** Shops needed on a street before we open it (shown to the owner: "we will tell you when 5 shops join"). */
export const STREET_OPENS_AT = 5;

export function geocoderFor(ctx: AppContext): Geocoder {
  return ctx.providers.geocoder ?? geocoderFromConfig(ctx.config.geocoder);
}

type Hood = typeof neighbourhoods.$inferSelect;

async function openHoods(db: DbOrTx): Promise<Hood[]> {
  return db.select().from(neighbourhoods).where(and(inArray(neighbourhoods.status, ["pilot", "live"]), isNotNull(neighbourhoods.centerLat), isNotNull(neighbourhoods.centerLng)));
}

/** The nearest open street whose radius covers the point, or null. */
export async function nearestNeighbourhood(db: DbOrTx, point: { lat: number; lng: number }): Promise<Hood | null> {
  let best: { hood: Hood; d: number } | null = null;
  for (const h of await openHoods(db)) {
    const d = distanceMetres(point, { lat: h.centerLat!, lng: h.centerLng! });
    if (d <= h.radiusMetres && (!best || d < best.d)) best = { hood: h, d };
  }
  return best?.hood ?? null;
}

export interface LocatedShop {
  lat: number | null;
  lng: number | null;
  neighbourhoodId: string | null;
  /** How the pin was found: the geocoder, the street named in the address, or not at all. */
  source: "geocoder" | "street_name" | null;
}

export async function locateNewShop(ctx: AppContext, a: { address: string; city?: string | null; postalCode?: string | null }): Promise<LocatedShop> {
  let point: { lat: number; lng: number } | null = null;
  let source: LocatedShop["source"] = null;
  try {
    point = await geocoderFor(ctx).geocode({ address: a.address, city: a.city ?? "Toronto", postalCode: a.postalCode ?? null });
    if (point) source = "geocoder";
  } catch {
    point = null;
  }
  const hoods = await openHoods(ctx.db);
  if (!point) {
    const text = a.address.toLowerCase();
    const named = hoods.find((h) => h.name.length >= 4 && text.includes(h.name.toLowerCase()));
    if (named) {
      point = { lat: named.centerLat!, lng: named.centerLng! };
      source = "street_name";
    }
  }
  if (!point) return { lat: null, lng: null, neighbourhoodId: null, source: null };
  const hood = await nearestNeighbourhood(ctx.db, point);
  return { lat: point.lat, lng: point.lng, neighbourhoodId: hood?.id ?? null, source };
}

export type StreetStatus = merchantApi.StreetStatusResponse;

/** Where the shop is on the map and on which street, for the owner's Home. */
export async function streetStatus(db: DbOrTx, merchantId: string): Promise<StreetStatus> {
  const [m] = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  const [loc] = await db.select().from(locations).where(eq(locations.merchantId, merchantId)).orderBy(asc(locations.createdAt), asc(locations.id)).limit(1);
  const [hood] = m.neighbourhoodId ? await db.select().from(neighbourhoods).where(eq(neighbourhoods.id, m.neighbourhoodId)).limit(1) : [];
  const [n] = hood ? await db.select({ n: count() }).from(merchants).where(eq(merchants.neighbourhoodId, hood.id)) : [];
  return {
    onMap: loc?.lat != null && loc?.lng != null,
    neighbourhood: hood ? { slug: hood.slug, name: hood.name, status: hood.status } : null,
    open: !!hood && hood.status !== "scouting",
    shops: Number(n?.n ?? 0),
    opensAt: STREET_OPENS_AT,
  };
}

/** Try the address again (the first lookup may have been down, or the owner fixed the address): pin the primary location and find its street. */
export async function relocateShop(ctx: AppContext, merchantId: string, actorUserId: string): Promise<StreetStatus> {
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  const [loc] = await ctx.db.select().from(locations).where(eq(locations.merchantId, merchantId)).orderBy(asc(locations.createdAt), asc(locations.id)).limit(1);
  if (!loc) throw notFound("Location");
  const found = await locateNewShop(ctx, { address: loc.address, city: loc.city, postalCode: loc.postalCode });
  if (found.lat !== null && found.lng !== null) {
    await ctx.db.update(locations).set({ lat: found.lat, lng: found.lng }).where(eq(locations.id, loc.id));
    if (!m.neighbourhoodId && found.neighbourhoodId) await ctx.db.update(merchants).set({ neighbourhoodId: found.neighbourhoodId, updatedAt: ctx.now() }).where(eq(merchants.id, merchantId));
    await writeAudit(ctx.db, { actorUserId, merchantId, action: "merchant.relocated", entity: "location", entityId: loc.id, data: { source: found.source } });
  }
  return streetStatus(ctx.db, merchantId);
}

/** An owner asks for their street: put the shop on an existing street of that name, or start a "scouting" one. */
export async function requestStreet(ctx: AppContext, merchantId: string, actorUserId: string, rawName: string): Promise<StreetStatus> {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 120) throw badRequest("Enter the name of your street or business area.");
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  const [loc] = await ctx.db.select().from(locations).where(eq(locations.merchantId, merchantId)).orderBy(asc(locations.createdAt), asc(locations.id)).limit(1);
  const city = loc?.city ?? "Toronto";
  await ctx.db.transaction(async (tx) => {
    const [existing] = await tx.select().from(neighbourhoods).where(and(ilike(neighbourhoods.name, name), eq(neighbourhoods.city, city))).limit(1);
    let hood = existing;
    if (!hood) {
      const base = slugify(`${name} ${city}`);
      let slug = base;
      for (let i = 2; ; i++) {
        const [taken] = await tx.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.slug, slug)).limit(1);
        if (!taken) break;
        slug = `${base}-${i}`;
      }
      [hood] = await tx
        .insert(neighbourhoods)
        .values({ slug, name, city, status: "scouting", centerLat: loc?.lat ?? null, centerLng: loc?.lng ?? null, notes: "Requested by an owner." })
        .returning();
    }
    await tx.update(merchants).set({ neighbourhoodId: hood!.id, updatedAt: ctx.now() }).where(eq(merchants.id, merchantId));
    await writeAudit(tx, { actorUserId, merchantId, action: "merchant.street_requested", entity: "neighbourhood", entityId: hood!.id, data: { name, created: !existing } });
  });
  return streetStatus(ctx.db, merchantId);
}

// ---- phase-solo: B ----
export interface PrivatePlace {
  /** The public pin: the area centroid plus the merchant's fixed offset (area), or the city centre (city). */
  mapLat: number;
  mapLng: number;
  /** "Bloor West" (the neighbourhood), "Toronto M6S" (the postal area) or null (city). */
  areaLabel: string | null;
  neighbourhoodId: string | null;
  /** Where the centroid came from. */
  source: "neighbourhood" | "fsa" | "city";
}

/**
 * Where a home studio or a travelling pro shows on the map (solo-pro-launch.md §2.3). Only the postal code is looked up, never a
 * street address. `area`: the neighbourhood whose radius covers the postal code's point (its centre and name), else the postal
 * area (the FSA's own point, "Toronto M6S"), else the city centre; then a fixed offset of at most 400 m per merchant. `city`: the
 * city centre, no offset, no label.
 */
export async function placePrivateShop(ctx: AppContext, a: { merchantId: string; visibility: Exclude<AddressVisibility, "exact">; postalCode?: string | null; city?: string | null }, db: DbOrTx = ctx.db): Promise<PrivatePlace> {
  const city = (a.city ?? "Toronto").trim() || "Toronto";
  const centre = cityCentroid(city);
  if (a.visibility === "city") return { mapLat: centre.lat, mapLng: centre.lng, areaLabel: null, neighbourhoodId: null, source: "city" };
  const postal = normalizePostal(a.postalCode);
  const fsa = postalFsa(a.postalCode);
  const geo = geocoderFor(ctx);
  const look = async (q: string | null) => {
    if (!q) return null;
    try {
      return await geo.geocode({ address: q, city, postalCode: null });
    } catch {
      return null;
    }
  };
  const point = await look(postal);
  if (point) {
    const hood = await nearestNeighbourhood(db, point);
    if (hood) {
      const pin = offsetPin(a.merchantId, { lat: hood.centerLat!, lng: hood.centerLng! });
      return { mapLat: pin.lat, mapLng: pin.lng, areaLabel: hood.name, neighbourhoodId: hood.id, source: "neighbourhood" };
    }
  }
  const fsaPoint = (await look(fsa)) ?? null;
  if (fsaPoint && fsa) {
    const pin = offsetPin(a.merchantId, fsaPoint);
    return { mapLat: pin.lat, mapLng: pin.lng, areaLabel: `${city} ${fsa}`, neighbourhoodId: null, source: "fsa" };
  }
  const pin = offsetPin(a.merchantId, centre);
  return { mapLat: pin.lat, mapLng: pin.lng, areaLabel: fsa ? `${city} ${fsa}` : null, neighbourhoodId: null, source: "city" };
}
// ---- end phase-solo: B ----
