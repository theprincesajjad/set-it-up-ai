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
  /** TODO(B): nail and brow verticals once B adds them; salon is the closest today. */
  vertical: Vertical;
  /** The same string `data-trade` uses on the shell. */
  trade: Vertical;
  /** Display name of the sample pro on the phone. */
  sampleName: string;
}

export const SOLO_PAGES: Record<SoloPageId, SoloPageConfig> = {
  nail: { id: "nail", path: "/for-nail-techs", src: "nail-techs", vertical: "salon", trade: "salon", sampleName: "Mira Beauty Studio" },
  barber: { id: "barber", path: "/for-barbers", src: "barbers", vertical: "barber", trade: "barber", sampleName: "Corner Cuts" },
  groom: { id: "groom", path: "/for-groomers", src: "groomers", vertical: "pet", trade: "pet", sampleName: "Pawfect Grooming" },
};

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

/** Sample appointment times on the hero phone (day label and clock). */
export const SAMPLE_SLOTS = ["Sat 10:00 am", "Sat 11:30 am", "Sat 1:00 pm", "Sun 10:00 am"] as const;
