import type { TileKey } from "./shared";

/**
 * Wave U copy for the three directions, kept here (dev only) until the founder picks one; the winner moves into src/copy/en-CA.ts
 * with hi/ur/pa. Facts every line must keep: loyalty is free forever; the card lives in Apple Wallet or Google Wallet, no app to
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

/** A: direct. Short imperatives, verbs first, nothing extra. */
export const COPY_A: DirectionCopy = {
  nav: "Start free",
  hero: {
    title: "Bring them back.",
    sub: "Stamp cards that live in your customers’ phones, in Apple Wallet or Google Wallet. You stamp from any phone at the counter.",
    free: "Free forever.",
    primary: "Start free",
    secondary: "See how it works",
    note: "No app to download. About 5 minutes to set up.",
  },
  how: {
    title: "Five minutes to set up. One tap to stamp.",
    sub: "No new hardware. No training day.",
    steps: [
      { t: "Make your card.", b: "Your logo, your colour, your reward. About five minutes, start to finish." },
      { t: "They scan once.", b: "Customers scan your QR code and the card goes into Apple Wallet or Google Wallet. Nothing to download." },
      { t: "Stamp at the counter.", b: "Use the phone or tablet you already have. One tap per visit." },
    ],
  },
  shops: {
    title: "Coffee to cracked screens.",
    sub: "If people come back to you, it works for you.",
    cta: "Start free",
    tiles: [
      { key: "cafe", label: "Cafés", line: "Every tenth coffee, on you." },
      { key: "repair", label: "Phone repair", line: "Be the shop they call next time." },
      { key: "barber", label: "Barbers", line: "Back in the chair every three weeks." },
      { key: "nails", label: "Nail studios", line: "Every sixth fill, on the house." },
      { key: "bakery", label: "Bakeries", line: "Same Saturday. Same loaf." },
      { key: "corner", label: "Corner stores", line: "Small buys add up." },
    ],
  },
};

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

/** C: benefit-led. Lead with what the owner gets, then prove it with the facts. */
export const COPY_C: DirectionCopy = {
  nav: "Get started free",
  hero: {
    title: "More repeat customers.",
    titleQuiet: "Zero cost.",
    sub: "A digital stamp card your customers keep in Apple Wallet or Google Wallet. Free forever, and live at your counter in about five minutes.",
    primary: "Get started free",
    secondary: "See how it works",
    note: "Need more? Pro is $29 a month.",
    chips: ["Free forever", "5-minute setup", "No app to download", "Any phone or tablet"],
  },
  how: {
    title: "From sign-up to first stamp in five minutes.",
    sub: "Everything you need is already in your pocket.",
    steps: [
      { t: "No designer needed", b: "Pick your reward and your colours. Your card is ready in about five minutes." },
      { t: "No app to download", b: "Customers scan your QR code and save the card to Apple Wallet or Google Wallet." },
      { t: "No new hardware", b: "Stamp from the phone or tablet already at your counter. One tap per visit." },
    ],
  },
  shops: {
    title: "Works anywhere people come back.",
    sub: "Set up for cafés, repair shops, salons, bakeries, grocers and more.",
    cta: "Get started free",
    tiles: [
      { key: "cafe", label: "Cafés", line: "Turn first coffees into daily ones." },
      { key: "repair", label: "Repair shops", line: "Be the first call for the next repair." },
      { key: "barber", label: "Barbers", line: "Keep the chair full." },
      { key: "nails", label: "Nail studios", line: "More regulars, fewer gaps in the book." },
      { key: "bakery", label: "Bakeries", line: "Make Saturday a habit." },
      { key: "corner", label: "Corner stores", line: "Give quick stops a reason to return." },
    ],
  },
};
