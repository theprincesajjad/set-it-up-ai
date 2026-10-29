/**
 * A/B-ready hero copy for the solo landing pages. The copy lives in `LANDING_VARIANTS` (copy/en-CA.ts): per page look
 * (nails, brows, lashes, makeup, barber, groom), per variant id, with "control" the default the pages render. A variant sets the
 * hero eyebrow, the two-line headline, the subhead, the primary button and the order of the three job cards.
 * Assignment and tracking are not here: whoever assigns a variant passes its id to <SoloLanding variant=…>.
 */
import { LANDING_VARIANTS } from "@/copy/en-CA";
import type { SoloKey } from "./solo";

export type JobId = "book" | "remind" | "regulars";

export interface LandingVariant {
  eyebrow: string;
  /** Two lines; the second is set in the trade colour. */
  hook: readonly [string, string];
  /** May use {free}, {monthly}, {client}, {service}. */
  lede: string;
  cta: string;
  /** The three job cards, in order. */
  jobs: readonly [JobId, JobId, JobId];
}

export const CONTROL = "control";

// Type check: every look has a control and every variant has the full shape.
const VARIANTS: { [K in SoloKey]: { control: LandingVariant } & Record<string, LandingVariant> } = LANDING_VARIANTS;

/** The variant ids a look has ("control" first). */
export function variantIds(key: SoloKey): string[] {
  return Object.keys(VARIANTS[key]);
}

/** The copy for one look and variant; an unknown id falls back to control. */
export function landingVariant(key: SoloKey, id: string = CONTROL): LandingVariant & { id: string } {
  const all = VARIANTS[key];
  const v = Object.hasOwn(all, id) ? all[id]! : all.control;
  return { ...v, id: Object.hasOwn(all, id) ? id : CONTROL };
}
