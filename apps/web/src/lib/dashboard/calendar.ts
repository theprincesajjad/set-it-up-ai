/**
 * Pure logic for the appointment calendar (Figma frame 3): time-grid geometry, snapping, drag and resize maths,
 * working windows, labels and the day's numbers. No React, no I/O, so it is unit-tested. Times are shown in
 * the shop's zone (America/Toronto) like the rest of the dashboard; the API takes and returns ISO instants.
 */
import type { appointmentsApi } from "@ll/shared";

export const TZ = "America/Toronto";
export const PX_PER_HOUR = 60;
export const STEP_MIN = 15;
export const DEFAULT_WINDOW: [number, number] = [9 * 60, 18 * 60];
const MIN = 60_000;

type Appt = appointmentsApi.AppointmentDto;
type Staff = appointmentsApi.BookableStaffDto;

// ---------------------------------------------------------------------------
// Dates and time zones
// ---------------------------------------------------------------------------
export function parts(at: Date | string, tz = TZ): { date: string; minutes: number; weekday: number } {
  const d = typeof at === "string" ? new Date(at) : at;
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const date = `${String(get("year")).padStart(4, "0")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}`;
  return { date, minutes: get("hour") * 60 + get("minute"), weekday: weekdayOf(date) };
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const todayOf = (now = new Date(), tz = TZ) => parts(now, tz).date;

/** The instant for a local date and minutes after midnight (DST-safe). */
export function instantAt(date: string, minutes: number, tz = TZ): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const offset = (at: number) => {
    const p = parts(new Date(at), tz);
    const [py, pm, pd] = p.date.split("-").map(Number) as [number, number, number];
    return Date.UTC(py, pm - 1, pd, Math.floor(p.minutes / 60), p.minutes % 60) - Math.floor(at / 60_000) * 60_000;
  };
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const o1 = offset(guess);
  let t = guess - o1;
  const o2 = offset(t);
  if (o2 !== o1) t = guess - o2;
  return new Date(t);
}

/** [from, to) of one local day as ISO instants. */
export function dayBounds(date: string, tz = TZ): { from: string; to: string } {
  return { from: instantAt(date, 0, tz).toISOString(), to: instantAt(addDays(date, 1), 0, tz).toISOString() };
}

/** Monday of the week a date falls in. */
export function weekStart(date: string): string {
  const wd = weekdayOf(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

export function dateLabel(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" }): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-CA", { timeZone: "UTC", ...opts });
}

/** "9:00 am", "12:30 pm". */
export function clock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h < 12 ? "am" : "pm";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "9 am" for the hour gutter. */
export const hourLabel = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12} ${hour % 24 < 12 ? "am" : "pm"}`;

export const timeRange = (a: Appt, tz = TZ) => `${clock(parts(a.startsAt, tz).minutes)} to ${clock(parts(a.endsAt, tz).minutes)}`;

export function duration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const hoursText = (min: number) => `${Math.round((min / 60) * 10) / 10} h`;

// ---------------------------------------------------------------------------
// Snapping, drag and resize
// ---------------------------------------------------------------------------
export const snap = (minutes: number, step = STEP_MIN) => Math.round(minutes / step) * step;
export const pxToMinutes = (px: number, pxPerHour = PX_PER_HOUR) => (px / pxPerHour) * 60;
export const minutesToPx = (min: number, pxPerHour = PX_PER_HOUR) => (min / 60) * pxPerHour;

/** New start and end after dragging a block by `deltaPx` vertically (15-minute snap). */
export function movedTimes(a: Pick<Appt, "startsAt" | "endsAt">, deltaPx: number, pxPerHour = PX_PER_HOUR): { startsAt: string; endsAt: string } {
  const delta = snap(pxToMinutes(deltaPx, pxPerHour)) * MIN;
  return { startsAt: new Date(new Date(a.startsAt).getTime() + delta).toISOString(), endsAt: new Date(new Date(a.endsAt).getTime() + delta).toISOString() };
}

/** New end after dragging the bottom edge by `deltaPx`; never shorter than one step. */
export function resizedEnd(a: Pick<Appt, "startsAt" | "endsAt">, deltaPx: number, pxPerHour = PX_PER_HOUR): string {
  const start = new Date(a.startsAt).getTime();
  const end = new Date(a.endsAt).getTime() + snap(pxToMinutes(deltaPx, pxPerHour)) * MIN;
  return new Date(Math.max(end, start + STEP_MIN * MIN)).toISOString();
}

/** Which column an x position falls in (clamped), given each column's left and right edges. */
export function columnAt(x: number, edges: { left: number; right: number }[]): number {
  if (!edges.length) return -1;
  const i = edges.findIndex((e) => x >= e.left && x < e.right);
  if (i >= 0) return i;
  return x < edges[0]!.left ? 0 : edges.length - 1;
}

/** Minutes after local midnight to snapped start for a click at `y` px inside a column. */
export function minutesAtY(y: number, windowStart: number, pxPerHour = PX_PER_HOUR): number {
  return windowStart + Math.floor(pxToMinutes(Math.max(0, y), pxPerHour) / STEP_MIN) * STEP_MIN;
}

// ---------------------------------------------------------------------------
// Working window and shading
// ---------------------------------------------------------------------------
type Shift = [number, number];

export function shiftsOn(staff: Staff, weekday: number, locationId?: string): Shift[] {
  return staff.hours
    .filter((h) => h.weekday === weekday && (!locationId || h.locationId === locationId))
    .map((h): Shift => [toMin(h.startsLocal), toMin(h.endsLocal)])
    .sort((a, b) => a[0] - b[0]);
}
const toMin = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));

/** The visible hours: everyone's earliest start to latest end that day, widened to fit any visit, rounded to whole hours. */
export function workWindow(date: string, staff: Staff[], appts: Appt[], tz = TZ, locationId?: string): [number, number] {
  const wd = weekdayOf(date);
  const all = staff.flatMap((s) => shiftsOn(s, wd, locationId));
  let start = all.length ? Math.min(...all.map((s) => s[0])) : DEFAULT_WINDOW[0];
  let end = all.length ? Math.max(...all.map((s) => s[1])) : DEFAULT_WINDOW[1];
  for (const a of appts) {
    const s = parts(a.startsAt, tz);
    const e = parts(a.endsAt, tz);
    if (s.date === date) start = Math.min(start, s.minutes);
    if (e.date === date) end = Math.max(end, e.minutes || 24 * 60);
    else if (s.date === date) end = Math.max(end, 24 * 60);
  }
  return [Math.floor(start / 60) * 60, Math.min(24 * 60, Math.ceil(end / 60) * 60)];
}

/** Segments of the window where a person isn't working (shaded), in minutes. */
export function offSegments(staff: Staff, date: string, window: [number, number], tz = TZ, locationId?: string): Shift[] {
  const [ws, we] = window;
  const wd = weekdayOf(date);
  const work = shiftsOn(staff, wd, locationId);
  const out: Shift[] = [];
  let cur = ws;
  for (const [s, e] of work) {
    if (s > cur) out.push([cur, Math.min(s, we)]);
    cur = Math.max(cur, e);
  }
  if (cur < we) out.push([cur, we]);
  // Time off shows as shaded too (merged naively; overlaps just paint twice).
  const dayStart = instantAt(date, 0, tz).getTime();
  for (const t of staff.timeOff) {
    const s = Math.max(ws, Math.floor((new Date(t.startsAt).getTime() - dayStart) / MIN));
    const e = Math.min(we, Math.ceil((new Date(t.endsAt).getTime() - dayStart) / MIN));
    if (e > s && e > 0 && s < 24 * 60) out.push([s, e]);
  }
  return out.filter(([s, e]) => e > s);
}

export interface TimeOffBlock {
  id: string;
  top: number;
  height: number;
  reason: string | null;
}
export function timeOffBlocks(staff: Staff, date: string, window: [number, number], tz = TZ, pxPerHour = PX_PER_HOUR): TimeOffBlock[] {
  const dayStart = instantAt(date, 0, tz).getTime();
  return staff.timeOff
    .map((t) => {
      const s = Math.max(window[0], Math.floor((new Date(t.startsAt).getTime() - dayStart) / MIN));
      const e = Math.min(window[1], Math.ceil((new Date(t.endsAt).getTime() - dayStart) / MIN));
      return { id: t.id, s, e, reason: t.reason };
    })
    .filter((t) => t.e > t.s)
    .map((t) => ({ id: t.id, top: minutesToPx(t.s - window[0], pxPerHour), height: minutesToPx(t.e - t.s, pxPerHour), reason: t.reason }));
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------
export function geometry(a: Pick<Appt, "startsAt" | "endsAt">, date: string, window: [number, number], tz = TZ, pxPerHour = PX_PER_HOUR): { top: number; height: number } {
  const s = parts(a.startsAt, tz);
  const e = parts(a.endsAt, tz);
  const startMin = s.date === date ? s.minutes : 0;
  const endMin = e.date === date ? (e.minutes === 0 ? 24 * 60 : e.minutes) : 24 * 60;
  const top = minutesToPx(Math.max(startMin, window[0]) - window[0], pxPerHour);
  const bottom = minutesToPx(Math.min(endMin, window[1]) - window[0], pxPerHour);
  return { top, height: Math.max(minutesToPx(STEP_MIN, pxPerHour) - 1, bottom - top - 1) };
}

export type BlockState = "booked" | "arrived" | "in_service" | "completed" | "no_show" | "cancelled";

/** The one line under the time: what the block says about its state. */
export function stateLine(a: Appt, now = new Date()): { text: string; tone: "plain" | "positive" | "negative" | "muted" } {
  if (a.status === "no_show") return { text: a.feeChargedAt ? "No-show, fee charged" : "No-show", tone: "negative" };
  if (a.status === "completed") return { text: "Done", tone: "muted" };
  if (a.status === "in_service") return { text: "In the chair", tone: "plain" };
  if (a.status === "arrived") return { text: a.source === "walk_in" ? "Walk-in, arrived" : `Arrived ${clock(parts(a.arrivedAt ?? a.startsAt).minutes)}`, tone: "plain" };
  if (a.holdExpiresAt && new Date(a.holdExpiresAt) > now) return { text: "Waiting for deposit", tone: "muted" };
  if (a.depositPaidAt) return { text: `Deposit ${money(a.depositCents)} paid`, tone: "positive" };
  if (a.requestedStaff) return { text: "Asked for her by name", tone: "positive" };
  return { text: "", tone: "plain" };
}

export function money(cents: number): string {
  const v = cents / 100;
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-CA", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export const serviceSummary = (a: Pick<Appt, "items">) => a.items.map((i) => i.name).join(", ");

/** Screen reader label: "Neha Sharma, cut and blow-dry, 9:00 to 10:15, Simran, paid". */
export function blockLabel(a: Appt, tz = TZ): string {
  const status = a.status === "completed" ? (a.invoiceId ? "paid" : "done") : a.status === "no_show" ? "no-show" : a.status === "in_service" ? "in the chair" : a.status === "arrived" ? "arrived" : a.status === "cancelled" ? "cancelled" : a.depositPaidAt ? "deposit paid" : "booked";
  return [a.customer.name, serviceSummary(a).toLowerCase(), timeRange(a, tz).replace(/ (am|pm)/g, ""), a.staffName?.split(" ")[0] ?? "unassigned", status].filter(Boolean).join(", ");
}

/** Is a block the kind of thing that can be dragged? */
export const movable = (a: Appt) => a.status === "booked" || a.status === "arrived" || a.status === "in_service";

// ---------------------------------------------------------------------------
// The day's numbers (page description) and the staff header
// ---------------------------------------------------------------------------
export interface DayNumbers {
  booked: number;
  noShows: number;
  depositsDue: number;
  inChair: number;
}
export function dayNumbers(appts: Appt[], now = new Date()): DayNumbers {
  const live = appts.filter((a) => a.status !== "cancelled");
  return {
    booked: live.length,
    noShows: live.filter((a) => a.status === "no_show").length,
    inChair: live.filter((a) => a.status === "in_service").length,
    depositsDue: live.filter((a) => a.status === "booked" && !!a.holdExpiresAt && new Date(a.holdExpiresAt) > now).length,
  };
}

export function dayDescription(date: string, n: DayNumbers): string {
  const bits = [`${n.booked} booked`];
  if (n.inChair) bits.push(`${n.inChair} in the chair`);
  if (n.noShows) bits.push(`${n.noShows} no-show${n.noShows === 1 ? "" : "s"}`);
  if (n.depositsDue) bits.push(`${n.depositsDue} deposit${n.depositsDue === 1 ? "" : "s"} still due`);
  return `${dateLabel(date)}. ${bits.join(", ")}.`;
}

/** Hours a person is booked in a day (for the column header). */
export function bookedMinutes(appts: Appt[], staffId: string | null): number {
  return appts.filter((a) => a.staffId === staffId && a.status !== "cancelled").reduce((n, a) => n + (new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / MIN, 0);
}

// ---------------------------------------------------------------------------
// Checkout preview (before tax: the server adds HST)
// ---------------------------------------------------------------------------
export function duePreview(items: { priceCents: number }[], depositPaidCents: number): { subtotalCents: number; depositCents: number; dueCents: number } {
  const subtotalCents = items.reduce((n, i) => n + i.priceCents, 0);
  const depositCents = Math.min(depositPaidCents, subtotalCents);
  return { subtotalCents, depositCents, dueCents: subtotalCents - depositCents };
}

/** Tip choices on the pre-tax amount, for the presets the shop set. */
export function tipChoices(baseCents: number, presets: readonly number[]): { percent: number; cents: number }[] {
  return presets.map((percent) => ({ percent, cents: Math.round((Math.max(0, baseCents) * percent) / 100) }));
}

/** Initials for an avatar. */
export function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return ((p[0]![0] ?? "") + (p.length > 1 ? (p[p.length - 1]![0] ?? "") : (p[0]![1] ?? ""))).toUpperCase();
}

/** Columns of the grid: one per staff member (day view) or one per day for a single stylist (week view). */
export interface CalColumn {
  key: string;
  date: string;
  staffId: string | null;
  title: string;
  subtitle: string;
  initials: string;
  staff: Staff | null;
}
export function dayColumns(date: string, staff: Staff[], appts: Appt[], opts: { onlyStaff?: string | null; showUnassigned?: boolean } = {}): CalColumn[] {
  const cols = staff
    .filter((s) => !opts.onlyStaff || s.userId === opts.onlyStaff)
    .map((s): CalColumn => ({ key: s.userId, date, staffId: s.userId, title: s.name.split(" ")[0] ?? s.name, subtitle: `${appts.filter((a) => a.staffId === s.userId && a.status !== "cancelled").length} booked, ${hoursText(bookedMinutes(appts, s.userId))}`, initials: s.initials, staff: s }));
  const loose = appts.filter((a) => !a.staffId && a.status !== "cancelled");
  if ((opts.showUnassigned ?? true) && loose.length) cols.push({ key: "unassigned", date, staffId: null, title: "Unassigned", subtitle: `${loose.length} to place`, initials: "?", staff: null });
  return cols;
}
export function weekColumns(startDate: string, staff: Staff | null, appts: Appt[]): CalColumn[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(startDate, i);
    const mine = appts.filter((a) => a.staffId === (staff?.userId ?? null) && a.status !== "cancelled" && parts(a.startsAt).date === date);
    return { key: date, date, staffId: staff?.userId ?? null, title: dateLabel(date, { weekday: "short" }), subtitle: `${dateLabel(date, { month: "short", day: "numeric" })} · ${mine.length} booked`, initials: dateLabel(date, { day: "numeric" }), staff };
  });
}
