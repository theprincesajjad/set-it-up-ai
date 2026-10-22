/**
 * Display formatting per ux-copy.md: dates "Tue, Oct 21", times "3:30 pm",
 * distance "350 m · 5 min walk" / "1.2 km", day groups "Today"/"Yesterday".
 */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

const toDate = (d: string | number | Date) => (d instanceof Date ? d : new Date(d));

/** "3:30 pm" */
export function formatTime(d: string | number | Date): string {
  const date = toDate(d);
  let h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** "3:30 pm" from "15:30" */
export function formatHhmm(hhmm: string): string {
  const [h = "0", m = "0"] = hhmm.split(":");
  const d = new Date(2000, 0, 1, Number(h), Number(m));
  return formatTime(d).replace(":00 ", " ");
}

/** "Oct 21" */
export function formatShortDate(d: string | number | Date): string {
  const date = toDate(d);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "Tue, Oct 21" */
export function formatDate(d: string | number | Date): string {
  const date = toDate(d);
  return `${DAYS[date.getDay()]}, ${formatShortDate(date)}`;
}

/** "Tue 3:12 pm" */
export function formatDayTime(d: string | number | Date): string {
  const date = toDate(d);
  return `${DAYS[date.getDay()]} ${formatTime(date)}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today", "Yesterday", "Mon, Oct 19" */
export function dayGroupLabel(d: string | number | Date, now = new Date()): string {
  const diff = Math.round((startOfDay(now) - startOfDay(toDate(d))) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return formatDate(d);
}

/** "just now", "3 min ago", "2 h ago", "Oct 21" */
export function relativeTime(d: string | number | Date, now = Date.now()): string {
  const ms = now - toDate(d).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} h ago`;
  return formatShortDate(d);
}

/** "350 m · 5 min walk" (switch to km above 1,000 m: "1.2 km") */
export function formatDistance(m: number | null | undefined, withWalk = false): string {
  if (m === null || m === undefined) return "";
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  const rounded = Math.max(10, Math.round(m / 10) * 10);
  if (!withWalk) return `${rounded} m`;
  const mins = Math.max(1, Math.round(m / 80));
  return `${rounded} m · ${mins} min walk`;
}

/** "Ends Sun", "Today only", "Ends Oct 30" */
export function promoEnds(endsAt: string | null, now = new Date()): string | null {
  if (!endsAt) return null;
  const end = new Date(endsAt);
  const days = Math.round((startOfDay(end) - startOfDay(now)) / 86_400_000);
  if (days <= 0) return "Today only";
  if (days < 7) return `Ends ${DAYS[end.getDay()]}`;
  return `Ends ${formatShortDate(end)}`;
}

/** mm:ss for countdowns: "9:41", "0:27" */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Hours = Record<string, [string, string][]> | null | undefined;
const KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** "Open · closes 6 pm" / "Closed · opens 8 am" (device local time; shops are local). */
export function openStatus(hours: Hours, openNow: boolean | null | undefined, now = new Date()): { open: boolean; label: string } | null {
  if (!hours) return openNow === null || openNow === undefined ? null : { open: openNow, label: openNow ? "Open" : "Closed" };
  const mins = now.getHours() * 60 + now.getMinutes();
  const toMin = (s: string) => {
    const [h = "0", m = "0"] = s.split(":");
    return Number(h) * 60 + Number(m);
  };
  const today = hours[KEYS[now.getDay()]!] ?? [];
  for (const [o, c] of today) {
    const om = toMin(o);
    const cm = toMin(c);
    if ((cm > om && mins >= om && mins < cm) || (cm <= om && (mins >= om || mins < cm))) {
      return { open: true, label: `Open · closes ${formatHhmm(c)}` };
    }
  }
  for (let i = 0; i < 7; i++) {
    const day = hours[KEYS[(now.getDay() + i) % 7]!] ?? [];
    for (const [o] of day) {
      if (i > 0 || toMin(o) > mins) return { open: false, label: `Closed · opens ${formatHhmm(o)}` };
    }
  }
  return { open: false, label: "Closed" };
}

export function hoursRows(hours: Hours, now = new Date()): { day: string; text: string; today: boolean }[] {
  if (!hours) return [];
  const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  const names: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
  return order.map((k) => {
    const ranges = hours[k] ?? [];
    return {
      day: names[k] ?? k,
      text: ranges.length ? ranges.map(([o, c]) => `${formatHhmm(o)}–${formatHhmm(c)}`).join(", ") : "Closed",
      today: KEYS[now.getDay()] === k,
    };
  });
}

/** "+50" / "−250" (U+2212 minus, never a hyphen) for ledger deltas. */
export function signed(n: number): string {
  if (n > 0) return `+${n.toLocaleString("en-CA")}`;
  if (n < 0) return `−${Math.abs(n).toLocaleString("en-CA")}`;
  return "0";
}

/**
 * A reward name inside a sentence: "Free drink" → "free drink", "$10 off" stays, proper nouns stay
 * ("Free Pinecone mug" → "free Pinecone mug"). Only the first word is lowered, and only when it is a
 * plain capitalised word (not "VIP", not "$5").
 */
export function rewardInSentence(name: string): string {
  const m = /^([A-Z][a-z]+)(\b.*)$/.exec(name);
  return m ? `${m[1]!.toLowerCase()}${m[2]}` : name;
}
