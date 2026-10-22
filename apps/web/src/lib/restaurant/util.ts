import type { MessageKey } from "@ll/shared";

type T = (key: MessageKey, vars?: Record<string, string | number | null | undefined>) => string;

export const TZ = "America/Toronto";

/** A calendar day ("2026-11-14") as a Date at noon UTC, so any timezone formats the same day. Format it with tz "UTC". */
export function dayDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** Today's date in Toronto as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(iso: string, n: number): string {
  const d = dayDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Toronto calendar day an instant falls on. */
export function torontoDay(ts: string | Date): string {
  return todayIso(typeof ts === "string" ? new Date(ts) : ts);
}

/** "-04:00" or "-05:00" for a Toronto calendar day. */
export function torontoOffset(iso: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(dayDate(iso)).find((p) => p.type === "timeZoneName")?.value ?? "GMT-05:00";
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(part);
  return m ? `${m[1]}:${m[2] ?? "00"}` : "-05:00";
}

/** ISO instant for a Toronto wall-clock day and time ("2026-11-14", "18:30"). */
export function torontoInstant(day: string, time: string): string {
  return new Date(`${day}T${time}:00${torontoOffset(day)}`).toISOString();
}

const EVENT_KEYS: Record<string, MessageKey> = {
  wedding: "event.wedding",
  walima: "event.walima",
  mehndi: "event.mehndi",
  engagement: "rc.event.engagement",
  birthday: "event.birthday",
  aqiqah: "event.aqiqah",
  corporate: "event.corporate",
  religious: "rc.event.religious",
  other: "event.other",
};
export const eventLabel = (t: T, type: string): string => t(EVENT_KEYS[type] ?? "event.other");

const SERVICE_KEYS: Record<string, MessageKey> = {
  delivery: "rc.service.delivery",
  pickup: "rc.service.pickup",
  onsite: "rc.service.onsite",
  banquet: "rc.service.banquet",
};
export const serviceLabel = (t: T, s: string): string => t(SERVICE_KEYS[s] ?? "rc.service.delivery");

/** "6:30 pm" from "18:30". */
export function clockLabel(hhmm: string, locale: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, h ?? 0, m ?? 0)));
}
