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

/** A pin on screen: bubble centre in px, and how much its label matters. */
export interface PinPoint {
  id: string;
  x: number;
  y: number;
  /** Higher keeps its label first (selected > reward ready > member > nearest). */
  priority: number;
  /** Label width in px when known (defaults to the max). */
  w?: number;
  /** Label height in px when known (a long name wraps to two lines). */
  h?: number;
}

/** Rough label size for a pin: bold 14 px name (wraps at 160 px, never cut mid-word) + italic 12 px subtitle. */
export function labelWidth(name: string, subtitle: string): number {
  return Math.min(160, Math.max(name.length * 7.6, subtitle.length * 6.2) + 8);
}
export function labelHeight(name: string): number {
  return name.length * 7.6 + 8 > 160 ? 54 : 38;
}

/**
 * Which pins get a name + subtitle without labels overlapping (Corner keeps
 * every label readable; dense pins fall back to the bare object bubble).
 * Greedy by priority; a label is the box to the right of the bubble.
 */
export function labelPlan(
  points: readonly PinPoint[],
  opts: { labelW?: number; labelH?: number; bubble?: number; /** Screen areas under floating chrome (no labels there). */ avoid?: { x1: number; y1: number; x2: number; y2: number }[] } = {},
): Set<string> {
  const { labelW = 150, labelH = 38, bubble = 40, avoid = [] } = opts;
  const r = bubble / 2;
  const kept: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const bubbles = points.map((p) => ({ x1: p.x - r, y1: p.y - r, x2: p.x + r, y2: p.y + r, id: p.id }));
  const out = new Set<string>();
  const hit = (a: { x1: number; y1: number; x2: number; y2: number }, b: { x1: number; y1: number; x2: number; y2: number }) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
  for (const p of [...points].sort((a, b) => b.priority - a.priority)) {
    const h = p.h ?? labelH;
    const box = { x1: p.x + r + 2, y1: p.y - h / 2, x2: p.x + r + 6 + (p.w ?? labelW), y2: p.y + h / 2 };
    if (kept.some((k) => hit(k, box))) continue;
    if (avoid.some((a) => hit(a, box))) continue;
    if (bubbles.some((b) => b.id !== p.id && hit(b, box))) continue;
    kept.push(box);
    out.add(p.id);
  }
  return out;
}

/** Label priority for a shop pin: selected > reward ready > my shop > open now > nearest. */
export function pinPriority(o: { selected: boolean; rewardReady: boolean; member: boolean; openNow?: boolean | null; distanceMetres: number | null }): number {
  return (o.selected ? 1e7 : 0) + (o.rewardReady ? 1e6 : 0) + (o.member ? 1e5 : 0) + (o.openNow ? 5e4 : 0) + (o.distanceMetres == null ? 0 : Math.max(0, 1e4 - o.distanceMetres));
}

type Rect = { x1: number; y1: number; x2: number; y2: number };

export interface PinCluster {
  /** The pin the cluster sits on (highest priority member). */
  id: string;
  members: string[];
}

export interface PinPlan {
  /** Pins drawn with name + subtitle. */
  labeled: Set<string>;
  /** Pins not drawn at all: under floating chrome, or folded into a cluster. */
  hidden: Set<string>;
  /** Pins drawn as a black count capsule instead of a bubble (members.length > 1). */
  clusters: Map<string, PinCluster>;
}

/**
 * The whole map layout (Corner): chrome is an obstacle for pins too, so a
 * bubble that would land under the top controls, the rail or the tab bar is
 * not drawn; bubbles closer than `clusterPx` fold into the higher-priority
 * one, which becomes a small black count capsule; then at most `maxLabels`
 * labels are placed without overlapping (labelPlan).
 */
export function pinPlan(
  points: readonly PinPoint[],
  opts: { chrome?: Rect[]; clusterPx?: number; maxLabels?: number; bubble?: number; labelAvoid?: Rect[] } = {},
): PinPlan {
  const { chrome = [], clusterPx = 44, maxLabels = 8, bubble = 40 } = opts;
  const r = bubble / 2;
  const hidden = new Set<string>();
  const inChrome = (p: PinPoint) => chrome.some((c) => p.x + r > c.x1 && p.x - r < c.x2 && p.y + r > c.y1 && p.y - r < c.y2);
  const visible = [...points].sort((a, b) => b.priority - a.priority).filter((p) => {
    if (inChrome(p)) {
      hidden.add(p.id);
      return false;
    }
    return true;
  });
  const heads: PinPoint[] = [];
  const clusters = new Map<string, PinCluster>();
  for (const p of visible) {
    const head = heads.find((h) => Math.hypot(h.x - p.x, h.y - p.y) < clusterPx);
    if (head) {
      hidden.add(p.id);
      const c = clusters.get(head.id) ?? { id: head.id, members: [head.id] };
      c.members.push(p.id);
      clusters.set(head.id, c);
    } else heads.push(p);
  }
  // A cluster has no label; its count capsule is the label.
  const labelable = heads.filter((h) => !clusters.has(h.id));
  const labeled = labelPlan(
    heads.map((h) => (clusters.has(h.id) ? { ...h, priority: -1 } : h)),
    { avoid: [...chrome, ...(opts.labelAvoid ?? [])], bubble },
  );
  for (const h of heads) if (clusters.has(h.id)) labeled.delete(h.id);
  // Cap: keep the highest-priority labels only.
  const keep = new Set(labelable.filter((h) => labeled.has(h.id)).slice(0, maxLabels).map((h) => h.id));
  return { labeled: keep, hidden, clusters };
}
