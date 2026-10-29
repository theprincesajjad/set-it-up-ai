/**
 * Home-based privacy (docs/business/solo-pro-launch.md §2.3, founder decision Oct 28: city or area only).
 *
 * A storefront is `exact`: its street address and pin are public. A pro who works from home is `area`: the public pin is the
 * neighbourhood (or postal area) centroid moved by a fixed per-shop offset of at most 400 m, and the listing reads
 * "Bloor West area · by appointment". A pro who travels to clients (or wants no neighbourhood shown) is `city`: one pin at the city
 * centroid. For `area` and `city` the street address is released only to a confirmed booking (confirmation, its message, the
 * calendar file and the reminders); it never appears in the shop page, the site, Open Graph images, search, the sitemap or the map API.
 *
 * Pure functions only, shared by the API (which enforces it) and the apps (which word it).
 */

export const ADDRESS_VISIBILITIES = ["exact", "area", "city"] as const;
export type AddressVisibility = (typeof ADDRESS_VISIBILITIES)[number];

/** "Where do you work?" at signup: my place, a shop or salon, or I travel to clients. */
export const WORK_SETTINGS = ["home", "shop", "mobile"] as const;
export type WorkSetting = (typeof WORK_SETTINGS)[number];

/** Radius chips for a pro who travels to clients. */
export const SERVICE_RADII_KM = [5, 10, 20] as const;

/** The furthest the public pin of an `area` shop sits from the area centroid. */
export const AREA_PIN_MAX_METRES = 400;
/** And the nearest, so two pros in one area never share a pin with the centroid. */
export const AREA_PIN_MIN_METRES = 120;

export const addressVisibilityOf = (v: string | null | undefined): AddressVisibility => ((ADDRESS_VISIBILITIES as readonly string[]).includes(v ?? "") ? (v as AddressVisibility) : "exact");
export const workSettingOf = (v: string | null | undefined): WorkSetting => ((WORK_SETTINGS as readonly string[]).includes(v ?? "") ? (v as WorkSetting) : "shop");

/** The visibility a signup answer starts with: a storefront shows its address, a home studio its area, a mobile pro the city. */
export function defaultVisibility(work: WorkSetting): AddressVisibility {
  return work === "home" ? "area" : work === "mobile" ? "city" : "exact";
}

/** Is the street address private until a booking? */
export const isAddressPrivate = (v: string | null | undefined): boolean => addressVisibilityOf(v) !== "exact";

/** FNV-1a, 32 bit: a stable hash that runs the same in Node, the browser and React Native. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The public pin of an `area` shop: the centroid moved by a bearing and a distance taken from the merchant id, so the same shop
 * always gets the same pin (it never "walks" towards the real address across requests) and two pros in one area never stack.
 * The distance is between AREA_PIN_MIN_METRES and AREA_PIN_MAX_METRES.
 */
export function offsetPin(merchantId: string, centroid: { lat: number; lng: number }, maxMetres: number = AREA_PIN_MAX_METRES): { lat: number; lng: number } {
  const a = fnv1a(`pin-bearing:${merchantId}`) / 0x1_0000_0000;
  const b = fnv1a(`pin-distance:${merchantId}`) / 0x1_0000_0000;
  const min = Math.min(AREA_PIN_MIN_METRES, maxMetres);
  const d = min + b * (maxMetres - min);
  const bearing = a * 2 * Math.PI;
  const dLat = (d * Math.cos(bearing)) / 111_320;
  const dLng = (d * Math.sin(bearing)) / (111_320 * Math.cos((centroid.lat * Math.PI) / 180));
  // Six decimals is ~10 cm: enough, and keeps the JSON short.
  const r = (x: number) => Math.round(x * 1e6) / 1e6;
  return { lat: r(centroid.lat + dLat), lng: r(centroid.lng + dLng) };
}

/** The forward sortation area of a Canadian postal code ("M6S 2K1" gives "M6S"), or null. */
export function postalFsa(postal: string | null | undefined): string | null {
  const m = /^\s*([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])\s*(\d[ABCEGHJ-NPRSTV-Z]\d)?\s*$/i.exec(postal ?? "");
  return m ? m[1]!.toUpperCase() : null;
}

/** A tidy postal code ("m6s2k1" gives "M6S 2K1"), or null when it is not a Canadian postal code. */
export function normalizePostal(postal: string | null | undefined): string | null {
  const m = /^\s*([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])\s*(\d[ABCEGHJ-NPRSTV-Z]\d)\s*$/i.exec(postal ?? "");
  return m ? `${m[1]!.toUpperCase()} ${m[2]!.toUpperCase()}` : null;
}

/** City centres for a `city` pin (and the last resort for an `area` pin when the postal code cannot be placed). */
export const CITY_CENTROIDS: Readonly<Record<string, { lat: number; lng: number }>> = {
  toronto: { lat: 43.6532, lng: -79.3832 },
  mississauga: { lat: 43.589, lng: -79.6441 },
  brampton: { lat: 43.7315, lng: -79.7624 },
  markham: { lat: 43.8561, lng: -79.337 },
  vaughan: { lat: 43.8361, lng: -79.4983 },
  "richmond hill": { lat: 43.8828, lng: -79.4403 },
  oakville: { lat: 43.4675, lng: -79.6877 },
  burlington: { lat: 43.3255, lng: -79.799 },
  hamilton: { lat: 43.2557, lng: -79.8711 },
  pickering: { lat: 43.8384, lng: -79.0868 },
  ajax: { lat: 43.8509, lng: -79.0204 },
  oshawa: { lat: 43.8971, lng: -78.8658 },
  milton: { lat: 43.5183, lng: -79.8774 },
  ottawa: { lat: 45.4215, lng: -75.6972 },
};

export function cityCentroid(city: string | null | undefined): { lat: number; lng: number } {
  return CITY_CENTROIDS[(city ?? "").trim().toLowerCase()] ?? CITY_CENTROIDS.toronto!;
}

/**
 * What a client sees before booking, in place of the street address, without the "· by appointment" tail (the apps add it in the
 * reader's language): "Bloor West area" for `area`, "Toronto" for `city`, the address for `exact`. English; the API sends it as the
 * public `address` so an old app that only knows `address` shows the safe line.
 */
export function publicPlaceLine(l: { addressVisibility: string | null | undefined; areaLabel: string | null | undefined; city: string | null | undefined; address: string }): string {
  const v = addressVisibilityOf(l.addressVisibility);
  if (v === "exact") return l.address;
  if (v === "area" && l.areaLabel?.trim()) return `${l.areaLabel.trim()} area`;
  return (l.city ?? "").trim() || "Toronto";
}

/** The public pin for a location row: exact = its own pin; area and city = the stored map pin, never the real one. */
export function publicPin(l: { addressVisibility: string | null | undefined; lat: number | null; lng: number | null; mapLat: number | null; mapLng: number | null }): { lat: number | null; lng: number | null } {
  if (addressVisibilityOf(l.addressVisibility) === "exact") return { lat: l.mapLat ?? l.lat, lng: l.mapLng ?? l.lng };
  return { lat: l.mapLat ?? null, lng: l.mapLng ?? null };
}

/**
 * May a booking see the street address? Only once it is confirmed: booked or under way, with no unpaid hold (the deposit or card
 * step is done). A cancelled or no-show booking does not get it again (solo-pro-launch.md §2.3 rule 5).
 */
export function bookingMaySeeAddress(a: { status: string; holdExpiresAt: Date | string | null }): boolean {
  if (a.holdExpiresAt) return false;
  return a.status === "booked" || a.status === "arrived" || a.status === "in_service" || a.status === "completed";
}
