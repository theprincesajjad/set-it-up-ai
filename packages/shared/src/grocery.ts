/**
 * Grocers and halal butchers (docs/research/grocers.md): pure logic shared by the API, the dashboard and the customer pages.
 *
 *  - Weighed items: a price per kg or lb, the price of one portion, and the line total after the weigh-in at the scale.
 *  - Per-unit prices for the flyer ("$1.37/100 g").
 *  - What a reward costs the shop as a share of spend (0.5% back is the grocery default).
 *  - Pantry cadence: how long a 20 lb bag of atta lasts one household, learned from that household's own purchases.
 *  - The grocer's season calendar: Diwali, Eid, Ramadan, Lunar New Year and friends, with when to start the stock-up flyer.
 *
 * Nothing here touches the database, so everything is unit-tested.
 */
import { FESTIVALS, addDays, daysBetween, getFestival, resolveFestivalDates, type FestivalOverrides } from "./festivals.js";

// ---------------------------------------------------------------------------
// Weighed items
// ---------------------------------------------------------------------------
export const WEIGHT_UNITS = ["kg", "lb"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];
export const GRAMS_PER_LB = 453.59237;

export const gramsPerUnit = (u: WeightUnit): number => (u === "kg" ? 1000 : GRAMS_PER_LB);

/** Price of one portion of `nominalWeightG` grams when the shop prices by the kg or lb (rounded to the cent). */
export function portionPriceCents(unitPriceCents: number, unit: WeightUnit, nominalWeightG: number): number {
  return Math.round((unitPriceCents * nominalWeightG) / gramsPerUnit(unit));
}

/** What the customer pays for what the scale says (grams), at the price per kg or lb, rounded to the cent. */
export function weighedLineCents(unitPriceCents: number, unit: WeightUnit, actualWeightG: number): number {
  return Math.round((unitPriceCents * actualWeightG) / gramsPerUnit(unit));
}

/** "2.14 kg" or "4.72 lb". Grams are shown in the shop's unit with two decimals. */
export function formatWeight(grams: number, unit: WeightUnit): string {
  const v = grams / gramsPerUnit(unit);
  return `${(Math.round(v * 100) / 100).toString()} ${unit}`;
}

/** "$13.99/kg" for a weighed item. */
export function perUnitLabel(unitPriceCents: number, unit: WeightUnit): string {
  return `$${(unitPriceCents / 100).toFixed(2)}/${unit}`;
}

/** Price per 100 g in cents (float), for a price per kg/lb or a pack of known grams. null when we cannot tell. */
export function per100gCents(priceCents: number, priceUnit: "each" | WeightUnit, packSizeG?: number | null): number | null {
  if (priceUnit === "kg" || priceUnit === "lb") return (priceCents / gramsPerUnit(priceUnit)) * 100;
  if (packSizeG && packSizeG > 0) return (priceCents / packSizeG) * 100;
  return null;
}

/** "$1.37/100 g" from cents per 100 g. */
export const per100gLabel = (c: number): string => `$${(c / 100).toFixed(2)}/100 g`;

// ---------------------------------------------------------------------------
// What a reward costs
// ---------------------------------------------------------------------------
/**
 * The share of spend given back: a reward worth `rewardValueCents` costs `pointsCost` points, and a member earns
 * `pointsPerDollar` points per dollar, so they spend pointsCost / pointsPerDollar dollars to get it.
 * $5 off at 1,000 points and 1 point per dollar is 0.5%.
 */
export function rewardBackPct(pointsPerDollar: number, pointsCost: number, rewardValueCents: number): number | null {
  if (pointsPerDollar <= 0 || pointsCost <= 0 || rewardValueCents <= 0) return null;
  const spendCents = (pointsCost / pointsPerDollar) * 100;
  return Math.round((rewardValueCents / spendCents) * 10_000) / 100;
}

/** Typical net margin of a small Canadian grocer in percent: the median in ISED's 2024 table (an estimate, to confirm on pilot shops). */
export const GROCER_NET_MARGIN_PCT = 2;

// ---------------------------------------------------------------------------
// Pantry cadence (bulk staples)
// ---------------------------------------------------------------------------
export const PANTRY_MIN_DAYS = 7;
export const PANTRY_MAX_DAYS = 180;
/** The text goes out this many days before the household is expected to run out. */
export const PANTRY_LEAD_DAYS = 5;

const clampDays = (n: number) => Math.min(PANTRY_MAX_DAYS, Math.max(PANTRY_MIN_DAYS, Math.round(n)));

/** Whole days between purchase timestamps (ISO), oldest first. */
export function gapsDays(history: readonly string[]): number[] {
  const sorted = [...history].sort();
  const out: number[] = [];
  for (let i = 1; i < sorted.length; i++) out.push((Date.parse(sorted[i]!) - Date.parse(sorted[i - 1]!)) / 86_400_000);
  return out;
}

/**
 * How many days one purchase lasts this household. The shop's default until there are two gaps (three purchases);
 * after that the median of the last five gaps, kept between a week and half a year so one odd trip cannot wreck it.
 */
export function pantryInterval(defaultDays: number, history: readonly string[]): number {
  const gaps = gapsDays(history).filter((g) => g >= 2).slice(-5);
  if (gaps.length < 2) return clampDays(defaultDays);
  const sorted = [...gaps].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return clampDays(median);
}

/** ISO instant the household is expected to run out. */
export function pantryDueAt(lastBoughtAt: string | Date, intervalDays: number): Date {
  return new Date(new Date(lastBoughtAt).getTime() + intervalDays * 86_400_000);
}

/** ISO instant the reminder text becomes due (a few days before running out). */
export function pantryRemindAt(lastBoughtAt: string | Date, intervalDays: number): Date {
  return new Date(pantryDueAt(lastBoughtAt, intervalDays).getTime() - PANTRY_LEAD_DAYS * 86_400_000);
}

/**
 * Is a reminder due now? Yes when the reminder date has come, the household has not bought since, we have not already texted
 * for this purchase, and it is not so late that the bag was surely replaced elsewhere (two cycles past the date).
 */
export function pantryReminderDue(e: { lastBoughtAt: string | Date; intervalDays: number; lastRemindedAt?: string | Date | null }, now: Date): boolean {
  const remindAt = pantryRemindAt(e.lastBoughtAt, e.intervalDays).getTime();
  if (now.getTime() < remindAt) return false;
  if (e.lastRemindedAt && new Date(e.lastRemindedAt).getTime() >= new Date(e.lastBoughtAt).getTime()) return false;
  return now.getTime() <= pantryDueAt(e.lastBoughtAt, e.intervalDays).getTime() + e.intervalDays * 86_400_000;
}

// ---------------------------------------------------------------------------
// The grocer's calendar
// ---------------------------------------------------------------------------
export interface GrocerSeasonDef {
  id: string;
  name: string;
  /** Takes dates (and an owner's moved date) from this entry of the festival calendar; otherwise `dates` below. */
  festivalId?: string;
  /** Start dates for seasons that are not in the festival calendar. */
  dates?: Record<string, string>;
  approximate: boolean;
  note: string;
  /** Who shops for it (shown as a chip). */
  community: string;
  /** Days before the date to publish the stock-up flyer. */
  flyerLeadDays: number;
  /** Suggested deals, as words only: the owner prices them. */
  ideas: string[];
  /** Butcher counter bookings for whole animals (Eid al-Adha). */
  qurbani?: boolean;
  /** Weeks before the date that bookings should open. */
  bookingsOpenWeeks?: number;
}

export const GROCER_SEASONS: readonly GrocerSeasonDef[] = [
  { id: "diwali", name: "Diwali", festivalId: "diwali", approximate: true, note: "Confirm the date locally.", community: "Hindu, Sikh, Jain", flyerLeadDays: 21, ideas: ["Desi ghee", "Besan and sooji", "Dry fruit and nuts", "Diyas and rangoli"] },
  { id: "ramadan", name: "Ramadan", festivalId: "ramadan", approximate: true, note: "Moon sighting can move this by a day.", community: "Muslim", flyerLeadDays: 14, ideas: ["Dates", "Samosa pastry and spring roll sheets", "Rooh Afza and rose syrup", "Besan, chickpeas and flour"] },
  { id: "eid_al_fitr", name: "Eid al-Fitr", festivalId: "eid_al_fitr", approximate: true, note: "Moon sighting can move this by a day.", community: "Muslim", flyerLeadDays: 10, ideas: ["Vermicelli (seviyan)", "Milk, sugar and cardamom", "Mehndi cones", "Goat and lamb"] },
  { id: "eid_al_adha", name: "Eid al-Adha", festivalId: "eid_al_adha", approximate: true, note: "Moon sighting can move this by a day. Qurbani is done on the 10th to 12th of Dhul Hijjah.", community: "Muslim", flyerLeadDays: 14, ideas: ["Whole goat or sheep booking", "Cow share (one of seven)", "Spices for biryani and korma", "Freezer bags and foil trays"], qurbani: true, bookingsOpenWeeks: 8 },
  { id: "vaisakhi", name: "Vaisakhi", festivalId: "vaisakhi", approximate: false, note: "", community: "Sikh, Punjabi", flyerLeadDays: 10, ideas: ["Atta and besan", "Ghee and paneer", "Sweets and langar supplies"] },
  { id: "navratri", name: "Navratri", festivalId: "navratri", approximate: true, note: "Confirm the date locally.", community: "Hindu, Gujarati", flyerLeadDays: 10, ideas: ["Sabudana, singhara and kuttu flour", "Sendha namak", "Fruit and dry fruit"] },
  { id: "lunar_new_year", name: "Lunar New Year", dates: { "2027": "2027-02-06", "2028": "2028-01-26", "2029": "2029-02-13" }, approximate: false, note: "Chinese, Korean (Seollal) and Vietnamese (Tet) households.", community: "Chinese, Korean, Vietnamese", flyerLeadDays: 14, ideas: ["Dumpling wrappers and rice cakes", "Mandarin oranges", "Nian gao and sesame oil", "Red envelopes"] },
  { id: "mid_autumn", name: "Mid-Autumn and Chuseok", dates: { "2027": "2027-09-15", "2028": "2028-10-03", "2029": "2029-09-22" }, approximate: false, note: "Mooncakes and songpyeon.", community: "Chinese, Korean, Vietnamese", flyerLeadDays: 14, ideas: ["Mooncakes", "Asian pears", "Rice flour and sweet bean paste"] },
  { id: "christmas_caribbean", name: "Christmas and black cake season", dates: { "2026": "2026-12-25", "2027": "2027-12-25", "2028": "2028-12-25" }, approximate: false, note: "Caribbean households soak fruit for black cake weeks ahead.", community: "Caribbean", flyerLeadDays: 28, ideas: ["Mixed fruit and rum for black cake (no alcohol points)", "Sorrel and ginger", "Ham and pimento", "Browning and mixed spice"] },
];

export interface GrocerSeason {
  id: string;
  name: string;
  /** The festival-calendar id, when it has one (drafts and flyers are tagged with it). */
  festivalId: string | null;
  start: string;
  daysUntil: number;
  /** When to publish the stock-up flyer. */
  flyerFrom: string;
  /** The flyer should be out now (the lead time has started). */
  flyerDue: boolean;
  approximate: boolean;
  note: string;
  community: string;
  ideas: string[];
  qurbani: boolean;
  /** Qurbani: the date bookings should open. */
  bookingsOpen: string | null;
  moved: boolean;
}

/** Seasons starting between today and `days` from now, soonest first. `overrides` are the owner's moved lunar dates. */
export function upcomingGrocerSeasons(today: string, days: number, overrides?: FestivalOverrides): GrocerSeason[] {
  const out: GrocerSeason[] = [];
  const year = Number(today.slice(0, 4));
  for (const def of GROCER_SEASONS) {
    for (const y of [year, year + 1]) {
      let start: string | undefined;
      let moved = false;
      if (def.festivalId) {
        const f = getFestival(def.festivalId);
        const r = f ? resolveFestivalDates(f, String(y), overrides) : null;
        start = r?.start;
        moved = r?.moved ?? false;
      } else start = def.dates?.[String(y)];
      if (!start) continue;
      const daysUntil = daysBetween(today, start);
      if (daysUntil < 0 || daysUntil > days) continue;
      const flyerFrom = addDays(start, -def.flyerLeadDays);
      out.push({
        id: def.id,
        name: def.name,
        festivalId: def.festivalId ?? null,
        start,
        daysUntil,
        flyerFrom,
        flyerDue: flyerFrom <= today,
        approximate: def.approximate,
        note: def.note,
        community: def.community,
        ideas: def.ideas,
        qurbani: !!def.qurbani,
        bookingsOpen: def.qurbani ? addDays(start, -7 * (def.bookingsOpenWeeks ?? 8)) : null,
        moved,
      });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** Every festival-calendar id a grocer season can point at (for validating a deal's tag). */
export const GROCER_SEASON_IDS: readonly string[] = GROCER_SEASONS.map((s) => s.id);
export const isGrocerSeasonId = (id: string): boolean => GROCER_SEASON_IDS.includes(id) || FESTIVALS.some((f) => f.id === id);

/**
 * A qurbani (Eid al-Adha sacrifice) item, by its name: "Whole goat, qurbani", "Cow share, qurbani (one of seven)", "Udhiyah sheep".
 * Qurbani is only picked up on the shop's Eid plan days; an aqiqah goat or a weekend curry cut is not.
 */
export function isQurbaniName(name: string): boolean {
  return /qurb[aā]ni|udh?iy?ah|udhiya|ضحیہ|قربانی|कुर्बानी|क़ुर्बानी|ਕੁਰਬਾਨੀ/i.test(name);
}
