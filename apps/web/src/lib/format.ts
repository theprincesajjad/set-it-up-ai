/** Display formatting per docs/design/brand.md §2 (Canadian English, en-CA). */
const TZ = "America/Toronto";

export function formatMoney(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-CA");
}

/** "points" → "pts" short unit; stamps/stars keep their word. Singular when 1. */
export function unitFor(terminology: string | null | undefined, n: number, short = true): string {
  const t = (terminology || "points").toLowerCase();
  if (t === "points") return short ? "pts" : n === 1 ? "point" : "points";
  const singular = t.endsWith("s") ? t.slice(0, -1) : t;
  return n === 1 ? singular : t;
}

/** "120 pts", "8 stamps", "1 stamp". */
export function formatPoints(n: number, terminology?: string | null, short = true): string {
  return `${formatNumber(n)} ${unitFor(terminology, n, short)}`;
}

/** "Oct 21" or "Tue, Oct 21". */
export function formatDate(iso: string | Date | null | undefined, withWeekday = false): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-CA", { timeZone: TZ, month: "short", day: "numeric", ...(withWeekday ? { weekday: "short" } : {}) });
}

export function formatDateYear(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-CA", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
}

/** "3:30 pm". */
export function formatTime(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).replace(/\./g, "").replace("a m", "am").replace("p m", "pm");
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  return `${formatDate(iso, true)}, ${formatTime(iso)}`;
}

/** "350 m" / "1.2 km". */
export function formatDistance(metres: number | null | undefined): string {
  if (metres === null || metres === undefined) return "";
  if (metres < 1000) return `${Math.max(10, Math.round(metres / 10) * 10)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

/** Member number grouped "4821 0937". */
export function groupCode(code: string): string {
  return code.replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** "3:30:05 pm" (live clocks). */
export function formatClock(d: Date): string {
  return d
    .toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit", second: "2-digit" })
    .replace(/\./g, "")
    .replace("a m", "am")
    .replace("p m", "pm");
}

/** "+50" / "−250" (U+2212, never a hyphen) for ledger deltas. */
export function formatSigned(n: number): string {
  if (n > 0) return `+${formatNumber(n)}`;
  if (n < 0) return `−${formatNumber(Math.abs(n))}`;
  return "0";
}

/** A reward name inside a sentence: "Free drink" → "free drink"; "$10 off" and "VIP night" stay. */
export function rewardInSentence(name: string): string {
  const m = /^([A-Z][a-z]+)(\b.*)$/.exec(name);
  return m ? `${m[1]!.toLowerCase()}${m[2]}` : name;
}
