/** Pure helpers for the drop-off slots page: the 7-day grid by hour, today's list, and the hours summary. */
import type { commerceApi, merchantApi } from "@ll/shared";

export interface GridCell {
  booked: number;
  capacity: number;
  state: "open" | "full" | "closed";
}
export interface Grid {
  days: { date: string; label: string; dayNum: string; weekday: string }[];
  hours: number[];
  cells: Record<string, GridCell>;
}

const fmtDay = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const localHour = (d: Date, tz: string) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(d));

/** `${date}|${hour}` key into `cells`. */
export const cellKey = (date: string, hour: number) => `${date}|${hour}`;

export function addDaysISO(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Slots grouped into cells of one local hour per day. A day or hour with no slots at all is "closed". */
export function buildGrid(slots: commerceApi.SlotDto[], tz: string, now: Date, dayCount = 7): Grid {
  const start = fmtDay(now, tz);
  const days = Array.from({ length: dayCount }, (_, i) => {
    const date = addDaysISO(start, i);
    const d = new Date(`${date}T12:00:00Z`);
    const weekday = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short" }).format(d);
    const dayNum = String(Number(date.slice(8)));
    return { date, weekday, dayNum, label: `${weekday} ${dayNum}` };
  });
  const dates = new Set(days.map((d) => d.date));
  const cells: Record<string, GridCell> = {};
  const hours = new Set<number>();
  for (const s of slots) {
    const at = new Date(s.startsAt);
    const date = fmtDay(at, tz);
    if (!dates.has(date)) continue;
    const h = localHour(at, tz);
    hours.add(h);
    const k = cellKey(date, h);
    const c = cells[k] ?? { booked: 0, capacity: 0, state: "open" as const };
    c.booked += s.booked;
    c.capacity += s.capacity;
    c.state = c.booked >= c.capacity ? "full" : "open";
    cells[k] = c;
  }
  return { days, hours: [...hours].sort((a, b) => a - b), cells };
}

export function hourLabel(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;
}

/** "10:00 to 17:00" for a day of a location's hours, or "Closed". */
export function dayHours(h: merchantApi.Hours | null | undefined, key: merchantApi.DayKey): string {
  const r = h?.[key];
  return r?.length ? r.map(([a, b]) => `${a} to ${b}`).join(", ") : "Closed";
}

export function clock12(iso: string, tz = "America/Toronto"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(/\./g, "").replace(/\s?([ap])\s?m/i, (_, x: string) => ` ${x.toLowerCase()}m`).replace(":00", "");
}

/** Bookings that start on the shop's calendar day `now`, earliest first. */
export function todaysBookings<T extends { startsAt: string }>(items: T[], tz: string, now: Date): T[] {
  const today = fmtDay(now, tz);
  return items.filter((b) => fmtDay(new Date(b.startsAt), tz) === today).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
