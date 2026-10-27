/**
 * Auto care rules (docs/research/auto-care.md). Pure functions so the API, the web and the tests share one answer:
 * a service reminder by km or months (whichever comes first) from an estimated km a day, tire tread and tire season
 * capacity, the wash check-in decision, and what a vehicle estimate must carry before it is sent.
 * Dates are shop-local "YYYY-MM-DD" strings. Intervals and windows are defaults a shop edits (E in the research doc).
 */
import { addDaysStr, daysBetweenStr } from "./pets.js";

export { addDaysStr, daysBetweenStr };

export const VEHICLE_USES = ["personal", "rideshare"] as const;
export type VehicleUse = (typeof VEHICLE_USES)[number];
export const MAX_VEHICLES_PER_OWNER = 6;

// ---------------------------------------------------------------- plates
/** "abc 123" and "ABC-123" are the same plate. Empty or too short or long is not a plate (null). */
export function normalizePlate(raw: string | null | undefined): string | null {
  const p = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return p.length >= 2 && p.length <= 8 ? p : null;
}

// ---------------------------------------------------------------- services and reminders
export interface ServiceDef {
  key: string;
  label: string;
  /** null = no km interval */
  everyKm: number | null;
  /** null = no months interval */
  everyMonths: number | null;
  /** Used instead of the two above for a rideshare car (severe service). */
  severeKm?: number | null;
  severeMonths?: number | null;
  active: boolean;
}

/** Defaults a shop edits. Estimates, not a manufacturer's numbers: the owner's manual wins (research 2.2). */
export const DEFAULT_SERVICES: readonly ServiceDef[] = [
  { key: "oil", label: "Oil and filter", everyKm: 8000, everyMonths: 6, severeKm: 5000, severeMonths: 4, active: true },
  { key: "rotation", label: "Tire rotation", everyKm: 10000, everyMonths: null, severeKm: 8000, active: true },
  { key: "brakes", label: "Brake inspection", everyKm: null, everyMonths: 12, severeMonths: 6, active: true },
  { key: "cabin", label: "Cabin air filter", everyKm: 20000, everyMonths: 12, active: false },
  { key: "safety", label: "Safety standards certificate", everyKm: null, everyMonths: 12, active: false },
];

export const DEFAULT_KM_PER_DAY = 40;
export const KM_PER_DAY_MIN = 5;
export const KM_PER_DAY_MAX = 400;
/** A pair of readings closer than this says nothing about a rate. */
export const MIN_READING_SPAN_DAYS = 14;
export const DUE_SOON_DAYS = 14;
export const DUE_SOON_KM = 1000;

export interface Reading {
  km: number;
  /** shop-local day */
  day: string;
}

/** Km a day from the last readings, else the shop default. A reading that goes backwards is ignored. */
export function kmPerDay(readings: readonly Reading[], fallback = DEFAULT_KM_PER_DAY, override: number | null = null): { value: number; basis: "override" | "readings" | "default" } {
  if (override && override > 0) return { value: override, basis: "override" };
  const sorted = [...readings].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.km - b.km)).slice(-4);
  // Keep a non-decreasing run ending at the newest reading.
  const run: Reading[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const r = sorted[i]!;
    if (!run.length || r.km <= run[0]!.km) run.unshift(r);
  }
  if (run.length >= 2) {
    const first = run[0]!;
    const last = run[run.length - 1]!;
    const days = daysBetweenStr(first.day, last.day);
    if (days >= MIN_READING_SPAN_DAYS) {
      const rate = (last.km - first.km) / days;
      return { value: Math.min(KM_PER_DAY_MAX, Math.max(KM_PER_DAY_MIN, Math.round(rate))), basis: "readings" };
    }
  }
  return { value: fallback, basis: "default" };
}

/** Odometer today, estimated from the newest reading. */
export function estimateKmOn(latest: Reading | null, day: string, perDay: number): number | null {
  if (!latest) return null;
  return latest.km + Math.max(0, daysBetweenStr(latest.day, day)) * perDay;
}

/** The same calendar day N months on (the 31st clamps to the last day of a short month). */
export function addMonthsStr(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function intervalFor(s: ServiceDef, use: VehicleUse): { km: number | null; months: number | null } {
  if (use === "rideshare" && (s.severeKm !== undefined || s.severeMonths !== undefined)) {
    return { km: s.severeKm !== undefined ? s.severeKm : s.everyKm, months: s.severeMonths !== undefined ? s.severeMonths : s.everyMonths };
  }
  return { km: s.everyKm, months: s.everyMonths };
}

export type ReminderStatus = "overdue" | "due_soon" | "ok" | "unknown";
export interface ReminderInput {
  service: ServiceDef;
  use: VehicleUse;
  /** The last time this service was done on this car at this shop; null = never recorded. */
  last: { day: string; km: number | null } | null;
  /** Newest odometer reading (any source). */
  latest: Reading | null;
  perDay: number;
  today: string;
}
export interface ReminderState {
  status: ReminderStatus;
  /** The earlier of the two dates; null when unknown. */
  dueOn: string | null;
  basis: "km" | "months" | null;
  dueByKmOn: string | null;
  dueByMonthsOn: string | null;
  dueAtKm: number | null;
  kmLeft: number | null;
  daysToDue: number | null;
}

/** Due by km or months, whichever comes first. A car with no recorded service is "unknown": nothing is due until the shop logs one. */
export function reminderState(i: ReminderInput): ReminderState {
  const empty: ReminderState = { status: "unknown", dueOn: null, basis: null, dueByKmOn: null, dueByMonthsOn: null, dueAtKm: null, kmLeft: null, daysToDue: null };
  if (!i.last) return empty;
  const iv = intervalFor(i.service, i.use);
  let dueByMonthsOn: string | null = null;
  let dueByKmOn: string | null = null;
  let dueAtKm: number | null = null;
  let kmLeft: number | null = null;
  if (iv.months) dueByMonthsOn = addMonthsStr(i.last.day, iv.months);
  if (iv.km && i.last.km != null) {
    dueAtKm = i.last.km + iv.km;
    const now = estimateKmOn(i.latest, i.today, i.perDay);
    if (now != null) {
      kmLeft = dueAtKm - Math.max(now, i.last.km);
      // Whole days at the daily rate; negative once past due.
      dueByKmOn = addDaysStr(i.today, kmLeft <= 0 ? -Math.ceil(-kmLeft / i.perDay) : Math.ceil(kmLeft / i.perDay));
    }
  }
  const choices = [dueByKmOn ? ({ on: dueByKmOn, basis: "km" } as const) : null, dueByMonthsOn ? ({ on: dueByMonthsOn, basis: "months" } as const) : null].filter((x): x is { on: string; basis: "km" | "months" } => x !== null);
  if (!choices.length) return { ...empty, dueAtKm };
  choices.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
  const pick = choices[0]!;
  const daysToDue = daysBetweenStr(i.today, pick.on);
  const status: ReminderStatus = daysToDue < 0 || (kmLeft != null && kmLeft < 0) ? "overdue" : daysToDue <= DUE_SOON_DAYS || (kmLeft != null && kmLeft <= DUE_SOON_KM) ? "due_soon" : "ok";
  return { status, dueOn: pick.on, basis: pick.basis, dueByKmOn, dueByMonthsOn, dueAtKm, kmLeft, daysToDue };
}

/** A reminder goes out once per car, service and due date: this is the key stored with the send. */
export const nudgeKey = (serviceKey: string, dueOn: string): string => `${serviceKey}:${dueOn}`;
/** Texts go out 09:00 to 20:00 shop time. */
export const REMINDER_HOURS = { from: 9, to: 20 } as const;
export const textHourOk = (localHour: number): boolean => localHour >= REMINDER_HOURS.from && localHour < REMINDER_HOURS.to;

// ---------------------------------------------------------------- tires
export const TIRE_SEASONS = ["winter", "summer", "all_weather"] as const;
export type TireSeason = (typeof TIRE_SEASONS)[number];
/** In tenths of a millimetre: 32 = 3.2 mm (about 4/32 in), 16 = 1.6 mm (the 2/32 in wear bar). */
export const TREAD_REPLACE_SOON_TENTHS = 32;
export const TREAD_WEAR_BAR_TENTHS = 16;
export type TreadStatus = "ok" | "replace_soon" | "wear_bar" | "unknown";
export function treadStatus(tenthsMm: number | null | undefined): TreadStatus {
  if (tenthsMm == null) return "unknown";
  return tenthsMm < TREAD_WEAR_BAR_TENTHS ? "wear_bar" : tenthsMm < TREAD_REPLACE_SOON_TENTHS ? "replace_soon" : "ok";
}
export const treadLabel = (tenthsMm: number): string => `${(tenthsMm / 10).toFixed(1)} mm`;

export interface TireSettings {
  bays: number;
  hoursPerDay: number;
  minutesPerSwap: number;
  /** "MM-DD" */
  fallStart: string;
  fallEnd: string;
  springStart: string;
  springEnd: string;
  /** Days before a window opens that stored sets get a pickup text. */
  pickupLeadDays: number;
}
export const DEFAULT_TIRE_SETTINGS: TireSettings = { bays: 2, hoursPerDay: 8, minutesPerSwap: 45, fallStart: "10-15", fallEnd: "11-30", springStart: "03-25", springEnd: "04-30", pickupLeadDays: 14 };

/** Swaps that fit in one day: bays x minutes open / minutes a swap, rounded down. */
export function swapsPerDay(s: Pick<TireSettings, "bays" | "hoursPerDay" | "minutesPerSwap">): number {
  return Math.max(0, Math.floor((s.bays * s.hoursPerDay * 60) / Math.max(1, s.minutesPerSwap)));
}
const mmdd = (day: string) => day.slice(5);
export type TireWindowName = "fall" | "spring";
export function tireWindowOn(day: string, s: TireSettings): TireWindowName | null {
  const d = mmdd(day);
  if (d >= s.fallStart && d <= s.fallEnd) return "fall";
  if (d >= s.springStart && d <= s.springEnd) return "spring";
  return null;
}
/** The window that is open on `today`, else the next one that opens, with its first and last day. */
export function currentOrNextWindow(today: string, s: TireSettings): { name: TireWindowName; start: string; end: string; open: boolean } {
  const year = Number(today.slice(0, 4));
  const cands: { name: TireWindowName; start: string; end: string }[] = [];
  for (const y of [year, year + 1]) {
    cands.push({ name: "spring", start: `${y}-${s.springStart}`, end: `${y}-${s.springEnd}` });
    cands.push({ name: "fall", start: `${y}-${s.fallStart}`, end: `${y}-${s.fallEnd}` });
  }
  cands.sort((a, b) => (a.start < b.start ? -1 : 1));
  const w = cands.find((c) => c.end >= today)!;
  return { ...w, open: w.start <= today };
}
/** Fall puts the winter set on, spring the summer set on: the set a customer should collect in each window. */
export const setForWindow = (w: TireWindowName): TireSeason => (w === "fall" ? "winter" : "summer");
/** Stored sets are texted this many days before the window opens. */
export const pickupRemindOn = (windowStart: string, leadDays: number): string => addDaysStr(windowStart, -leadDays);

export interface DayPlan {
  day: string;
  capacity: number;
  booked: number;
  free: number;
  full: boolean;
}
export function dayPlan(day: string, booked: number, s: TireSettings): DayPlan {
  const capacity = swapsPerDay(s);
  const free = Math.max(0, capacity - booked);
  return { day, capacity, booked, free, full: free === 0 };
}

// ---------------------------------------------------------------- wash
export type WashMembershipState = "active" | "frozen" | "past_due" | "pending" | "cancelled" | "expired" | "none";
export type WashRefusal = "frozen" | "past_due" | "pending" | "cancelled" | "expired" | "already_washed" | "no_plan";
export interface WashDecision {
  ok: boolean;
  /** member = unlimited plan, punch = a prepaid wash taken off a pass */
  kind: "member" | "punch" | null;
  reason: WashRefusal | null;
}
export const WASH_REFUSAL_TEXT: Record<WashRefusal, string> = {
  frozen: "This plan is paused.",
  past_due: "The last payment failed. Ask them to update the card.",
  pending: "The first payment has not gone through yet.",
  cancelled: "This plan was cancelled.",
  expired: "This plan has ended.",
  already_washed: "Already washed today.",
  no_plan: "No plan or punch card. Sell a single wash.",
};
/** One wash per member per day by default (the shop can raise it). A plan that is not active is refused with its reason; a punch card is the fallback only when there is no plan. */
export function washDecision(i: { membership: WashMembershipState; punchLeft: number; washesToday: number; maxPerDay: number }): WashDecision {
  const plan = i.membership;
  if (plan === "active") {
    return i.washesToday >= i.maxPerDay ? { ok: false, kind: null, reason: "already_washed" } : { ok: true, kind: "member", reason: null };
  }
  if (plan === "none" || plan === "cancelled" || plan === "expired") {
    if (i.punchLeft > 0) return i.washesToday >= i.maxPerDay ? { ok: false, kind: null, reason: "already_washed" } : { ok: true, kind: "punch", reason: null };
    return { ok: false, kind: null, reason: plan === "none" ? "no_plan" : plan };
  }
  return { ok: false, kind: null, reason: plan };
}
export const WASH_AT_RISK_BELOW = 3;
export const WASH_WINDOW_DAYS = 30;
export const WASH_DEFAULT_MAX_PER_DAY = 1;

// ---------------------------------------------------------------- vehicle estimates (Ontario guide for auto repair businesses)
export const PART_CONDITIONS = ["new", "used", "reconditioned"] as const;
export type PartCondition = (typeof PART_CONDITIONS)[number];
export const PART_CONDITION_LABELS: Record<PartCondition, string> = { new: "New", used: "Used", reconditioned: "Reconditioned" };
/** Parts return and warranty facts printed on a vehicle estimate and invoice. Shop-policy wording; the statutory notice text is the shop's (research 2.4, V). */
export const MVR_WARRANTY_DAYS = 90;
export const MVR_WARRANTY_KM = 5000;
export const MVR_WARRANTY_EXEMPT = "fluids, filters, lights, tires and batteries";
export const PARTS_RETURN = ["offered", "declined", "not_applicable"] as const;
export type PartsReturn = (typeof PARTS_RETURN)[number];
export const PARTS_RETURN_LABELS: Record<PartsReturn, string> = { offered: "Replaced parts offered back", declined: "Customer declined the replaced parts", not_applicable: "No replaced parts" };

export interface EstimateCheckInput {
  vehicleLabel: string | null;
  mileageIn: string | null;
  /** completion date: the ticket's promised time */
  promisedAt: string | null;
  expiresAt: string | null;
  lines: readonly { kind?: string | null; condition?: string | null; description: string }[];
}
/** What a vehicle estimate still needs before it can be sent. Empty = complete. Plain words for the service writer. */
export function estimateMissing(i: EstimateCheckInput): string[] {
  const out: string[] = [];
  if (!i.vehicleLabel) out.push("the vehicle (make and model)");
  if (!i.mileageIn || !/\d/.test(i.mileageIn)) out.push("the odometer reading");
  if (!i.promisedAt) out.push("when the work will be done");
  if (!i.expiresAt) out.push("when the estimate expires");
  const parts = i.lines.filter((l) => l.kind === "part" && !(PART_CONDITIONS as readonly string[]).includes(l.condition ?? ""));
  if (parts.length) out.push(`new, used or reconditioned on ${parts.length === 1 ? "the part" : `${parts.length} parts`}`);
  return out;
}

/** Percent over the approved estimate, one decimal; negative = under. */
export function percentOver(estimateCents: number, finalCents: number): number {
  if (estimateCents <= 0) return 0;
  return Math.round(((finalCents - estimateCents) / estimateCents) * 1000) / 10;
}
