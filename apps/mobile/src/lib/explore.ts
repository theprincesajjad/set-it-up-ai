/**
 * Explore (the home tab, foundations.md § Customer app): the category rail,
 * the filter capsules ("my shops ▾" / "open now" / "rewards ready"), the pin
 * subtitle and the list fallback sections. Pure so it's unit tested.
 */
import { MAP_CATEGORIES, verticalCategory, type MapCategoryId } from "@ll/design-tokens";

export { MAP_CATEGORIES };
export type { MapCategoryId };

export interface ExploreShop {
  merchant: { id: string; vertical: string; name: string };
  isMember: boolean;
  hasPromo: boolean;
  openNow: boolean | null;
  distanceMetres: number | null;
}

/** "my shops ▾" capsule: everyone, only shops I'm a member of, or shops I haven't joined. */
export type Audience = "all" | "mine" | "new";
export const AUDIENCE_LABELS: Record<Audience, string> = { all: "all shops", mine: "my shops", new: "new to me" };

export interface ExploreFilters {
  category: MapCategoryId | string;
  openNow?: boolean;
  /** Kept for callers of v1; promos are a paid feature and not a capsule in v2. */
  hasPromo?: boolean;
  /** v1 boolean ("My shops" chip); same as audience "mine". */
  myShops?: boolean;
  audience?: Audience;
  /** Only shops where I have a reward ready (merchant ids from the wallet). */
  rewardsReady?: ReadonlySet<string> | null;
}

export function inCategory(vertical: string, category: string): boolean {
  if (category === "all") return true;
  return verticalCategory(vertical) === category;
}

export function filterShops<T extends ExploreShop>(shops: T[], f: ExploreFilters): T[] {
  const audience: Audience = f.audience ?? (f.myShops ? "mine" : "all");
  return shops.filter(
    (s) =>
      inCategory(s.merchant.vertical, f.category) &&
      (!f.openNow || s.openNow === true) &&
      (!f.hasPromo || s.hasPromo) &&
      (audience === "all" || (audience === "mine" ? s.isMember : !s.isMember)) &&
      (!f.rewardsReady || f.rewardsReady.has(s.merchant.id)),
  );
}

/** Nearest first; shops without a distance go last (keeps API order among them). */
export function byDistance<T extends ExploreShop>(shops: T[]): T[] {
  return [...shops].sort((a, b) => (a.distanceMetres ?? Infinity) - (b.distanceMetres ?? Infinity));
}

/** List fallback sections: my shops, then everything else nearby (each shop appears once). */
export function exploreSections<T extends ExploreShop>(shops: T[]): { title: string; data: T[] }[] {
  const sorted = byDistance(shops);
  const mine = sorted.filter((s) => s.isMember);
  const rest = sorted.filter((s) => !s.isMember);
  return [
    { title: "my shops", data: mine },
    { title: "nearby", data: rest },
  ].filter((s) => s.data.length > 0);
}

/** "14 shops on Roncesvalles" / "1 shop on this strip". */
export function stripHeader(count: number, place?: string | null): string {
  return `${count} ${count === 1 ? "shop" : "shops"} ${place ? `on ${place}` : "on this strip"}`;
}

/** Show "search here" once the map centre moved > 400 m from the last search. */
export function movedEnough(a: { lat: number; lng: number }, b: { lat: number; lng: number }, metres = 400): boolean {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) > metres;
}

/** The lowercase kind of place under a name ("café", "bakery", "phone repair"). Short on purpose. */
const KINDS: Record<string, string> = {
  cafe: "café",
  restaurant: "restaurant",
  bakery: "bakery",
  bar: "pub",
  grocery: "market",
  pharmacy: "pharmacy",
  retail: "shop",
  bookstore: "bookshop",
  florist: "florist",
  pet: "pet shop",
  salon: "salon",
  barber: "barber",
  spa: "spa",
  fitness: "studio",
  repair_electronics: "phone repair",
  repair_auto: "auto shop",
  alterations: "tailor",
  dry_cleaning: "dry cleaner",
  print_shop: "print shop",
  other: "shop",
};
export function placeKind(vertical: string | null | undefined): string {
  return (vertical && KINDS[vertical]) || "shop";
}

/** What the pin / list row knows about my membership at a shop. */
export interface PinMembership {
  balance: number;
  rewardsAvailableCount: number;
  terminology: string;
  earnType: "per_dollar" | "per_visit" | "stamps" | null;
  stampGoal: number | null;
}

/**
 * The ONE italic grey line under a place name. Accent only when it means
 * points: "reward ready". Stamps read "7 / 10 stamps" (the card, not the
 * lifetime total), points "1,350 pts", strangers get the kind of place.
 */
export function pinSubtitle(vertical: string, m: PinMembership | null): { text: string; accent: boolean } {
  if (!m) return { text: placeKind(vertical), accent: false };
  if (m.rewardsAvailableCount > 0) return { text: m.rewardsAvailableCount > 1 ? `${m.rewardsAvailableCount} rewards ready` : "reward ready", accent: true };
  if (m.earnType === "stamps" && m.stampGoal && m.stampGoal > 0) {
    const on = Math.min(m.balance, m.stampGoal);
    return { text: `${on} / ${m.stampGoal} ${on === 1 && m.stampGoal === 1 ? "stamp" : "stamps"}`, accent: false };
  }
  const word = /stamp/i.test(m.terminology) ? (m.balance === 1 ? "stamp" : "stamps") : /star/i.test(m.terminology) ? (m.balance === 1 ? "star" : "stars") : "pts";
  return { text: `${m.balance.toLocaleString("en-CA")} ${word}`, accent: false };
}
