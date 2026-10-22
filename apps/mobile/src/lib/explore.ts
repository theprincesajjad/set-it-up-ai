/**
 * Explore tab logic (references.md § 1): category chips mapped from verticals,
 * sheet filters (Open now / Has promo / My shops) and the full-detent sections.
 * Pure so it's unit tested.
 */
export const EXPLORE_CATEGORIES: { key: string; label: string; verticals: string[] | null }[] = [
  { key: "all", label: "All", verticals: null },
  { key: "coffee", label: "Coffee", verticals: ["cafe", "bakery"] },
  { key: "food", label: "Food", verticals: ["restaurant", "bar", "grocery", "bakery"] },
  { key: "shops", label: "Shops", verticals: ["retail", "bookstore", "florist", "pet", "pharmacy", "other"] },
  { key: "services", label: "Services", verticals: ["dry_cleaning", "alterations", "print_shop", "fitness"] },
  { key: "repair", label: "Repair", verticals: ["repair_auto", "repair_electronics"] },
  { key: "beauty", label: "Beauty", verticals: ["salon", "barber", "spa"] },
];

export interface ExploreShop {
  merchant: { id: string; vertical: string; name: string };
  isMember: boolean;
  hasPromo: boolean;
  openNow: boolean | null;
  distanceMetres: number | null;
}

export interface ExploreFilters {
  category: string;
  openNow?: boolean;
  hasPromo?: boolean;
  myShops?: boolean;
}

export function filterShops<T extends ExploreShop>(shops: T[], f: ExploreFilters): T[] {
  const cat = EXPLORE_CATEGORIES.find((c) => c.key === f.category);
  return shops.filter(
    (s) =>
      (!cat?.verticals || cat.verticals.includes(s.merchant.vertical)) &&
      (!f.openNow || s.openNow === true) &&
      (!f.hasPromo || s.hasPromo) &&
      (!f.myShops || s.isMember),
  );
}

/** Nearest first; shops without a distance go last (keeps API order among them). */
export function byDistance<T extends ExploreShop>(shops: T[]): T[] {
  return [...shops].sort((a, b) => (a.distanceMetres ?? Infinity) - (b.distanceMetres ?? Infinity));
}

/** Full-detent sections: My shops, Promos nearby, Everything else (each shop appears once). */
export function exploreSections<T extends ExploreShop>(shops: T[]): { title: string; data: T[] }[] {
  const sorted = byDistance(shops);
  const mine = sorted.filter((s) => s.isMember);
  const promos = sorted.filter((s) => !s.isMember && s.hasPromo);
  const rest = sorted.filter((s) => !s.isMember && !s.hasPromo);
  return [
    { title: "My shops", data: mine },
    { title: "Promos nearby", data: promos },
    { title: "Everything else", data: rest },
  ].filter((s) => s.data.length > 0);
}

/** "14 shops on this strip" / "1 shop on this strip". */
export function stripHeader(count: number, place?: string | null): string {
  return `${count} ${count === 1 ? "shop" : "shops"} ${place ? `on ${place}` : "on this strip"}`;
}

/** Show "Search this area" once the map centre moved > 400 m (or zoomed out a lot) from the last search. */
export function movedEnough(a: { lat: number; lng: number }, b: { lat: number; lng: number }, metres = 400): boolean {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) > metres;
}
