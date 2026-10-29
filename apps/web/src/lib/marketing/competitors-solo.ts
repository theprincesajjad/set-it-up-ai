/**
 * The competitor figures on the solo-pro landing pages, copied from docs/business/solo-pro-launch.md section 2.1 (read on
 * Oct 28, 2026). Every cell carries the day it was read, where, and a tag for how far to trust it:
 *   W   read on the vendor's own page
 *   W?  third-party guide, undated, or the page did not state the currency
 *   H   hand math from a W figure
 * Currency is part of the cell text when it is not CAD. Nothing here is an estimate: if a figure cannot be tied to a page, it is not in this file.
 */
import type { Sourced } from "./sources";

export type SoloTag = "W" | "W?" | "H";

export interface SoloCell {
  text: string;
  tag: SoloTag;
  /** What the tag means for this cell, in words a person reads ("vendor page", "currency not stated"). */
  note: string;
}

export type SoloRow = "price" | "free" | "deposit" | "newClient" | "texts";

export interface SoloCompetitor extends Sourced {
  id: "fresha" | "booksy" | "square";
  name: string;
  host: string;
  cells: Record<SoloRow, SoloCell>;
  /** The price for four chairs, shown on the barber page only. */
  fourChairs: SoloCell;
}

const ASOF = "2026-10-28";

export const SOLO_COMPETITORS: readonly SoloCompetitor[] = [
  {
    id: "fresha",
    name: "Fresha",
    host: "fresha.com",
    asOf: ASOF,
    sourceUrl: "https://www.fresha.com/pricing",
    cells: {
      price: { text: "$19.95 a month for one bookable member, then $14.95 per extra member", tag: "W", note: "vendor page, currency not stated" },
      free: { text: "No free plan, 7-day trial", tag: "W", note: "vendor page" },
      deposit: { text: "Online payments 2.79% + $0.20", tag: "W", note: "vendor page, currency not stated" },
      newClient: { text: "20% of a new client's first visit, $6 minimum", tag: "W", note: "vendor page" },
      texts: { text: "100 free texts a month, then $0.02", tag: "W", note: "vendor page" },
    },
    fourChairs: { text: "$14.95 per member a month on Team", tag: "W", note: "vendor page, currency not stated" },
  },
  {
    id: "booksy",
    name: "Booksy",
    host: "booksy.com",
    asOf: ASOF,
    sourceUrl: "https://booksy.com/biz/en-ca/pricing",
    cells: {
      price: { text: "$29.99 a month plus tax, $20 per extra staff", tag: "W", note: "Canadian page" },
      free: { text: "No free plan, free trial", tag: "W", note: "Canadian page" },
      deposit: { text: "Not on the Canadian page", tag: "W", note: "Canadian page" },
      newClient: { text: "Boost: 30% of a new client's first visit", tag: "W?", note: "third-party guide, koalendar.com" },
      texts: { text: "Included", tag: "W", note: "Canadian page" },
    },
    fourChairs: { text: "$29.99 + 3 × $20 = $89.99 a month, plus tax", tag: "H", note: "hand math from the Canadian page" },
  },
  {
    id: "square",
    name: "Square Appointments",
    host: "squareup.com/ca",
    asOf: ASOF,
    sourceUrl: "https://squareup.com/ca/en/appointments/pricing",
    cells: {
      price: { text: "Free for one location; Plus $35 per location a month", tag: "W", note: "Canadian page" },
      free: { text: "Free plan, no employee limit", tag: "W", note: "Canadian page" },
      deposit: { text: "No deposits or no-show fees on Free", tag: "W", note: "Canadian page" },
      newClient: { text: "None", tag: "W", note: "Canadian page" },
      texts: { text: "Text and email reminders included", tag: "W", note: "Canadian page" },
    },
    fourChairs: { text: "Free for one location, no per-chair charge", tag: "W", note: "Canadian page" },
  },
];

export const SOLO_ROWS: readonly SoloRow[] = ["price", "free", "deposit", "newClient", "texts"];
