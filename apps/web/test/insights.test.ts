import { describe, expect, it } from "vitest";
import type { reportsApi } from "@ll/shared";
import { reportsApi as api } from "@ll/shared";
import { barHeights, dollarsToCents, goalProgress, hasActivity, lockedLines, promoHref, shiftWeek, signalLine, validStart, weekdayLabel } from "@/lib/dashboard/insights";

const signals = () => Object.fromEntries(api.SIGNAL_KEYS.map((k) => [k, { count: 0, amountCents: 0 }])) as reportsApi.WeekInsight["signals"];

describe("the Free locked lines", () => {
  it("appear only when their count is above zero", () => {
    expect(lockedLines({ signals: signals(), fullDay: null })).toEqual([]);
    const s = signals();
    s.cancellations = { count: 4, amountCents: 0 };
    expect(lockedLines({ signals: s, fullDay: null })).toEqual([{ kind: "cancellations", n: 4 }]);
    expect(lockedLines({ signals: s, fullDay: { date: "2026-11-07", weekday: 6, views: 9 } })).toEqual([
      { kind: "cancellations", n: 4 },
      { kind: "fullDay", n: 9, weekday: 6 },
    ]);
  });
});

describe("the paid signal line", () => {
  it("lists only the parts with a count, in order", () => {
    const s = signals();
    s.rebook_booked.count = 9;
    s.waitlist_fills.count = 3;
    s.reviews_requested.count = 7;
    expect(signalLine(s).map((p) => `${p.n} ${p.key}`)).toEqual(["3 fills", "9 rebooked", "7 reviews"]);
    expect(signalLine(signals())).toEqual([]);
  });
});

describe("the trend bars", () => {
  it("scale to the tallest week and keep a week with money visible", () => {
    const t = [0, 1, 500, 1000].map((revenueCents, i) => ({ weekStart: `2026-10-0${i + 1}`, revenueCents }));
    expect(barHeights(t)).toEqual([2, 6, 50, 100]);
    expect(barHeights(t.map((x) => ({ ...x, revenueCents: 0 })))).toEqual([0, 0, 0, 0]);
  });
});

describe("the goal", () => {
  it("is a percent for the label and a clamped width for the bar", () => {
    expect(goalProgress({ cents: null, progress: null, reached: false })).toBeNull();
    expect(goalProgress({ cents: 250000, progress: 0.624, reached: false })).toEqual({ pct: 62, width: 62 });
    expect(goalProgress({ cents: 100000, progress: 1.4, reached: true })).toEqual({ pct: 140, width: 100 });
  });
  it("reads whole dollars", () => {
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("$2,500")).toBe(250000);
    expect(dollarsToCents("25.50")).toBeUndefined();
    expect(dollarsToCents("abc")).toBeUndefined();
  });
});

describe("small helpers", () => {
  it("builds the promo link with the day preset", () => {
    expect(promoHref("/m/abc", 6)).toBe("/m/abc/promos/new?day=sat");
    expect(promoHref("/m/abc", 0)).toBe("/m/abc/promos/new?day=sun");
  });
  it("moves a week and validates a start date", () => {
    expect(shiftWeek("2026-11-02", -1)).toBe("2026-10-26");
    expect(shiftWeek("2026-10-26", 1)).toBe("2026-11-02");
    expect(validStart("2026-11-02")).toBe("2026-11-02");
    expect(validStart("nope")).toBeUndefined();
  });
  it("names a weekday through the locale's date formatter", () => {
    const date = (d: Date, o: Intl.DateTimeFormatOptions, tz: string) => new Intl.DateTimeFormat("en-CA", { ...o, timeZone: tz }).format(d);
    expect(weekdayLabel(date, 0)).toBe("Sunday");
    expect(weekdayLabel(date, 6, "short")).toBe("Sat");
  });
  it("sees activity in money, last week's money or any signal", () => {
    const base = { revenueCents: 0, visits: 0, previous: { revenueCents: 0, visits: 0, newClients: 0 }, signals: signals() } as reportsApi.WeekInsight;
    expect(hasActivity(base)).toBe(false);
    expect(hasActivity({ ...base, revenueCents: 1 })).toBe(true);
    expect(hasActivity({ ...base, previous: { revenueCents: 5, visits: 0, newClients: 0 } })).toBe(true);
    expect(hasActivity({ ...base, signals: { ...signals(), cancellations: { count: 1, amountCents: 0 } } })).toBe(true);
  });
});
