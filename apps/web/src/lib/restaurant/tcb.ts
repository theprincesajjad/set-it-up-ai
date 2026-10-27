/**
 * Pure helpers for the tiffin, catering and banquet screens: the menu grid's cell text, the one-line "next
 * action" on a catering card, which payment methods to offer, and hold countdown wording. No React, no fetching.
 */
import type { restaurantApi, tiffinApi } from "@ll/shared";

type MenuItem = tiffinApi.MenuItem;
export const MAX_DISHES = 30;
const DAY = 86_400_000;

/** A grid cell as text: one dish per line, words after " - " are the description. */
export const toText = (items: MenuItem[]): string => items.map((i) => (i.description ? `${i.name} - ${i.description}` : i.name)).join("\n");

/** Cell text back to dishes. A dish the cell already had (same name, any case) keeps its dietary tags, translations and per-serving. */
export function fromText(text: string, prev: MenuItem[]): MenuItem[] {
  const old = new Map(prev.map((i) => [i.name.toLowerCase(), i]));
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_DISHES)
    .map((line) => {
      const at = line.indexOf(" - ");
      const name = (at > 0 ? line.slice(0, at) : line).trim().slice(0, 120);
      const description = at > 0 ? line.slice(at + 3).trim().slice(0, 500) : "";
      const keep = old.get(name.toLowerCase());
      return { ...(keep ?? {}), name, ...(description ? { description } : { description: undefined }) } as MenuItem;
    });
}

/** Drop undefined keys so a saved dish never carries `description: undefined`. */
export const cleanItems = (items: MenuItem[]): MenuItem[] => items.map((i) => Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined)) as MenuItem);

/** A dish counts as translated when Hindi, Urdu and Punjabi names are all given. */
export const translated = (i: MenuItem): boolean => (["hi", "ur", "pa"] as const).every((l) => !!i.translations?.[l]?.name?.trim());

type Method = tiffinApi.TiffinPaymentMethod;
/** Methods to offer in order: card, bank debit, e-transfer, cash. */
export const offeredMethods = (a: { card: boolean; pad: boolean; etransfer: boolean; cash: boolean }): Method[] => (["card", "pad", "etransfer", "cash"] as const).filter((m) => a[m]);

export type NextTone = "accent" | "info" | "neutral";
const METHOD_WORD: Record<string, string> = { etransfer: "e-transfer", cash: "cash", cheque: "cheque", card: "card", other: "other" };

/**
 * One line on a catering pipeline card (design C1): what happens next. Only "call back today" is the accent colour;
 * waiting on a customer is info blue. A quote sent two or more days ago and never opened is called out.
 */
export function nextAction(e: restaurantApi.CateringEventDto, now: number, dayShort: (d: string) => string = (d) => d): { tone: NextTone; text: string } | null {
  const days = (iso: string) => Math.floor((now - Date.parse(iso)) / DAY);
  if (e.status === "inquiry") return e.lineItems.length ? { tone: "info", text: "Menu built, send the quote" } : { tone: "accent", text: days(e.createdAt) >= 1 ? `Waiting ${days(e.createdAt)} days: call back` : "New: call back today" };
  if (e.status === "tasting") return { tone: "info", text: e.tastingAt ? `Tasting ${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(e.tastingAt))}` : "Tasting booked" };
  if (e.status === "quoted") {
    if (e.approvedAt && !e.depositPaidAt) return { tone: "info", text: `Approved, deposit awaiting${e.referenceCode ? ` · ${e.referenceCode}` : ""}` };
    if (!e.quoteSentAt) return { tone: "neutral", text: "Quote not sent" };
    if (!e.quoteOpenedAt && now - Date.parse(e.quoteSentAt) >= 2 * DAY) return { tone: "info", text: `Sent ${days(e.quoteSentAt)} days ago, not opened` };
    return { tone: "info", text: e.quoteOpenedAt ? "Opened, waiting on the customer" : "Sent, waiting on the customer" };
  }
  if (e.status === "confirmed") return { tone: "neutral", text: `Deposit in${e.depositMethod ? ` by ${METHOD_WORD[e.depositMethod] ?? e.depositMethod}` : ""}${e.depositReceivedOn ? ` ${dayShort(e.depositReceivedOn)}` : ""}` };
  if (e.status === "completed") return { tone: "neutral", text: "Completed" };
  return null;
}

/** "Hold · 41 h" or "Hold · 5 d" for a calendar chip. */
export function holdWord(iso: string | null | undefined, now: number): string {
  if (!iso) return "Hold";
  const h = Math.max(0, Math.floor((Date.parse(iso) - now) / 3_600_000));
  return h >= 48 ? `Hold · ${Math.floor(h / 24)} d` : `Hold · ${h} h`;
}

/** "14 h 20 m" / "2 d 3 h" until an instant (the skip-cutoff chip on Today). */
export function until(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  return d ? `${d} d ${h} h` : `${h} h ${mins % 60} m`;
}

/** Postal prefixes that more than one route claims (L5V on A and B): auto-assign can't tell them apart. Prefix to route names, case-insensitive. */
export function overlappingPrefixes(routes: { name: string; areas: string[] }[]): { prefix: string; routes: string[] }[] {
  const by = new Map<string, Set<string>>();
  for (const r of routes) for (const a of r.areas) {
    const p = a.replace(/\s+/g, "").toUpperCase();
    if (!p) continue;
    const names = by.get(p) ?? new Set<string>();
    names.add(r.name);
    by.set(p, names);
  }
  return [...by.entries()].filter(([, n]) => n.size > 1).map(([prefix, n]) => ({ prefix, routes: [...n] })).sort((a, b) => a.prefix.localeCompare(b.prefix));
}

/** "Mon 8:00 a.m." style stamp for a skip cutoff, then the meal day: "Wed 8:00 a.m.: last skip for Thursday" (Toronto time). */
export function cutoffSentence(cutoffAt: string, mealDate: string): string {
  const when = new Date(cutoffAt);
  const day = when.toLocaleDateString("en-CA", { weekday: "short", timeZone: "America/Toronto" });
  const time = when.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" });
  const meal = new Date(`${mealDate}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", timeZone: "UTC" });
  return `${day} ${time}: last skip for ${meal}`;
}

const DIET_ONLY = /^(strict\s+)?(jain|vegetarian|vegan|halal|pure veg(etarian)?|no onion,? (or )?garlic)\.?$/i;

/** The same note on several people reads once ("No peanuts: Ayesha (2), Hamza (1)"); a note that only names a diet (Jain) is a diet, not an allergy. */
export function groupDietNotes(items: { customer: string | null; servings: number; note: string }[]): { note: string; diet: boolean; people: string[] }[] {
  const by = new Map<string, { note: string; diet: boolean; people: string[] }>();
  for (const n of items) {
    const note = n.note.trim().replace(/\.$/, "");
    const key = note.toLowerCase();
    const g = by.get(key) ?? { note, diet: DIET_ONLY.test(n.note.trim()), people: [] };
    g.people.push(`${n.customer?.split(" ")[0] ?? "Subscriber"} (${n.servings})`);
    by.set(key, g);
  }
  return [...by.values()].sort((a, b) => Number(a.diet) - Number(b.diet));
}

/** A weekly price stretched over a month (52 weeks / 12), the same sum the server uses when a weekly plan is billed monthly. */
export const monthlyOfWeekly = (weeklyCents: number) => Math.round((weeklyCents * 52) / 12);
