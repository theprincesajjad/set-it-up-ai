/**
 * Seasonal promo templates per trade (docs/business/people-side.md gap 6, solo-pro-launch.md §3): Valentine's nails, Eid brows,
 * back-to-school cuts, holiday gel... A paid shop picks one, edits the words and sends it to its regulars by app push and email
 * (never by text), inside its promo allowance (plans.ts promoAllowance).
 *
 * The copy lives in the i18n catalogue (`promo.tpl.<key>.title` / `.body`, en first; hi, ur and pa from the copy team) so a template
 * reads in the shop owner's language. `{shop}` is the shop's name. Bodies stay under the push limit (messagingApi.PUSH_MAX_BODY).
 *
 * A template's season is a fixed window ("02-01" to "02-14", shop time, may wrap the new year) or a festival from festivals.ts
 * (Eid, Diwali, Karva Chauth...), whose dates move each year; its window opens `leadDays` before the festival and closes the day after.
 */
import { resolveFestivalDates, getFestival } from "./festivals.js";

/** Trades with their own template list. Other kinds of shop get the general list. */
export const PROMO_TRADES = ["nails", "brows_lashes", "makeup", "barber", "salon", "cafe", "bakery", "grocery", "pet", "general"] as const;
export type PromoTrade = (typeof PROMO_TRADES)[number];

export type PromoSeasonWindow = { from: string; to: string } | { festival: string; leadDays: number };

export interface PromoTemplate {
  /** Stable id, also the i18n key stem: `promo.tpl.<key>.title`. */
  key: string;
  trade: PromoTrade;
  /** A short season id for grouping ("valentines", "back_to_school", "eid", "holiday"). */
  season: string;
  window: PromoSeasonWindow;
  titleKey: `promo.tpl.${string}.title`;
  bodyKey: `promo.tpl.${string}.body`;
}

type Row = [key: string, season: string, window: PromoSeasonWindow];
const fixed = (from: string, to: string): PromoSeasonWindow => ({ from, to });
const fest = (festival: string, leadDays = 21): PromoSeasonWindow => ({ festival, leadDays });

const ROWS: Record<PromoTrade, Row[]> = {
  nails: [
    ["valentines_nails", "valentines", fixed("01-25", "02-14")],
    ["spring_pedicure", "spring", fixed("03-20", "05-15")],
    ["mothers_day_nails", "mothers_day", fixed("04-25", "05-11")],
    ["summer_toes", "summer", fixed("06-01", "07-31")],
    ["eid_nails", "eid", fest("eid_al_fitr")],
    ["diwali_nails", "diwali", fest("diwali")],
    ["holiday_gel", "holiday", fixed("11-25", "12-24")],
  ],
  brows_lashes: [
    ["valentines_lashes", "valentines", fixed("01-25", "02-14")],
    ["eid_brows", "eid", fest("eid_al_fitr")],
    ["wedding_season_brows", "wedding_season", fixed("05-01", "08-31")],
    ["back_to_school_brows", "back_to_school", fixed("08-15", "09-10")],
    ["karva_chauth_brows", "karva_chauth", fest("karva_chauth", 14)],
    ["diwali_lashes", "diwali", fest("diwali")],
    ["holiday_lashes", "holiday", fixed("11-25", "12-24")],
  ],
  makeup: [
    ["valentines_glam", "valentines", fixed("01-25", "02-14")],
    ["prom_makeup", "prom", fixed("04-15", "06-15")],
    ["wedding_season_makeup", "wedding_season", fixed("05-01", "09-30")],
    ["eid_glam", "eid", fest("eid_al_fitr")],
    ["diwali_glam", "diwali", fest("diwali")],
    ["new_years_eve_glam", "new_year", fixed("12-10", "12-31")],
  ],
  barber: [
    ["new_year_cut", "new_year", fixed("12-27", "01-15")],
    ["eid_cuts", "eid", fest("eid_al_fitr", 14)],
    ["graduation_cuts", "graduation", fixed("05-25", "06-30")],
    ["fathers_day_cuts", "fathers_day", fixed("06-01", "06-21")],
    ["back_to_school_cuts", "back_to_school", fixed("08-10", "09-10")],
    ["holiday_cuts", "holiday", fixed("12-01", "12-24")],
  ],
  salon: [
    ["valentines_blowout", "valentines", fixed("01-25", "02-14")],
    ["spring_colour", "spring", fixed("03-15", "04-30")],
    ["wedding_season_hair", "wedding_season", fixed("05-01", "08-31")],
    ["back_to_school_kids_cuts", "back_to_school", fixed("08-10", "09-10")],
    ["diwali_hair", "diwali", fest("diwali")],
    ["holiday_party_hair", "holiday", fixed("11-25", "12-31")],
  ],
  cafe: [
    ["new_year_slow_month", "new_year", fixed("01-02", "01-31")],
    ["valentines_treats", "valentines", fixed("02-01", "02-14")],
    ["spring_patio", "spring", fixed("04-15", "05-31")],
    ["back_to_school_coffee", "back_to_school", fixed("08-25", "09-15")],
    ["pumpkin_season", "autumn", fixed("09-20", "11-10")],
    ["holiday_drinks", "holiday", fixed("11-20", "12-31")],
  ],
  bakery: [
    ["valentines_cookies", "valentines", fixed("02-01", "02-14")],
    ["mothers_day_cakes", "mothers_day", fixed("04-25", "05-11")],
    ["back_to_school_lunch_bakery", "back_to_school", fixed("08-25", "09-15")],
    ["eid_sweets", "eid", fest("eid_al_fitr")],
    ["diwali_mithai", "diwali", fest("diwali")],
    ["holiday_cookies", "holiday", fixed("11-20", "12-24")],
  ],
  grocery: [
    ["ramadan_dates", "ramadan", fest("ramadan", 14)],
    ["bbq_season", "summer", fixed("05-15", "07-31")],
    ["eid_al_adha_grocery", "eid", fest("eid_al_adha")],
    ["back_to_school_lunch", "back_to_school", fixed("08-20", "09-15")],
    ["thanksgiving_grocery", "thanksgiving", fixed("09-25", "10-13")],
    ["diwali_sweets_grocery", "diwali", fest("diwali")],
    ["holiday_baking", "holiday", fixed("11-15", "12-24")],
  ],
  pet: [
    ["new_year_bath", "new_year", fixed("01-02", "01-31")],
    ["valentines_pet", "valentines", fixed("02-01", "02-14")],
    ["spring_shed", "spring", fixed("03-20", "05-15")],
    ["summer_cut_pet", "summer", fixed("06-01", "07-31")],
    ["halloween_pet", "halloween", fixed("10-10", "10-31")],
    ["holiday_photo_groom", "holiday", fixed("11-20", "12-20")],
  ],
  general: [
    ["new_year_general", "new_year", fixed("01-02", "01-31")],
    ["valentines_general", "valentines", fixed("02-01", "02-14")],
    ["spring_general", "spring", fixed("03-20", "05-15")],
    ["back_to_school_general", "back_to_school", fixed("08-20", "09-15")],
    ["thanksgiving_general", "thanksgiving", fixed("09-25", "10-13")],
    ["holiday_general", "holiday", fixed("11-20", "12-24")],
  ],
};

export const PROMO_TEMPLATES: readonly PromoTemplate[] = PROMO_TRADES.flatMap((trade) =>
  ROWS[trade].map(([key, season, window]): PromoTemplate => ({ key, trade, season, window, titleKey: `promo.tpl.${key}.title`, bodyKey: `promo.tpl.${key}.body` })),
);

/** Which template list a kind of shop gets (verticals.ts ids, including the solo trades nails, brows_lashes and makeup). */
export function promoTradeFor(vertical: string | null | undefined): PromoTrade {
  switch (vertical) {
    case "nails":
    case "brows_lashes":
    case "makeup":
    case "barber":
    case "salon":
    case "cafe":
    case "bakery":
    case "grocery":
    case "pet":
      return vertical;
    case "spa":
    case "beauty_supply":
      return "salon";
    case "bar":
    case "restaurant":
    case "restaurant_south_asian":
      return "cafe";
    default:
      return "general";
  }
}

export function promoTemplatesFor(vertical: string | null | undefined): PromoTemplate[] {
  const trade = promoTradeFor(vertical);
  return PROMO_TEMPLATES.filter((t) => t.trade === trade);
}

export function promoTemplate(key: string): PromoTemplate | undefined {
  return PROMO_TEMPLATES.find((t) => t.key === key);
}

const DAY = 86_400_000;
const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The season's next or current window for a shop-local day (YYYY-MM-DD): `{ start, end }` as YYYY-MM-DD, end inclusive.
 * Null when a festival has no known date in the next two years.
 */
export function promoWindow(t: Pick<PromoTemplate, "window">, today: string): { start: string; end: string } | null {
  const year = Number(today.slice(0, 4));
  const candidates: { start: string; end: string }[] = [];
  for (const y of [year - 1, year, year + 1]) {
    if ("festival" in t.window) {
      const f = getFestival(t.window.festival);
      const d = f ? resolveFestivalDates(f, String(y)) : null;
      if (!d) continue;
      candidates.push({ start: isoDay(dayMs(d.start) - t.window.leadDays * DAY), end: isoDay(dayMs(d.end ?? d.start) + DAY) });
    } else {
      const { from, to } = t.window;
      const wraps = to < from;
      candidates.push({ start: `${y}-${from}`, end: `${wraps ? y + 1 : y}-${to}` });
    }
  }
  const t0 = dayMs(today);
  return candidates.filter((c) => dayMs(c.end) >= t0).sort((a, b) => dayMs(a.start) - dayMs(b.start))[0] ?? null;
}

export interface SeasonalPromoTemplate extends PromoTemplate {
  start: string;
  end: string;
  /** True when today is inside the window. */
  inSeason: boolean;
  /** Days until the window opens (0 when in season). */
  daysAway: number;
}

/** A trade's templates with their windows, in-season first, then the soonest. Templates with no known date drop out. */
export function seasonalPromoTemplates(vertical: string | null | undefined, today: string): SeasonalPromoTemplate[] {
  const t0 = dayMs(today);
  return promoTemplatesFor(vertical)
    .map((t) => {
      const w = promoWindow(t, today);
      if (!w) return null;
      const inSeason = dayMs(w.start) <= t0 && t0 <= dayMs(w.end);
      return { ...t, ...w, inSeason, daysAway: inSeason ? 0 : Math.round((dayMs(w.start) - t0) / DAY) };
    })
    .filter((x): x is SeasonalPromoTemplate => !!x)
    .sort((a, b) => Number(b.inSeason) - Number(a.inSeason) || a.daysAway - b.daysAway || a.key.localeCompare(b.key));
}
