/**
 * The competitor figures on the pricing page and the solo-pro landing pages. Every cell is what the company's own pricing page said on
 * the day it was read (the competitor's `asOf`, printed beside each figure), in the page's own words and currency. The tag is where it
 * was read:
 *   W   the vendor's own pricing page (its Canadian page where it has one)
 *   W?  any other source, named in the note (none today)
 * Rules: no cell is our own arithmetic on someone else's numbers; a figure the page does not state is written as "Not on the ... page",
 * never filled in from a guide or from memory; where the page shows "$" with no currency code the note says "currency not stated".
 * The page's words must match: it may say "each company's own pricing page" only while every cell is W (a unit test holds this). If a
 * W? cell is ever added, the lede and the footnote (copy.solo.compare) must say that other sources are named beside the figure.
 * A unit test fails when any `asOf` is more than 90 days old, which forces a re-read. Square's page could not be re-read on Nov 12, 2026
 * (the site refused automated requests), so its cells keep their Oct 29, 2026 reading: re-read it by hand before launch.
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

/** The most recent day a competitor's page was read (each competitor carries its own `asOf`, printed beside every one of its figures). */
export const SOLO_ASOF = "2026-11-12";

export const SOLO_COMPETITORS: readonly SoloCompetitor[] = [
  {
    // Read on the vendor's pricing page on Nov 12, 2026. The page shows "$" with no currency code, so every money cell says so.
    id: "fresha",
    name: "Fresha",
    host: "fresha.com",
    asOf: "2026-11-12",
    sourceUrl: "https://www.fresha.com/pricing",
    cells: {
      price: { text: "$19.95 a month for one person (Independent); $14.95 per team member a month (Team)", tag: "W", note: "vendor page, currency not stated" },
      free: { text: "No free plan listed; 7-day trial", tag: "W", note: "vendor page" },
      deposit: { text: "Online payments 2.79% + $0.20 per transaction", tag: "W", note: "vendor page, currency not stated" },
      newClient: { text: "20% one-time commission on a new marketplace client, $6 minimum", tag: "W", note: "vendor page, currency not stated" },
      texts: { text: "100 free texts a month per team member, then $0.02 per text; marketing texts $0.08 each", tag: "W", note: "vendor page, currency not stated" },
    },
    fourChairs: { text: "$14.95 per team member a month on Team", tag: "W", note: "vendor page, currency not stated" },
  },
  {
    // Read on the Canadian pricing page on Nov 12, 2026 ("$" with no currency code). It states the subscription and the extra-staff price
    // and nothing about a marketplace fee, deposits or texts, so those cells say exactly that: a figure the page does not state is not shown.
    id: "booksy",
    name: "Booksy",
    host: "booksy.com",
    asOf: "2026-11-12",
    sourceUrl: "https://booksy.com/biz/en-ca/pricing",
    cells: {
      price: { text: "$29.99 a month plus tax; $20 a month plus tax for each extra staff member, up to 14", tag: "W", note: "Canadian page, currency not stated" },
      free: { text: "No free plan listed; free trial, length not stated", tag: "W", note: "Canadian page" },
      deposit: { text: "Not on the Canadian pricing page", tag: "W", note: "Canadian page" },
      newClient: { text: "Not on the Canadian pricing page", tag: "W", note: "Canadian page" },
      texts: { text: "Not on the Canadian pricing page", tag: "W", note: "Canadian page" },
    },
    // What the page states, not a total we worked out from it.
    fourChairs: { text: "$29.99 a month plus tax, and $20 a month plus tax for each extra staff member", tag: "W", note: "Canadian page, currency not stated" },
  },
  {
    id: "square",
    name: "Square Appointments",
    host: "squareup.com/ca",
    asOf: "2026-10-29",
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
