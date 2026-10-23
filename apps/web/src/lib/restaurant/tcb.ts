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
