/**
 * Pure logic for the customer booking flow on web and phone (Figma M1 and M2): which services a stylist does and
 * at what length and price, totals and the deposit, the date strip, duration wording, and the calendar file
 * (.ics) for the confirmation. No React, no I/O.
 */
import type { AvailabilityResponse, PublicServiceDto, PublicStaffDto } from "./api/appointments.js";

export type PublicService = PublicServiceDto;
export type PublicStaff = PublicStaffDto;

/** Can this stylist do this service? A service with no staff list can be done by anyone. */
export function staffDoes(service: PublicService, staffId: string | null): boolean {
  if (!staffId) return true;
  return service.staffIds.length === 0 || service.staffIds.includes(staffId);
}

/** The service as one stylist does it (their own length and price when set). "Anyone" uses the shop's. */
export function serviceFor(service: PublicService, staffId: string | null): { durationMin: number; priceCents: number } {
  const o = staffId ? service.staffOverrides.find((x) => x.staffId === staffId) : undefined;
  return { durationMin: o?.durationMin ?? service.durationMin, priceCents: o?.priceCents ?? service.priceCents };
}

export interface Selection {
  count: number;
  durationMin: number;
  priceCents: number;
  depositCents: number;
  /** At least one chosen service is a "from" price. */
  from: boolean;
}

export function summarize(services: PublicService[], ids: string[], staffId: string | null): Selection {
  const picked = services.filter((s) => ids.includes(s.id));
  const priceCents = picked.reduce((n, s) => n + serviceFor(s, staffId).priceCents, 0);
  return {
    count: picked.length,
    durationMin: picked.reduce((n, s) => n + serviceFor(s, staffId).durationMin, 0),
    priceCents,
    depositCents: Math.min(
      picked.reduce((n, s) => n + s.depositCents, 0),
      priceCents,
    ),
    from: picked.some((s) => s.priceFrom),
  };
}

/** Group services by category name in the order the shop listed them ("Other" last). */
export function groupServices(services: PublicService[]): { name: string | null; items: PublicService[] }[] {
  const groups = new Map<string | null, PublicService[]>();
  for (const s of services) groups.set(s.categoryName, [...(groups.get(s.categoryName) ?? []), s]);
  return [...groups].map(([name, items]) => ({ name, items }));
}

/** "45 min", "2 h", "2 h 30" through the catalog (bk.dur.*). */
export function durationText(t: (k: "bk.dur.min" | "bk.dur.h" | "bk.dur.hm", v: Record<string, number>) => string, min: number): string {
  if (min < 60) return t("bk.dur.min", { n: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? t("bk.dur.hm", { h, m }) : t("bk.dur.h", { h });
}

/** The next `n` calendar days from a "YYYY-MM-DD" start. */
export function nextDays(start: string, n: number): string[] {
  const [y, m, d] = start.split("-").map(Number) as [number, number, number];
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}

/** Times (ISO) offered on one day, optionally only those a given stylist has. */
export function timesOn(av: AvailabilityResponse | null, date: string): { startsAt: string; staffId: string }[] {
  return av?.days.find((d) => d.date === date)?.times ?? [];
}

// ---------------------------------------------------------------------------
// Calendar file
// ---------------------------------------------------------------------------
const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Fold a content line at 75 octets with CRLF + space, as RFC 5545 asks. */
const utf8Len = (s: string) => {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
};
function fold(line: string): string {
  if (utf8Len(line) <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (utf8Len(cur + ch) > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(e: { uid: string; title: string; startsAt: string; endsAt: string; location?: string | null; description?: string | null; url?: string | null }, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Local Loyalty//Appointments//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@localloyalty`,
    `DTSTAMP:${icsDate(now.toISOString())}`,
    `DTSTART:${icsDate(e.startsAt)}`,
    `DTEND:${icsDate(e.endsAt)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    ...(e.location ? [`LOCATION:${icsEscape(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Appointment in 2 hours",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
