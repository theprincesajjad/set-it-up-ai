/**
 * Locale-aware versions of the display helpers in ./format.ts. English keeps the hand-written formats ("3:30 pm",
 * "Oct 21") exactly; hi / ur / pa go through Intl with the language's own tag and the catalog for the fixed words.
 * Pass the `useLocale()` value: `const L = useLocale(); formatTimeL(L, d)`.
 */
import { LOCALES, formatCurrency, unitLabel as sharedUnitLabel, unitWord, type Locale, type MessageKey, type Vars } from "@ll/shared";
import { formatMoney, formatPts, termWord, unitLabel } from "./award";
import { dayGroupLabel, formatDate, formatDayTime, formatDistance, formatShortDate, formatTime, openStatus, relativeTime, hoursRows } from "./format";

export interface L {
  locale: Locale;
  t: (key: MessageKey, vars?: Vars) => string;
}

const toDate = (d: string | number | Date) => (d instanceof Date ? d : new Date(d));

/** Intl in the device's time zone (shops are local; the app has always shown device-local times). */
function intl(locale: Locale, d: string | number | Date, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(LOCALES[locale].bcp47, opts).format(toDate(d));
  } catch {
    return new Intl.DateTimeFormat("en-CA", opts).format(toDate(d));
  }
}

export const formatTimeL = (L: L, d: string | number | Date) => (L.locale === "en" ? formatTime(d) : intl(L.locale, d, { hour: "numeric", minute: "2-digit" }));
export const formatShortDateL = (L: L, d: string | number | Date) => (L.locale === "en" ? formatShortDate(d) : intl(L.locale, d, { month: "short", day: "numeric" }));
export const formatDateL = (L: L, d: string | number | Date) => (L.locale === "en" ? formatDate(d) : intl(L.locale, d, { weekday: "short", month: "short", day: "numeric" }));
export const formatDayTimeL = (L: L, d: string | number | Date) => (L.locale === "en" ? formatDayTime(d) : `${intl(L.locale, d, { weekday: "short" })} ${formatTimeL(L, d)}`);

/** "3:30 pm" from "15:30". */
export function formatHhmmL(L: L, hhmm: string): string {
  if (L.locale === "en") return formatTime(new Date(2000, 0, 1, ...hhmm.split(":").map(Number) as [number, number])).replace(":00 ", " ");
  const [h = "0", m = "0"] = hhmm.split(":");
  return formatTimeL(L, new Date(2000, 0, 1, Number(h), Number(m)));
}

export function dayGroupLabelL(L: L, d: string | number | Date, now = new Date()): string {
  if (L.locale === "en") return dayGroupLabel(d, now);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(toDate(d))) / 86_400_000);
  if (diff === 0) return L.t("sh.activity.today").replace(/^./, (c) => c.toUpperCase());
  if (diff === 1) return L.t("ui.yesterday");
  return formatDateL(L, d);
}

export function relativeTimeL(L: L, d: string | number | Date, now = Date.now()): string {
  if (L.locale === "en") return relativeTime(d, now);
  const ms = now - toDate(d).getTime();
  if (ms < 60_000) return L.t("ui.justNow");
  if (ms < 3_600_000) return L.t("ui.minAgo", { n: Math.floor(ms / 60_000) });
  if (ms < 86_400_000) return L.t("ui.hAgo", { n: Math.floor(ms / 3_600_000) });
  return formatShortDateL(L, d);
}

/** "350 m · 5 min walk" / "1.2 km". */
export function formatDistanceL(L: L, m: number | null | undefined, withWalk = false): string {
  if (L.locale === "en") return formatDistance(m, withWalk);
  if (m === null || m === undefined) return "";
  const dist = m >= 1000 ? L.t("ui.distKm", { n: (m / 1000).toFixed(1) }) : L.t("ui.distM", { n: Math.max(10, Math.round(m / 10) * 10) });
  if (m >= 1000 || !withWalk) return dist;
  return L.t("ui.distWalk", { dist, n: Math.max(1, Math.round(m / 80)) });
}

/** "Ends Sun", "Today only", "Ends Oct 30". */
export function promoEndsL(L: L, endsAt: string | null, now = new Date()): string | null {
  if (!endsAt) return null;
  const end = new Date(endsAt);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(end) - day(now)) / 86_400_000);
  if (days <= 0) return L.t("ui.promoToday");
  if (days < 7) return L.t("ui.promoEndsDay", { day: L.locale === "en" ? intl("en", end, { weekday: "short" }) : intl(L.locale, end, { weekday: "short" }) });
  return L.t("ui.promoEndsDate", { date: formatShortDateL(L, end) });
}

type Hours = Parameters<typeof openStatus>[0];

/** Where a shop is in its day: open until a time, closed until a time, or just open / closed (no hours on file). */
function openCore(hours: Hours, openNow: boolean | null | undefined, now: Date): { open: boolean; kind: "closes" | "opens" | "plain"; hhmm?: string } | null {
  if (!hours) return openNow === null || openNow === undefined ? null : { open: openNow, kind: "plain" };
  const key = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const toMin = (x: string) => {
    const [h = "0", m = "0"] = x.split(":");
    return Number(h) * 60 + Number(m);
  };
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const [o, c] of hours[key[now.getDay()]!] ?? []) {
    const om = toMin(o);
    const cm = toMin(c);
    if ((cm > om && mins >= om && mins < cm) || (cm <= om && (mins >= om || mins < cm))) return { open: true, kind: "closes", hhmm: c };
  }
  for (let i = 0; i < 7; i++) {
    for (const [o] of hours[key[(now.getDay() + i) % 7]!] ?? []) if (i > 0 || toMin(o) > mins) return { open: false, kind: "opens", hhmm: o };
  }
  return { open: false, kind: "plain" };
}

/** "Open · closes 6 pm" / "Closed · opens 8 am", localised; English is the original helper's wording. */
export function openStatusL(L: L, hours: Hours, openNow: boolean | null | undefined, now = new Date()): { open: boolean; label: string } | null {
  if (L.locale === "en") return openStatus(hours, openNow, now);
  const c = openCore(hours, openNow, now);
  if (!c) return null;
  if (c.kind === "closes") return { open: true, label: L.t("ui.hours.openCloses", { time: formatHhmmL(L, c.hhmm!) }) };
  if (c.kind === "opens") return { open: false, label: L.t("ui.hours.closedOpens", { time: formatHhmmL(L, c.hhmm!) }) };
  return { open: c.open, label: L.t(c.open ? "ui.hours.open" : "ui.hours.closed") };
}

/** The shop sheet's status line: a word ("open") and the rest ("until 6 pm", "opens 8 am"), or null without hours. */
export function openPartsL(L: L, hours: Hours, openNow: boolean | null | undefined, now = new Date()): { open: boolean; word: string; rest: string | null } | null {
  if (L.locale === "en") {
    const s = openStatus(hours, openNow, now);
    if (!s) return null;
    const rest = s.label.replace(/^(Open|Closed)( · )?/, "").replace(/^closes /, "until ");
    return { open: s.open, word: s.open ? "open" : "closed", rest: rest || null };
  }
  const c = openCore(hours, openNow, now);
  if (!c) return null;
  return {
    open: c.open,
    word: L.t(c.open ? "ui.hours.open" : "ui.hours.closed"),
    rest: c.kind === "closes" ? L.t("ms.shop.until", { time: formatHhmmL(L, c.hhmm!) }) : c.kind === "opens" ? L.t("ms.shop.opensAt", { time: formatHhmmL(L, c.hhmm!) }) : null,
  };
}

/** Weekly hours rows with the day names and "Closed" in the shopper's language. */
export function hoursRowsL(L: L, hours: Hours, now = new Date()): { day: string; text: string; today: boolean }[] {
  const rows = hoursRows(hours, now);
  if (L.locale === "en" || !hours) return rows;
  const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  // Monday 2000-01-03 .. Sunday 2000-01-09
  return rows.map((r, i) => {
    const ranges = hours[order[i]!] ?? [];
    return {
      day: intl(L.locale, new Date(2000, 0, 3 + i), { weekday: "long" }),
      text: ranges.length ? ranges.map(([o, c]) => `${formatHhmmL(L, o)}–${formatHhmmL(L, c)}`).join(", ") : L.t("ui.hours.closed"),
      today: r.today,
    };
  });
}

/** "$11.80" always two decimals, in the language's own number style. */
export const formatMoneyL = (L: L, cents: number) => (L.locale === "en" ? formatMoney(cents) : formatCurrency(L.locale, cents, "CAD", true));

/** "120 pts" in English; "120 पॉइंट" / "1 stamp"-style in hi / ur / pa for points and stamps (a custom unit word stays as the shop typed it). */
export function formatPtsL(L: L, n: number, terminology?: string | null): string {
  if (L.locale === "en") return formatPts(n, terminology);
  const lower = (terminology || "points").trim().toLowerCase();
  if (["points", "point", "stamps", "stamp"].includes(lower)) return sharedUnitLabel(L.locale, terminology || "points", n);
  return formatPts(n, terminology);
}

/** The unit as a word inside a sentence ("points", "पॉइंट"). */
export function termWordL(L: L, terminology: string | null | undefined, n = 2): string {
  if (L.locale === "en") return termWord(terminology, n);
  return unitWord(L.locale, terminology || "points");
}

/** "Free drink" -> "free drink" in a sentence (English only: the other scripts have no letter case). */
export function rewardInSentenceL(L: L, name: string): string {
  if (L.locale !== "en") return name;
  const m = /^([A-Z][a-z]+)(\b.*)$/.exec(name);
  return m ? `${m[1]!.toLowerCase()}${m[2]}` : name;
}

/** The unit alone ("pts", "stamps"; "पॉइंट", "स्टैम्प") for a number printed separately. */
export function unitLabelL(L: L, terminology: string | null | undefined, n: number): string {
  return L.locale === "en" ? unitLabel(terminology, n) : unitWord(L.locale, terminology || "points");
}

/** What a shop's points do over time ("Points never expire."), in the shopper's language; English keeps the shop's own disclosure. */
export function expiryLineL(L: L, m: { expiryDisclosure: string; terminology: string; program?: { expiryMonths?: number | null } | null }): string {
  if (L.locale === "en") return m.expiryDisclosure;
  const unit = unitWord(L.locale, m.terminology);
  const months = m.program?.expiryMonths;
  return months ? L.t("sh.pass.expireAfter", { unit, months }) : L.t("sh.pass.neverExpire", { unit });
}
