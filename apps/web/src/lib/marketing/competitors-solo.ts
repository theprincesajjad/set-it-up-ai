/**
 * The competitor figures on the pricing page and the solo-pro landing pages, copied from docs/business/pro-value.md §1.1 (read on
 * Oct 29, 2026; it updates solo-pro-launch.md §2.1). Every cell carries the day it was read, where, and a tag for how far to trust it:
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

const ASOF = "2026-10-29";

export const SOLO_COMPETITORS: readonly SoloCompetitor[] = [
  {
    id: "fresha",
    name: "Fresha",
    host: "fresha.com",
    asOf: ASOF,
    sourceUrl: "https://www.fresha.com/pricing",
    cells: {
      price: { text: "US$19.95 a month for one bookable member; Team US$14.95 per member", tag: "W", note: "PricingSaaS 2026 Q2 copy of the vendor page" },
      free: { text: "No free plan, 7-day trial", tag: "W", note: "vendor page" },
      deposit: { text: "Online payments 2.79% + $0.20", tag: "W", note: "vendor page, currency not stated" },
      newClient: { text: "20% of a new client's first visit, US$6 minimum", tag: "W", note: "PricingSaaS 2026 Q2 copy of the vendor page" },
      texts: { text: "Marketing texts paid per message, about US$0.02 to US$0.08", tag: "W?", note: "third-party guides, Toolradar and CostBench" },
    },
    fourChairs: { text: "US$14.95 per member a month on Team", tag: "W", note: "PricingSaaS 2026 Q2 copy of the vendor page" },
  },
  {
    id: "booksy",
    name: "Booksy",
    host: "booksy.com",
    asOf: ASOF,
    sourceUrl: "https://booksy.com/biz/en-ca/pricing",
    cells: {
      price: { text: "US$29.99 a month for one user, US$20 per extra staff member", tag: "W?", note: "third-party guide, koalendar.com" },
      free: { text: "No free plan, 14-day trial", tag: "W?", note: "third-party guide, koalendar.com" },
      deposit: { text: "Not on the Canadian page", tag: "W", note: "Canadian page" },
      newClient: { text: "Boost: 30% of a new client's first visit", tag: "W?", note: "third-party guide, koalendar.com" },
      texts: { text: "Included", tag: "W", note: "Canadian page" },
    },
    fourChairs: { text: "US$29.99 + 3 × US$20 = US$89.99 a month", tag: "H", note: "hand math from koalendar.com" },
  },
  {
    id: "square",
    name: "Square Appointments",
    host: "squareup.com/ca",
    asOf: ASOF,
    sourceUrl: "https://squareup.com/ca/en/appointments/pricing",
    cells: {
      price: { text: "Free for one location; Plus CA$35 per location a month", tag: "W", note: "Canadian page" },
      free: { text: "Free plan, no employee limit", tag: "W", note: "Canadian page" },
      deposit: { text: "No-show protection (card or prepay) on Plus, not on Free", tag: "W", note: "Canadian page" },
      newClient: { text: "None", tag: "W", note: "Canadian page" },
      texts: { text: "Text and email reminders included", tag: "W", note: "Canadian page" },
    },
    fourChairs: { text: "Free for one location, no per-chair charge", tag: "W", note: "Canadian page" },
  },
];

export const SOLO_ROWS: readonly SoloRow[] = ["price", "free", "deposit", "newClient", "texts"];
