import { describe, expect, it } from "vitest";
import { translator } from "@ll/shared";
import { promoWhenL } from "@/lib/i18n/formatL";
import { stampProgress } from "@/lib/dashboard/customers";

const en = { locale: "en" as const, t: translator("en") };

describe("promoWhenL (the promo card says when)", () => {
  it("names the days and hours", () => {
    expect(promoWhenL(en, { daysOfWeek: [1, 2, 3, 4, 5], startTime: "14:00", endTime: "16:00" })).toBe("Weekdays · 2 pm to 4 pm");
    expect(promoWhenL(en, { daysOfWeek: [2], startTime: null, endTime: null })).toBe("Tuesdays · all day");
    expect(promoWhenL(en, { daysOfWeek: [0, 6], startTime: "08:00", endTime: "12:00" })).toBe("Weekends · 8 am to 12 pm");
    expect(promoWhenL(en, { daysOfWeek: [1, 3, 5], startTime: null, endTime: null })).toBe("Mon, Wed, Fri · all day");
    expect(promoWhenL(en, { daysOfWeek: null, startTime: "07:00", endTime: "09:00" })).toBe("Every day · 7 am to 9 am");
  });
  it("says nothing for a promo with no weekday or hours rule", () => {
    expect(promoWhenL(en, { daysOfWeek: null, startTime: null, endTime: null })).toBeNull();
    expect(promoWhenL(en, { daysOfWeek: [], startTime: null, endTime: null })).toBeNull();
  });
  it("speaks the shopper's language", () => {
    const hi = { locale: "hi" as const, t: translator("hi") };
    const out = promoWhenL(hi, { daysOfWeek: [1, 2, 3, 4, 5], startTime: "14:00", endTime: "16:00" })!;
    expect(out).toContain("सप्ताह के दिन");
    expect(out).not.toContain("Weekdays");
  });
});

describe("stampProgress", () => {
  it("never shows 13 / 10", () => {
    expect(stampProgress(7, 10)).toBe("7 / 10");
    expect(stampProgress(10, 10)).toBe("10 / 10");
    expect(stampProgress(13, 10)).toBe("1 reward + 3");
    expect(stampProgress(25, 10)).toBe("2 rewards + 5");
  });
});
