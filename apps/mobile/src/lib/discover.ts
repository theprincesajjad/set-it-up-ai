/**
 * Discover tab (canvas Discover.dc.html, Hypelist-style): the hero for the live neighbourhood campaign,
 * the chip row, and horizontal rows of shops by category ("coffee on roncesvalles"). Pure, unit tested.
 * Data only from existing APIs (campaigns, network shops, wallet). No upgrade prompts.
 */
import { verticalCategory, type VerticalCategory } from "@ll/design-tokens";
import { placeKind } from "./explore";
import { formatDistance } from "./format";
import { shopLine } from "./shopLine";

/** "Roncesvalles Village" → "roncesvalles" (the canvas voice: short, lowercase). */
export function shortHood(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .replace(/\s+(village|bia|neighbourhood)$/i, "")
    .trim()
    .toLowerCase();
}

/** Row order and the plural the row title uses ("bakeries on roncesvalles"). */
export const DISCOVER_ROWS: { id: VerticalCategory; title: string; chip: string }[] = [
  { id: "coffee", title: "coffee", chip: "coffee" },
  { id: "bakery", title: "bakeries", chip: "bakeries" },
  { id: "eat", title: "places to eat", chip: "eat" },
  { id: "shops", title: "shops", chip: "shops" },
  { id: "beauty", title: "beauty", chip: "beauty" },
  { id: "services", title: "services", chip: "services" },
  { id: "repair", title: "repair", chip: "repair" },
];

export interface DiscoverShop {
  merchant: { id: string; slug: string; name: string; vertical: string };
  distanceMetres: number | null;
  openNow: boolean | null;
  isMember: boolean;
}

export type DiscoverMode = "forYou" | "nearest" | "mine";
export const DISCOVER_MODE_LABELS: Record<DiscoverMode, string> = { forYou: "for you", nearest: "nearest", mine: "my shops" };

export interface DiscoverRow<T> {
  id: VerticalCategory;
  title: string;
  shops: T[];
}

/**
 * Rows of shops by category. "for you": rows with my shops first, and inside a row reward ready →
 * member → nearest. "nearest": every row nearest first. "mine": only shops I'm a member of.
 */
export function discoverRows<T extends DiscoverShop>(shops: T[], opts: { hood: string; ready: ReadonlySet<string>; mode?: DiscoverMode; category?: VerticalCategory | null }): DiscoverRow<T>[] {
  const mode = opts.mode ?? "forYou";
  const where = opts.hood ? ` on ${opts.hood}` : " near you";
  const dist = (s: T) => s.distanceMetres ?? Infinity;
  const rank = (s: T) => (mode === "nearest" ? 0 : (opts.ready.has(s.merchant.id) ? 2 : 0) + (s.isMember ? 1 : 0));
  const pool = mode === "mine" ? shops.filter((s) => s.isMember) : shops;
  const rows = DISCOVER_ROWS.filter((r) => !opts.category || r.id === opts.category)
    .map((r) => ({
      id: r.id,
      title: `${r.title}${where}`,
      shops: pool.filter((s) => verticalCategory(s.merchant.vertical) === r.id).sort((a, b) => rank(b) - rank(a) || dist(a) - dist(b)),
    }))
    .filter((r) => r.shops.length > 0);
  if (mode !== "forYou") return rows;
  const score = (r: DiscoverRow<T>) => r.shops.filter((s) => s.isMember).length;
  return rows.map((r, i) => ({ r, i })).sort((a, b) => score(b.r) - score(a.r) || a.i - b.i).map((x) => x.r);
}

/** "café · 140 m · open" / "bakery · 320 m · opens 7:30" / "café · 600 m". */
export function discoverMeta(s: DiscoverShop, status: { open: boolean; label: string } | null): string {
  const opens = status && !status.open ? /opens (.+)$/i.exec(status.label)?.[1] : undefined;
  const when = status?.open ? "open" : opens ? `opens ${opens.replace(/\s?am$/i, "")}` : null;
  return [placeKind(s.merchant.vertical), formatDistance(s.distanceMetres), when].filter(Boolean).join(" · ");
}

export interface HeroCampaign {
  name: string;
  kind: string;
  endsAt: string;
  goalVisits: number;
  bonusPoints: number;
  multiplierPct: number | null;
  prize: string | null;
  progress?: { visited: number; goal: number } | null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Hero copy for the live campaign: eyebrow, lowercase headline, progress. */
export function heroCopy(c: HeroCampaign, now = new Date()): { eyebrow: string; headline: string; progress: { value: number; max: number } | null } {
  const end = new Date(c.endsAt);
  const ends = end.getTime() > now.getTime() ? ` · ends ${MONTHS[end.getMonth()]} ${end.getDate()}` : "";
  const prize = c.prize ? c.prize.replace(/^win\s+/i, "").replace(/\.$/, "") : null;
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const headline =
    c.kind === "passport"
      ? `visit ${c.goalVisits} shops, ${prize ? `win ${lower(prize)}` : c.bonusPoints > 0 ? `get ${c.bonusPoints} bonus points` : "finish the passport"}`
      : c.kind === "multiplier" && c.multiplierPct
        ? `${c.multiplierPct / 100}× points on the whole street`
        : c.bonusPoints > 0
          ? `${c.bonusPoints} bonus points on the street`
          : lower(c.name);
  const g = c.progress?.goal ?? c.goalVisits;
  return {
    eyebrow: `${c.name.toLowerCase()}${ends}`,
    headline: headline.toLowerCase(),
    progress: c.kind === "passport" && g > 0 ? { value: Math.min(c.progress?.visited ?? 0, g), max: g } : null,
  };
}

/**
 * Place up to `max` shops on the small "near you" map card (width × height px) around the origin,
 * scaled so the farthest one still fits inside a margin. Returns pixel centres.
 */
export function miniMapPoints(origin: { lat: number; lng: number }, shops: { id: string; lat: number; lng: number }[], box: { w: number; h: number; margin?: number; marginX?: number; max?: number; /** Minimum distance from the centre dot, px. */ minR?: number }): { id: string; x: number; y: number }[] {
  const my = box.margin ?? 28;
  const mx = box.marginX ?? my;
  const cos = Math.cos((origin.lat * Math.PI) / 180);
  const pts = shops.slice(0, box.max ?? 3).map((s) => ({ id: s.id, dx: (s.lng - origin.lng) * cos, dy: -(s.lat - origin.lat) }));
  const span = Math.max(1e-9, ...pts.map((p) => Math.abs(p.dx) / (box.w / 2 - mx)), ...pts.map((p) => Math.abs(p.dy) / (box.h / 2 - my)));
  const minR = box.minR ?? 0;
  return pts.map((p, i) => {
    let x = p.dx / span;
    let y = p.dy / span;
    // Never on top of the location dot: push a very close shop out to minR (straight shops go up-left / down-right).
    const r = Math.hypot(x, y);
    if (r < minR) {
      const a = r > 0 ? Math.atan2(y, x) : i % 2 === 0 ? (-3 * Math.PI) / 4 : Math.PI / 5;
      x = Math.cos(a) * minR;
      y = Math.sin(a) * minR;
    }
    return { id: p.id, x: Math.round(box.w / 2 + x), y: Math.round(box.h / 2 + y) };
  });
}

/**
 * The one line under a shop on Discover: my progress first ("your 7 / 10"), then a live promo window ("2× stamps till 4 pm"),
 * then the shop's perk ("bakery · 5% off Tuesdays"), then the category with distance and open status. The window and perk
 * come from the network directory (`promoLine`, `perk`).
 */
export function shopSubtitle(
  s: DiscoverShop & { promoLine?: string | null; perk?: string | null },
  status: { open: boolean; label: string } | null,
  opts: { progress?: { n: number; goal: number } | null; promoLine?: string | null; perk?: string | null } = {},
): string {
  const progress = opts.progress && opts.progress.goal > 0 ? `your ${Math.min(opts.progress.n, opts.progress.goal)} / ${opts.progress.goal}` : null;
  return shopLine({ progress, promoLine: opts.promoLine ?? s.promoLine ?? null, perk: opts.perk ?? s.perk ?? null, kind: placeKind(s.merchant.vertical), meta: discoverMeta(s, status) });
}

/** "2× stamps till 4 pm" for a live multiplier window ending at `endHour` (24 h). */
export function promoWindowLine(multiplier: number, noun: string, endHour: number): string {
  const h = endHour % 12 === 0 ? 12 : endHour % 12;
  return `${multiplier}× ${noun} till ${h} ${endHour >= 12 && endHour < 24 ? "pm" : "am"}`;
}
