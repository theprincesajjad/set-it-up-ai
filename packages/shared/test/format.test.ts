import { describe, expect, it } from "vitest";
import { DATE_NAMES, formatCurrency, formatDate, formatNumber, formatTime } from "../src/index.js";

const LOCALES = ["hi", "ur", "pa"] as const;
// One instant per month, noon UTC on the 15th (same calendar day in Toronto), 2026.
const monthDates = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, i, 15, 17)));
// 2026-10-25 is a Sunday; walk the week.
const weekDates = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 9, 25 + i, 17)));

describe("deterministic date names", () => {
  it("has twelve months and seven weekdays per language, none empty or numeric", () => {
    for (const l of LOCALES) {
      const n = DATE_NAMES[l];
      for (const list of [n.monthsLong, n.monthsShort]) {
        expect(list).toHaveLength(12);
        for (const m of list) expect(m).toMatch(/^[^\dA-Za-z]+$/);
      }
      for (const list of [n.weekdaysLong, n.weekdaysShort]) {
        expect(list).toHaveLength(7);
        for (const w of list) expect(w).toMatch(/^[^\dA-Za-z]+$/);
      }
      expect(new Set(n.monthsLong).size).toBe(12);
      expect(new Set(n.weekdaysLong).size).toBe(7);
    }
  });

  it.each(LOCALES)("%s: month names, long and short", (l) => {
    monthDates.forEach((d, i) => {
      expect(formatDate(l, d, { month: "long" })).toBe(DATE_NAMES[l].monthsLong[i]);
      expect(formatDate(l, d, { month: "short" })).toBe(DATE_NAMES[l].monthsShort[i]);
    });
  });

  it.each(LOCALES)("%s: weekday names, long and short, Sunday first", (l) => {
    weekDates.forEach((d, i) => {
      expect(formatDate(l, d, { weekday: "long" })).toBe(DATE_NAMES[l].weekdaysLong[i]);
      expect(formatDate(l, d, { weekday: "short" })).toBe(DATE_NAMES[l].weekdaysShort[i]);
    });
  });

  it("spells out the known names", () => {
    expect(DATE_NAMES.pa.monthsLong[9]).toBe("ਅਕਤੂਬਰ");
    expect(DATE_NAMES.hi.monthsLong[9]).toBe("अक्तूबर");
    expect(DATE_NAMES.ur.monthsLong[9]).toBe("اکتوبر");
    expect(DATE_NAMES.pa.weekdaysLong[0]).toBe("ਐਤਵਾਰ");
    expect(DATE_NAMES.hi.weekdaysLong[1]).toBe("सोमवार");
    expect(DATE_NAMES.ur.weekdaysLong[5]).toBe("جمعہ");
  });

  it("composes day, month, weekday and year with Latin digits and never prints a raw month number", () => {
    const d = new Date("2026-10-25T16:00:00Z");
    expect(formatDate("pa", d)).toBe("ਐਤ, 25 ਅਕਤੂ");
    expect(formatDate("hi", d, { weekday: "long", month: "long", day: "numeric", year: "numeric" })).toBe("रविवार, 25 अक्तूबर 2026");
    expect(formatDate("ur", d, { month: "short", day: "numeric" })).toBe("25 اکتوبر");
    expect(formatDate("ur", d)).toBe("اتوار، 25 اکتوبر");
    for (const l of LOCALES) expect(formatDate(l, d)).not.toMatch(/M\d/);
  });

  it("uses the requested time zone for the calendar day", () => {
    const d = new Date("2026-10-26T03:30:00Z"); // still the 25th in Toronto, the 26th in UTC
    expect(formatDate("hi", d, { day: "numeric", month: "short" })).toBe("25 अक्तू॰");
    expect(formatDate("hi", d, { day: "numeric", month: "short" }, "UTC")).toBe("26 अक्तू॰");
  });

  it("formats times with the language's am/pm word, midnight and noon as 12", () => {
    expect(formatTime("hi", "2026-10-25T21:30:00Z")).toBe("5:30 अपराह्न");
    expect(formatTime("pa", "2026-10-25T13:05:00Z")).toBe("9:05 ਪੂ.ਦੁ.");
    expect(formatTime("ur", "2026-10-25T16:00:00Z")).toBe("12:00 شام");
    expect(formatTime("ur", "2026-10-25T04:00:00Z")).toBe("12:00 صبح");
    expect(formatDate("pa", "2026-10-25T21:30:00Z", { weekday: "short", hour: "numeric", minute: "2-digit" })).toBe("ਐਤ, 5:30 ਬਾ.ਦੁ.");
  });

  it("keeps English on Intl", () => {
    expect(formatDate("en", "2026-10-25T16:00:00Z")).toBe("Sun, Oct 25");
    expect(formatDate("en", "2026-10-25T16:00:00Z", { month: "long", year: "numeric" })).toBe("October 2026");
  });

  it("formats numbers and currency identically in every language", () => {
    for (const l of ["en", ...LOCALES] as const) {
      expect(formatNumber(l, 1234567)).toBe("1,234,567");
      expect(formatCurrency(l, 1250)).toBe("$12.50");
      expect(formatCurrency(l, 1200)).toBe("$12");
      expect(formatCurrency(l, 1200, "CAD", true)).toBe("$12.00");
    }
  });
});
