/**
 * Walk-in line maths (docs/research/barbers-beauty.md 4.3), shared by the API and the pages so the number on the door tablet and the
 * number in the text cannot drift. Pure functions, no clock.
 */

export const QUEUE_DEFAULT_MINUTES = 25;
export const QUEUE_ROUND_MIN = 5;
export const QUEUE_MAX_FAMILY = 6;

export interface QueuePerson {
  /** Minutes this person's service takes. */
  durationMin: number;
  /** Only this barber may take them (they asked), or null for anyone. */
  requestedStaffId: string | null;
}

export interface QueueChair {
  staffId: string;
  /** Minutes left for the person in the chair (0 when free). */
  busyMin: number;
}

const roundUp = (m: number) => Math.max(QUEUE_ROUND_MIN, Math.ceil(m / QUEUE_ROUND_MIN) * QUEUE_ROUND_MIN);

/**
 * About how many minutes until someone joining at the back of `ahead` is called.
 *  - any barber: the work ahead (what is ahead, spread over the chairs) plus the least time any chair has left;
 *  - a named barber: that barber's own line (people who asked for them) plus the "anyone" people shared among all chairs, plus their chair.
 * Rounded up to 5 minutes. Returns null when no chair takes walk-ins.
 */
export function estimateWaitMin(ahead: QueuePerson[], chairs: QueueChair[], forStaffId: string | null): number | null {
  if (!chairs.length) return null;
  const n = chairs.length;
  if (forStaffId) {
    const mine = chairs.find((c) => c.staffId === forStaffId);
    if (!mine) return null;
    const own = ahead.filter((p) => p.requestedStaffId === forStaffId).reduce((a, p) => a + p.durationMin, 0);
    const anyone = ahead.filter((p) => !p.requestedStaffId).reduce((a, p) => a + p.durationMin, 0) / n;
    const total = mine.busyMin + own + anyone;
    return total <= 0 ? 0 : roundUp(total);
  }
  const work = ahead.reduce((a, p) => a + p.durationMin, 0);
  const soonest = Math.min(...chairs.map((c) => c.busyMin));
  const total = work / n + soonest;
  return total <= 0 ? 0 : roundUp(total);
}

/** "about 25 min", "about 1 h 10 min", "no wait". */
export function waitText(min: number | null): string {
  if (min === null) return "";
  if (min <= 0) return "no wait";
  if (min < 60) return `about ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `about ${h} h ${m} min` : `about ${h} h`;
}

/** 1st, 2nd, 3rd, 4th ... in English; other languages use the numeral from the catalog. */
export function ordinalEn(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10] ?? "th"}`;
}

export const QUEUE_STATUSES = ["waiting", "called", "in_service", "done", "no_show", "left"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];
/** Statuses that are still "in the line" for the person. */
export const QUEUE_LIVE = ["waiting", "called", "in_service"] as const;

/** Skip rule: the first skip moves a person back this many places; the second marks a no-show. */
export const QUEUE_SKIP_BACK = 2;
