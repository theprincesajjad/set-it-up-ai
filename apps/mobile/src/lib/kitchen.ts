/**
 * Pure helpers for the staff kitchen screen and the counter tender choice (no react-native imports, so vitest
 * runs them in plain Node). Mirrors the web kitchen display: tickets sort into New / Cooking / Ready, an item
 * taps queued -> cooking -> ready, and a ticket older than 10 minutes is late.
 */
import type { restaurantApi } from "@ll/shared";

export type KitchenColumn = "new" | "cooking" | "ready";
export const LATE_AFTER_S = 10 * 60;
export const KITCHEN_POLL_MS = 5000;

type Status = restaurantApi.KitchenItemStatus;

export function columnOf(t: Pick<restaurantApi.KitchenTicketDto, "items">): KitchenColumn {
  if (t.items.length > 0 && t.items.every((i) => i.status === "ready")) return "ready";
  if (t.items.some((i) => i.status !== "queued")) return "cooking";
  return "new";
}

/** What a tap on an item does next; null once it is ready. */
export function nextItemStatus(s: Status): "cooking" | "ready" | null {
  return s === "queued" ? "cooking" : s === "cooking" ? "ready" : null;
}

/** Age shown on the ticket: the age the API reported plus the time since that poll landed. */
export function liveAgeSeconds(ageSeconds: number, fetchedAt: number, now: number): number {
  return ageSeconds + Math.max(0, (now - fetchedAt) / 1000);
}

export const isLate = (seconds: number) => seconds >= LATE_AFTER_S;

/** "7:05", or "1:02:09" past an hour. */
export function ageText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Tickets oldest first, grouped by column. */
export function groupTickets(tickets: restaurantApi.KitchenTicketDto[]): Record<KitchenColumn, restaurantApi.KitchenTicketDto[]> {
  const out: Record<KitchenColumn, restaurantApi.KitchenTicketDto[]> = { new: [], cooking: [], ready: [] };
  for (const t of [...tickets].sort((a, b) => b.ageSeconds - a.ageSeconds)) out[columnOf(t)].push(t);
  return out;
}

/** Replace one item's status in a ticket list (optimistic update before the next poll confirms it). */
export function withItemStatus(tickets: restaurantApi.KitchenTicketDto[], itemId: string, status: Status): restaurantApi.KitchenTicketDto[] {
  return tickets.map((t) => (t.items.some((i) => i.id === itemId) ? { ...t, items: t.items.map((i) => (i.id === itemId ? { ...i, status } : i)) } : t));
}

/** Card price with the cash discount taken off (basis points), in whole cents. */
export function cashPriceCents(cardCents: number, cashDiscountBps: number): number {
  return Math.round((cardCents * (10_000 - Math.max(0, Math.min(1000, cashDiscountBps)))) / 10_000);
}

/** The two prices the till shows when dual pricing is on; `cash` equals `card` when it is off. */
export function tenderPrices(subtotalCents: number, cashDiscountBps: number): { card: number; cash: number; saved: number } {
  const cash = cashPriceCents(subtotalCents, cashDiscountBps);
  return { card: subtotalCents, cash, saved: subtotalCents - cash };
}
