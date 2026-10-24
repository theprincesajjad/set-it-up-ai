/**
 * Web ordering maths and cart storage for restaurant shops (desi1). Pure and client-safe.
 * The server prices every order from the dish's options (services/orders.ts applyItemOptions); this module only
 * previews the same sums, so a total on screen can differ by a cent from the server's at most. The server's answer wins.
 */
import type { commerceApi } from "@ll/shared";
import { addDays, torontoDay, torontoInstant } from "./util";

export type Item = commerceApi.CatalogItemDto;
export type ItemOptions = NonNullable<Item["options"]>;
export type OptionGroup = ItemOptions["groups"][number];
export type Option = OptionGroup["options"][number];

export interface CartLine {
  /** itemId + sorted option ids: the same dish with the same choices is one line. */
  key: string;
  itemId: string;
  qty: number;
  optionIds: string[];
}
export interface Cart {
  lines: CartLine[];
}

export const MAX_LINE_QTY = 20;

export const lineKey = (itemId: string, optionIds: string[]) => `${itemId}:${[...optionIds].sort().join(",")}`;

/** The option a required single group falls back to: the one marked default, else the first. */
export function groupDefault(g: OptionGroup): Option | undefined {
  if (g.type !== "single") return undefined;
  return g.options.find((o) => o.default) ?? (g.required ? g.options[0] : undefined);
}

/** Preselected option ids for a dish (required single groups, plus any option marked default). */
export function defaultOptionIds(item: Pick<Item, "options">): string[] {
  return (item.options?.groups ?? []).flatMap((g) => {
    const d = groupDefault(g);
    return d ? [d.id] : [];
  });
}

/**
 * Unit price for a dish with these picks, and the picks as labelled rows. A required single group with no pick uses its default,
 * as the server does. A group with priceMode "absolute" sets the price; every other pick adds to it.
 */
export function priceDish(item: Pick<Item, "priceCents" | "options">, optionIds: string[]): { unitCents: number; picks: { group: string; option: string; priceCents: number; serves?: number }[]; serves: number | null } {
  let unit = item.priceCents;
  const picks: { group: string; option: string; priceCents: number; serves?: number }[] = [];
  let serves: number | null = null;
  for (const g of item.options?.groups ?? []) {
    let chosen = g.options.filter((o) => optionIds.includes(o.id));
    if (!chosen.length && g.required) chosen = [groupDefault(g)!];
    if (g.type === "single") chosen = chosen.slice(0, 1);
    for (const o of chosen) {
      if (g.priceMode === "absolute") unit += o.priceCents - item.priceCents;
      else unit += o.priceCents;
      picks.push({ group: g.name, option: o.name, priceCents: g.priceMode === "absolute" ? o.priceCents - item.priceCents : o.priceCents, ...(o.serves ? { serves: o.serves } : {}) });
      if (o.serves && g.priceMode === "absolute") serves = o.serves;
    }
  }
  return { unitCents: unit, picks, serves };
}

/** "Raita, 1 L" -> "Raita", "Garlic naan × 20" -> "Garlic naan": the short name of an add-on for a one-line summary. */
export const shortOptionName = (name: string) => name.replace(/,.*$/, "").replace(/\s+[×x]\s*\d+.*$/i, "").trim();

/**
 * The order summary line: "<dish> · Half degh (serves 8) · Hot · + Raita, + Garlic naan". Sizes carry how many they serve,
 * other single picks are named, add-ons are "+ name" and joined with commas.
 */
export function summaryLine(item: Pick<Item, "priceCents" | "options">, dishName: string, optionIds: string[], sizeLabel: (name: string, serves: number) => string): string {
  const parts: string[] = [dishName];
  const adds: string[] = [];
  for (const g of item.options?.groups ?? []) {
    let chosen = g.options.filter((o) => optionIds.includes(o.id));
    if (!chosen.length && g.required) chosen = [groupDefault(g)!];
    if (g.type === "single") chosen = chosen.slice(0, 1);
    for (const o of chosen) {
      if (g.type === "multi") adds.push(`+ ${shortOptionName(o.name)}`);
      else parts.push(o.serves && g.priceMode === "absolute" ? sizeLabel(o.name, o.serves) : o.name);
    }
  }
  if (adds.length) parts.push(adds.join(", "));
  return parts.join(" · ");
}

/** What a group's option costs to show on the page: the absolute price for a size, "+$x" for the rest. */
export function optionPriceLabel(g: OptionGroup, o: Option): { cents: number; plus: boolean } {
  return g.priceMode === "absolute" ? { cents: o.priceCents, plus: false } : { cents: o.priceCents, plus: o.priceCents > 0 };
}

export function cartCount(cart: Cart): number {
  return cart.lines.reduce((n, l) => n + l.qty, 0);
}

export function cartSubtotal(cart: Cart, items: Map<string, Item>): number {
  return cart.lines.reduce((s, l) => {
    const it = items.get(l.itemId);
    return it ? s + priceDish(it, l.optionIds).unitCents * l.qty : s;
  }, 0);
}

export function addLine(cart: Cart, itemId: string, optionIds: string[], qty = 1): Cart {
  const key = lineKey(itemId, optionIds);
  const has = cart.lines.find((l) => l.key === key);
  if (has) return { lines: cart.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_LINE_QTY, l.qty + qty) } : l)) };
  return { lines: [...cart.lines, { key, itemId, qty: Math.min(MAX_LINE_QTY, qty), optionIds: [...optionIds].sort() }] };
}

export function setQty(cart: Cart, key: string, qty: number): Cart {
  if (qty <= 0) return { lines: cart.lines.filter((l) => l.key !== key) };
  return { lines: cart.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_LINE_QTY, qty) } : l)) };
}

/** Drop lines whose dish is gone from the menu (sold out, removed) so a stale cart can't block checkout. */
export function pruneCart(cart: Cart, items: Map<string, Item>): Cart {
  return { lines: cart.lines.filter((l) => items.has(l.itemId) && !items.get(l.itemId)!.preorderOnly) };
}

/** HST (or the shop's tax) on a subtotal, rounded half-up to the cent like the server's computeTax. */
export const taxOf = (subtotalCents: number, ratePpm: number) => Math.round((Math.max(0, subtotalCents) * ratePpm) / 1_000_000);

/** Pre-order bill: deposit is a share of the whole bill with tax (30% deposit = 30% of the total), the rest is due at pickup. */
export function preorderBill(unitCents: number, qty: number, depositBps: number, ratePpm: number) {
  const subtotal = unitCents * qty;
  const tax = taxOf(subtotal, ratePpm);
  const total = subtotal + tax;
  const deposit = depositBps > 0 && subtotal > 0 ? Math.min(total, Math.round(((subtotal * depositBps) / 10_000 / subtotal) * total)) : 0;
  return { subtotal, tax, total, deposit, balance: total - deposit };
}

// ---------------------------------------------------------------------------
// Cart storage (localStorage, per shop; every read and write is guarded: private windows and blocked storage must not break ordering)
// ---------------------------------------------------------------------------
const cartKey = (slug: string) => `ll.cart.${slug}`;

export function loadCart(slug: string): Cart {
  try {
    const raw = window.localStorage.getItem(cartKey(slug));
    if (!raw) return { lines: [] };
    const parsed = JSON.parse(raw) as Cart;
    if (!Array.isArray(parsed?.lines)) return { lines: [] };
    return { lines: parsed.lines.filter((l) => l && typeof l.itemId === "string" && Number.isInteger(l.qty) && l.qty > 0 && Array.isArray(l.optionIds)).map((l) => ({ ...l, key: lineKey(l.itemId, l.optionIds) })) };
  } catch {
    return { lines: [] };
  }
}

export function saveCart(slug: string, cart: Cart) {
  try {
    if (!cart.lines.length) window.localStorage.removeItem(cartKey(slug));
    else window.localStorage.setItem(cartKey(slug), JSON.stringify(cart));
  } catch {
    // storage unavailable: the cart lives for this page only
  }
}

// ---------------------------------------------------------------------------
// Pickup times
// ---------------------------------------------------------------------------
type Hours = Record<string, [string, string][]> | null | undefined;
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export interface PickupDay {
  /** Shop-local YYYY-MM-DD. */
  date: string;
  /** Pickup times in 15 minute steps: wall clock and the ISO instant. */
  times: { hhmm: string; iso: string }[];
}

/**
 * Days with pickup times after the quoted wait, inside opening hours (15 minute steps, last pickup 15 minutes before close).
 * With no opening hours on file, 11:00 to 21:00. Days with no time left are dropped; at most `days` days ahead.
 */
export function pickupDays(hours: Hours, now: Date, quotedWaitMin: number, days = 3): PickupDay[] {
  const earliest = now.getTime() + quotedWaitMin * 60_000;
  const out: PickupDay[] = [];
  const today = torontoDay(now);
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const dow = DAY_KEYS[new Date(`${date}T12:00:00Z`).getUTCDay()]!;
    const ranges = hours && Object.values(hours).some((w) => w?.length) ? (hours[dow] ?? []) : ([["11:00", "21:00"]] as [string, string][]);
    const times: PickupDay["times"] = [];
    for (const [open, close] of ranges) {
      const start = mins(open);
      let end = mins(close);
      if (end <= start) end += 24 * 60;
      for (let m = start; m <= end - 15; m += 15) {
        const iso = torontoInstant(date, hhmm(m));
        if (new Date(iso).getTime() >= earliest) times.push({ hhmm: hhmm(m), iso: m >= 24 * 60 ? torontoInstant(addDays(date, 1), hhmm(m)) : iso });
      }
    }
    if (times.length) out.push({ date, times });
  }
  return out;
}

/** "NB-4821": the shop's initials and the order number, the code the counter reads out. */
export function pickupCode(shopName: string, orderNumber: number): string {
  const initials = shopName
    .split(/\s+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
    .slice(0, 2)
    .map((w) => w.match(/[\p{L}\p{N}]/u)![0]!.toUpperCase())
    .join("");
  return `${initials || "OR"}-${orderNumber}`;
}

// ---------------------------------------------------------------------------
// Idempotency: one key per order attempt, kept for the tab so a reload or a double tap returns the same order (and its payment).
// ---------------------------------------------------------------------------
const randomKey = () => `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** The key for this exact order (`signature` = cart, time and payment method). A different order gets a new key. */
export function idempotencyKeyFor(slug: string, signature: string): string {
  const k = `ll.idem.${slug}`;
  try {
    const raw = window.sessionStorage.getItem(k);
    if (raw) {
      const saved = JSON.parse(raw) as { sig: string; key: string };
      if (saved.sig === signature && saved.key) return saved.key;
    }
    const key = randomKey();
    window.sessionStorage.setItem(k, JSON.stringify({ sig: signature, key }));
    return key;
  } catch {
    return randomKey();
  }
}
