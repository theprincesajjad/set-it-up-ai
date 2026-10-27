/**
 * Locale-aware versions of the English display helpers in lib/format, lib/hours, lib/program and lib/place.
 * English keeps the hand-written formats ("3:30 pm", "Open · closes 6 pm") exactly; hi / ur / pa go through Intl
 * with the language's own tag and the catalog for the fixed words. Pass `{ locale, t }` from `useLocale()` or
 * `{ locale, t: translator(locale) }` on the server.
 */
import { formatDate, placeKindLabel, type Locale, type MessageKey, type Vars } from "@ll/shared";
import type { customerApi, networkApi } from "@ll/shared";
import { formatDistance } from "../format";
import { openCore, openStatus, weekRows } from "../hours";
import { howYouEarn } from "../program";
import { unitsText } from "../units";
import { rewardNameIn } from "./rewardName";

export interface L {
  locale: Locale;
  t: (key: MessageKey, vars?: Vars) => string;
}

const WEEK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Deterministic (names from shared tables, not the runtime's ICU data). Dates here are fixed UTC wall-clock dates, never "now". */
function intl(locale: Locale, d: Date, opts: Intl.DateTimeFormatOptions): string {
  return formatDate(locale, d, opts, "UTC");
}

/** "17:30" in the language's own clock style ("5:30 pm", "५:३० ..." never: Latin digits stay, the am/pm word follows the language). */
export function hhmmL(locale: Locale, hhmm: string): string {
  const [h = "0", m = "0"] = hhmm.split(":");
  return intl(locale, new Date(Date.UTC(2000, 0, 1, Number(h), Number(m))), { hour: "numeric", minute: Number(m) ? "2-digit" : undefined });
}

/** "Open · closes 6 pm" / "Closed · opens Mon 8 am", localised. */
export function openStatusL(L: L, hours: networkApi.OpeningHours | null | undefined, tz?: string): { open: boolean; label: string } | null {
  if (L.locale === "en") return openStatus(hours, tz);
  const c = openCore(hours, tz);
  if (!c) return null;
  if (c.kind === "closes") return { open: true, label: L.t("ui.hours.openCloses", { time: hhmmL(L.locale, c.hhmm!) }) };
  if (c.kind === "opens") {
    const day = c.sameDay ? "" : `${intl(L.locale, new Date(Date.UTC(2000, 0, 2 + WEEK.indexOf(c.dayKey!))), { weekday: "short" })} `;
    return { open: false, label: L.t("ui.hours.closedOpens", { time: `${day}${hhmmL(L.locale, c.hhmm!)}` }) };
  }
  return { open: c.open, label: L.t(c.open ? "ui.hours.open" : "ui.hours.closed") };
}

/** Weekly hours rows, Monday first, day names and "Closed" in the shopper's language. */
export function weekRowsL(L: L, hours: networkApi.OpeningHours | null | undefined): { day: string; text: string }[] {
  const rows = weekRows(hours);
  if (L.locale === "en" || !hours) return rows;
  const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  return rows.map((r, i) => {
    const ranges = hours[order[i]!] ?? [];
    return { day: intl(L.locale, new Date(Date.UTC(2000, 0, 3 + i)), { weekday: "long" }), text: ranges.length ? ranges.map(([o, c]) => `${hhmmL(L.locale, o)}–${hhmmL(L.locale, c)}`).join(", ") : L.t("ui.hours.closed") };
  });
}

/** "350 m" / "1.2 km". */
export function distanceL(L: L, metres: number | null | undefined): string {
  if (L.locale === "en") return formatDistance(metres);
  if (metres === null || metres === undefined) return "";
  return metres < 1000 ? L.t("ui.distM", { n: Math.max(10, Math.round(metres / 10) * 10) }) : L.t("ui.distKm", { n: (metres / 1000).toFixed(1) });
}

/** The short kind of place under a shop name ("café", "bakery") in the shopper's language. */
export const kindL = (L: L, vertical: string | null | undefined) => placeKindLabel(L.locale, vertical);

type ProgramLike = Pick<customerApi.ProgramSummaryDto, "earnType" | "pointsPerDollar" | "pointsPerVisit" | "stampGoal" | "terminology"> & { minSpendCents?: number };

/** "1 stamp per visit." / "5 pts for every $1." in English; the translated unit and pattern otherwise. */
export function howYouEarnL(L: L, p: ProgramLike, amount: string): string {
  if (L.locale === "en") return howYouEarn(p);
  const term = p.terminology || "points";
  if (p.earnType === "per_dollar") return L.t("ms.shop.earnPerDollar", { pts: unitsText(L.locale, p.pointsPerDollar, term), amount });
  return L.t("ms.shop.earnVisit", { amount: unitsText(L.locale, p.pointsPerVisit || 1, term) });
}

/** "Free drink" -> "free drink" inside a sentence (English only; the other scripts have no case). */
export function rewardInSentenceL(L: L, name: string): string {
  if (L.locale !== "en") return rewardNameIn(L.locale, L.t, name);
  const m = /^([A-Z][a-z]+)(\b.*)$/.exec(name);
  return m ? `${m[1]!.toLowerCase()}${m[2]}` : name;
}

/** What a shop's points do over time ("Points never expire."); English keeps the shop's own disclosure. */
export function expiryLineL(L: L, m: { expiryDisclosure: string; terminology: string; program?: { expiryMonths?: number | null } | null }): string {
  if (L.locale === "en") return m.expiryDisclosure;
  const unit = unitsText(L.locale, 2, m.terminology, false).replace(/^[\d,.\s]+/, "");
  const months = m.program?.expiryMonths;
  return months ? L.t("sh.pass.expireAfter", { unit, months }) : L.t("sh.pass.neverExpire", { unit });
}

/** "Weekdays · 2 pm to 4 pm", "Tuesdays · all day", or null when the promo has no weekday or hours rule (the card's end date covers it). */
export function promoWhenL(L: L, p: { daysOfWeek?: number[] | null; startTime?: string | null; endTime?: string | null }): string | null {
  const { locale, t } = L;
  const days = [...new Set(p.daysOfWeek ?? [])].sort();
  if (!days.length && !p.startTime && !p.endTime) return null;
  const key = days.join(",");
  const dayName = (d: number, style: "long" | "short") => intl(locale, new Date(Date.UTC(2023, 0, 1 + d)), { weekday: style });
  const dayLabel =
    key === "1,2,3,4,5" ? t("wp.ui.promoWeekdays")
    : key === "0,6" ? t("wp.ui.promoWeekends")
    : !days.length || days.length === 7 ? t("wp.ui.promoEveryDay")
    : days.length === 1 ? t("wp.ui.promoDayEvery", { day: dayName(days[0]!, "long") })
    : days.map((d) => dayName(d, "short")).join(", ");
  // English keeps the hand-written "2 pm" (Intl says "2 p.m."); the other languages go through Intl.
  const clock = (hhmm: string) => {
    if (locale !== "en") return hhmmL(locale, hhmm);
    const [h = 0, m = 0] = hhmm.split(":").map(Number);
    return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 && h < 24 ? "pm" : "am"}`; // l10n-ok: English branch (locale === "en") keeps the hand-written formats
  };
  const time = !p.startTime && !p.endTime ? t("wp.ui.promoAllDay") : t("wp.ui.promoRange", { from: clock(p.startTime ?? "00:00"), to: clock(p.endTime ?? "24:00") });
  return `${dayLabel} · ${time}`;
}
