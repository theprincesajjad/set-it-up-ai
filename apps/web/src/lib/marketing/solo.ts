/**
 * The three solo-pro landing pages: which trade colour and sign-up vertical each uses, and the sample services shown on the
 * hero phone. Sample services are made-up examples (the page says so); real prices come from the pro's own list.
 */
import type { Vertical } from "@ll/shared";

export type SoloPageId = "nail" | "barber" | "groom";
export type NailTrade = "nails" | "brows" | "lashes" | "makeup";
export const NAIL_TRADES: readonly NailTrade[] = ["nails", "brows", "lashes", "makeup"];

export interface SoloService {
  name: string;
  minutes: number;
  priceCents: number;
  /** "from" price. */
  from?: boolean;
}

export interface SoloPageConfig {
  id: SoloPageId;
  path: string;
  /** The `src` carried to sign-up so we know which page the owner came from. */
  src: string;
  /** The sign-up vertical (the nail page swaps it per `?trade=`: soloVertical). */
  vertical: Vertical;
  /** The same string `data-trade` uses on the shell. */
  trade: Vertical;
  /** Display name of the sample pro on the phone. */
  sampleName: string;
}

export const SOLO_PAGES: Record<SoloPageId, SoloPageConfig> = {
  nail: { id: "nail", path: "/for-nail-techs", src: "nail-techs", vertical: "nails", trade: "nails", sampleName: "Mira Beauty Studio" },
  barber: { id: "barber", path: "/for-barbers", src: "barbers", vertical: "barber", trade: "barber", sampleName: "Corner Cuts" },
  groom: { id: "groom", path: "/for-groomers", src: "groomers", vertical: "pet", trade: "pet", sampleName: "Pawfect Grooming" },
};

/** The vertical a nail-page trade signs up as (brows and lashes share one). */
export const NAIL_TRADE_VERTICAL: Record<NailTrade, Vertical> = { nails: "nails", brows: "brows_lashes", lashes: "brows_lashes", makeup: "makeup" };

/** The sign-up vertical and the trade colour for a page (and, on the nail page, its `?trade=`). */
export function soloVertical(id: SoloPageId, trade: NailTrade = "nails"): Vertical {
  return id === "nail" ? NAIL_TRADE_VERTICAL[trade] : SOLO_PAGES[id].vertical;
}

/** `?trade=` on the nail page. Anything else is the nail default. */
export function nailTrade(v: string | string[] | undefined): NailTrade {
  const x = Array.isArray(v) ? v[0] : v;
  return (NAIL_TRADES as readonly string[]).includes(x ?? "") && x !== "nails" ? (x as NailTrade) : "nails";
}

export const SAMPLE_SERVICES: Record<NailTrade | "barber" | "groom", SoloService[]> = {
  nails: [
    { name: "Gel manicure", minutes: 60, priceCents: 5500 },
    { name: "Gel fill", minutes: 75, priceCents: 6500 },
    { name: "Pedicure", minutes: 60, priceCents: 6000 },
    { name: "Nail art", minutes: 20, priceCents: 1500, from: true },
  ],
  brows: [
    { name: "Brow lamination", minutes: 60, priceCents: 8500 },
    { name: "Shape and tint", minutes: 45, priceCents: 5500 },
    { name: "Threading", minutes: 15, priceCents: 1500 },
    { name: "Henna brows", minutes: 45, priceCents: 6000 },
  ],
  lashes: [
    { name: "Classic set", minutes: 120, priceCents: 14000 },
    { name: "Hybrid fill", minutes: 75, priceCents: 7500 },
    { name: "Lash lift", minutes: 60, priceCents: 8000 },
    { name: "Removal", minutes: 30, priceCents: 2500 },
  ],
  makeup: [
    { name: "Soft glam", minutes: 60, priceCents: 9000 },
    { name: "Bridal trial", minutes: 90, priceCents: 12000 },
    { name: "Event makeup", minutes: 60, priceCents: 10000 },
    { name: "Lashes add-on", minutes: 15, priceCents: 2000 },
  ],
  barber: [
    { name: "Cut", minutes: 30, priceCents: 3500 },
    { name: "Cut and beard", minutes: 45, priceCents: 5000 },
    { name: "Kids' cut", minutes: 25, priceCents: 2500 },
    { name: "Beard trim", minutes: 15, priceCents: 1800 },
  ],
  groom: [
    { name: "Full groom (small dog)", minutes: 90, priceCents: 7500 },
    { name: "Full groom (large dog)", minutes: 120, priceCents: 9500 },
    { name: "Bath and tidy", minutes: 60, priceCents: 5500, from: true },
    { name: "Nail trim", minutes: 15, priceCents: 2000 },
  ],
};

/** One landing variant: the nail page's four `?trade=` looks, the barber page and the groomer page (copy.solo.trades has the words). */
export type SoloKey = NailTrade | "barber" | "groom";

/** The variant a page renders. */
export function soloKey(id: SoloPageId, trade: NailTrade = "nails"): SoloKey {
  return id === "nail" ? trade : id;
}

/** The sample deposit the optional-deposit sentence names ($20): deposits are off by default and never the lead. */
export const SAMPLE_DEPOSIT_CENTS = 2000;

/** Which three of SAMPLE_SERVICES the phone and the demos show; the second one is the service booked through the page (the DM asks for it). */
export const SHOWN_SERVICES: Record<SoloKey, [number, number, number]> = { nails: [0, 1, 3], brows: [1, 0, 2], lashes: [0, 1, 2], makeup: [0, 1, 2], barber: [0, 1, 2], groom: [2, 0, 3] };

/**
 * A photo in public/marketing (Pexels licence, docs/marketing/photo-credits.md): AVIF first, WebP fallback, the widths in the file names.
 * `w`/`h` are the intrinsic size of the smallest file (for the aspect ratio); `pos` is the crop focus.
 */
export interface SoloPhoto {
  stem: string;
  widths: readonly number[];
  w: number;
  h: number;
  pos?: string;
}

const P = (stem: string, widths: readonly number[], w: number, h: number, pos?: string): SoloPhoto => ({ stem, widths, w, h, pos });
const NAILS_RED = P("nails-red", [800], 800, 1000, "50% 40%");
const NAILS_SALON = P("nails-salon", [800], 800, 600, "50% 45%");
const NAILS_WIDE = P("nails-wide", [1000, 1600], 1000, 625, "72% 50%");
const BROWS = P("brows", [900, 1400], 900, 1125, "50% 45%");
const BROWS_WIDE = P("brows-wide", [1000, 1600], 1000, 625, "60% 50%");
const LASHES = P("lashes", [900, 1400], 900, 1125, "55% 50%");
const LASHES_WIDE = P("lashes-wide", [1000, 1600], 1000, 625, "60% 50%");
const BARBER = P("barber-hero", [900, 1400], 900, 1125, "45% 40%");
const BARBER_CROP = P("barber-crop", [800], 800, 1000, "50% 35%");
const BARBER_WIDE = P("barber-wide", [1000, 1600], 1000, 625, "60% 45%");
const GROOM = P("groom", [900], 900, 1125, "50% 45%");

/**
 * The photos of each variant: `work` stands behind the hero phone (the trade's own work, where the mock had a pink disc), `cover`
 * heads the sample booking page on the phone, `band` sits behind the stamp card. Makeup has no photo of its own yet and uses the
 * lash close-up; the groomer page has one photo (a groomed schnauzer), cropped three ways.
 */
export const SOLO_PHOTOS: Record<SoloKey, { work: SoloPhoto; cover: SoloPhoto; band: SoloPhoto }> = {
  nails: { work: NAILS_RED, cover: NAILS_SALON, band: NAILS_WIDE },
  brows: { work: BROWS, cover: LASHES_WIDE, band: BROWS_WIDE },
  lashes: { work: LASHES, cover: BROWS_WIDE, band: LASHES_WIDE },
  makeup: { work: LASHES, cover: BROWS_WIDE, band: LASHES_WIDE },
  barber: { work: BARBER, cover: BARBER_CROP, band: BARBER_WIDE },
  groom: { work: GROOM, cover: { ...GROOM, pos: "50% 30%" }, band: { ...GROOM, pos: "50% 60%" } },
};

/** `/marketing/<stem>-<w>.<ext> <w>w, ...` */
export function photoSrcSet(p: SoloPhoto, ext: "avif" | "webp"): string {
  return p.widths.map((w) => `/marketing/${p.stem}-${w}.${ext} ${w}w`).join(", ");
}
