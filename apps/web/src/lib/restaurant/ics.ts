/** Minimal RFC 5545 calendar file for a pickup: one event, one reminder the morning before. Pure so it can be tested. */

const pad = (n: number) => String(n).padStart(2, "0");
/** 20261024T180000Z */
export const icsStamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** Escape text values: backslash, semicolon, comma and newlines. */
export const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\;").replace(/,/g, "\\,");

/** Fold lines longer than 75 octets (RFC 5545 section 3.1): continuation lines start with one space. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74;
    if (enc.encode(cur + ch).length > limit) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export interface PickupEvent {
  uid: string;
  start: Date;
  /** Minutes the pickup window lasts (one hour for degh pickups). */
  durationMin: number;
  summary: string;
  location?: string | null;
  description?: string | null;
  now?: Date;
}

export function buildIcs(e: PickupEvent): string {
  const end = new Date(e.start.getTime() + e.durationMin * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Local Loyalty//Pickup//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@local-loyalty`,
    `DTSTAMP:${icsStamp(e.now ?? new Date())}`,
    `DTSTART:${icsStamp(e.start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsText(e.summary)}`,
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(e.summary)}`,
    "TRIGGER:-PT3H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
