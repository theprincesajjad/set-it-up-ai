import type { TileKey } from "./shared";

/**
 * Wave U copy for direction B (dev only), kept as the snapshot the founder picked; the live copy is in src/copy/en-CA.ts (wave V). Facts every line must keep: loyalty is free forever; the card lives in Apple Wallet or Google Wallet, no app to
 * download; you stamp from any phone or tablet at the counter; setup takes about five minutes; Pro is $29 a month. No "founding",
 * no invented numbers or testimonials, no exclamation marks.
 */

export interface Step {
  t: string;
  b: string;
}
export interface Tile {
  key: TileKey;
  label: string;
  line: string;
}
export interface DirectionCopy {
  hero: { title: string; titleQuiet?: string; sub: string; free?: string; primary: string; secondary: string; note: string; chips?: string[] };
  how: { title: string; sub: string; steps: [Step, Step, Step] };
  shops: { title: string; sub: string; tiles: Tile[]; cta: string };
  nav: string;
}

/** B: warm and neighbourly. Talks about people, not features; the shop owner's own words. */
export const COPY_B: DirectionCopy = {
  nav: "Make your card",
  hero: {
    title: "Your regulars, on repeat.",
    sub: "A stamp card for the people who keep coming back. It lives in their Apple Wallet or Google Wallet, you stamp it from the phone behind the counter, and it’s free for as long as you’re open.",
    primary: "Make your card",
    secondary: "How it works",
    note: "Nothing for anyone to download. About five minutes to set up.",
  },
  how: {
    title: "Ready before the morning rush.",
    sub: "Three small steps, about five minutes, and no new hardware.",
    steps: [
      { t: "Make it look like you", b: "Add your logo and colour, then choose what the last stamp earns." },
      { t: "Leave the code by the till", b: "Customers scan it once and the card lands in their phone’s wallet. No app to download." },
      { t: "Stamp, and say hello", b: "Tap a stamp from any phone or tablet. Their card fills up, visit by visit." },
    ],
  },
  shops: {
    title: "Made for the main street.",
    sub: "For the places you know by name, and the people who know yours.",
    cta: "Make your card",
    tiles: [
      { key: "cafe", label: "Cafés", line: "For the oat flat white at eight." },
      { key: "repair", label: "Repair shops", line: "For the second cracked screen, and the third." },
      { key: "barber", label: "Barbers", line: "For the touch-up every three weeks." },
      { key: "nails", label: "Nail studios", line: "For the standing Thursday appointment." },
      { key: "bakery", label: "Bakeries", line: "For the Saturday sourdough line." },
      { key: "corner", label: "Corner stores", line: "For the milk, the paper and the chat." },
    ],
  },
};
