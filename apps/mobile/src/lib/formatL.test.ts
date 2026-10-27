import { DATE_NAMES, type Locale } from "@ll/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dayGroupLabelL, formatDateL, formatDayTimeL, formatHhmmL, formatShortDateL, formatTimeL, hoursRowsL, promoEndsL, relativeTimeL, type L } from "./formatL";
import { formatDate, formatDayTime, formatShortDate, formatTime } from "./format";

const mk = (locale: Locale): L => ({ locale, t: (k) => String(k) });
// A Sunday afternoon, built in local time so the device zone and the expectations agree.
const d = new Date(2026, 9, 25, 15, 30);

afterEach(() => vi.restoreAllMocks());

describe("formatL: English is the hand-written format, byte for byte", () => {
  const en = mk("en");
  it("matches format.ts", () => {
    expect(formatTimeL(en, d)).toBe(formatTime(d));
    expect(formatShortDateL(en, d)).toBe(formatShortDate(d));
    expect(formatDateL(en, d)).toBe(formatDate(d));
    expect(formatDayTimeL(en, d)).toBe(formatDayTime(d));
    expect(formatTimeL(en, d)).toBe("3:30 pm");
    expect(formatShortDateL(en, d)).toBe("Oct 25");
    expect(formatHhmmL(en, "15:00")).toBe("3 pm");
  });
});

describe.each(["hi", "ur", "pa"] as const)("formatL %s uses the shared name tables, not Intl locale data", (loc) => {
  const L = mk(loc);
  const n = DATE_NAMES[loc];
  const comma = n.comma;
  // Urdu names the part of the day before the hour ("دوپہر 3:30"), as it is said; Hindi and Punjabi put am/pm after it.
  const clock = (c: string, hour: number) => (loc === "ur" ? `${hour < 4 || hour >= 20 ? "رات" : hour < 12 ? "صبح" : hour < 16 ? "دوپہر" : "شام"} ${c}` : `${c} ${hour < 12 ? n.am : n.pm}`);
  it("formats time, dates and day-time", () => {
    expect(formatTimeL(L, d)).toBe(clock("3:30", 15));
    expect(formatTimeL(L, new Date(2026, 9, 25, 0, 5))).toBe(clock("12:05", 0));
    expect(formatShortDateL(L, d)).toBe(`25 ${n.monthsShort[9]}`);
    expect(formatDateL(L, d)).toBe(`${n.weekdaysShort[0]}${comma} 25 ${n.monthsShort[9]}`);
    expect(formatDayTimeL(L, d)).toBe(`${n.weekdaysShort[0]} ${clock("3:30", 15)}`);
    expect(formatHhmmL(L, "09:00")).toBe(clock("9:00", 9));
  });
  it("never touches Intl with the language's own tag", () => {
    const real = Intl.DateTimeFormat;
    const tags: unknown[] = [];
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (this: unknown, tag?: string | string[], o?: Intl.DateTimeFormatOptions) {
      tags.push(tag);
      return new real(tag, o);
    } as never);
    formatDateL(L, d);
    formatTimeL(L, d);
    expect(tags.every((t) => t === "en-CA")).toBe(true);
  });
  it("labels days, relative times, promo ends and weekly hours", () => {
    expect(dayGroupLabelL(L, new Date(2026, 9, 20), d)).toBe(`${n.weekdaysShort[2]}${comma} 20 ${n.monthsShort[9]}`);
    expect(relativeTimeL(L, new Date(2026, 8, 1), d.getTime())).toBe(`1 ${n.monthsShort[8]}`);
    expect(promoEndsL(L, new Date(2026, 9, 30).toISOString(), d)).toBe("ui.promoEndsDay");
    expect(promoEndsL(L, new Date(2026, 10, 30).toISOString(), d)).toBe("ui.promoEndsDate");
    const rows = hoursRowsL(L, { mon: [["09:00", "17:00"]] } as never, d);
    expect(rows[0]).toMatchObject({ day: n.weekdaysLong[1], text: `${clock("9:00", 9)}–${clock("5:00", 17)}` });
    expect(rows[1]!.day).toBe(n.weekdaysLong[2]);
  });
});
