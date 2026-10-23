import { describe, expect, it } from "vitest";
import { reportsApi } from "../src/index.js";

const { isRegular, isSlipping, medianGapDays, slippingThresholdDays, usuallyLabel, typicalFromWeeks, hourLabel } = reportsApi;
const DAY = 86_400_000;
const NOW = new Date("2026-10-23T14:00:00Z").getTime();
const daysAgo = (...ds: number[]) => ds.map((d) => NOW - d * DAY);

describe("isRegular", () => {
  it("needs 3 visits in the last 30 days", () => {
    expect(isRegular(daysAgo(1, 8, 15), NOW)).toBe(true);
    expect(isRegular(daysAgo(1, 8), NOW)).toBe(false);
    // A visit 31 days ago does not count.
    expect(isRegular(daysAgo(1, 8, 31), NOW)).toBe(false);
    expect(isRegular([], NOW)).toBe(false);
  });
  it("ignores visits in the future", () => {
    expect(isRegular([...daysAgo(1, 8), NOW + DAY], NOW)).toBe(false);
  });
  it("accepts Date and ISO strings", () => {
    expect(isRegular([new Date(NOW - DAY), new Date(NOW - 2 * DAY).toISOString(), NOW - 3 * DAY], NOW)).toBe(true);
  });
});

describe("medianGapDays and slipping threshold", () => {
  it("is the median gap between visits in the prior 60 days", () => {
    // Visits 50, 43, 36, 29 days ago: gaps of 7.
    expect(medianGapDays(daysAgo(50, 43, 36, 29), NOW)).toBe(7);
    // Gaps 2, 10 -> median 6 (even count averages the middle two).
    expect(medianGapDays(daysAgo(30, 28, 18), NOW)).toBe(6);
    expect(medianGapDays(daysAgo(5), NOW)).toBeNull();
  });
  it("never goes below 14 days", () => {
    expect(slippingThresholdDays(daysAgo(40, 39, 38, 37), NOW)).toBe(14);
    expect(slippingThresholdDays(daysAgo(50, 36, 22, 8), NOW)).toBe(28);
  });
});

describe("isSlipping", () => {
  it("is a regular rhythm followed by a gap longer than max(14, 2 x median gap)", () => {
    // Weekly visitor (gap 7), last seen 21 days ago: 21 > 14.
    expect(isSlipping(daysAgo(49, 42, 35, 28, 21), NOW)).toBe(true);
    // Last seen 14 days ago: not over 14 yet.
    expect(isSlipping(daysAgo(49, 42, 35, 28, 14), NOW)).toBe(false);
    // Last seen 15 days ago: over.
    expect(isSlipping(daysAgo(50, 43, 36, 29, 15), NOW)).toBe(true);
  });
  it("measures against the person's own rhythm: a monthly visitor is not slipping at 21 days", () => {
    // Gaps of 20 days: threshold 40, last seen 21 days ago.
    expect(isSlipping(daysAgo(59, 39, 21), NOW)).toBe(false);
    expect(isSlipping(daysAgo(59, 39, 20), NOW)).toBe(false);
  });
  it("needs 3 visits in the prior 60 days", () => {
    expect(isSlipping(daysAgo(40, 30), NOW)).toBe(false);
    // Older visits fall out of the 60-day window.
    expect(isSlipping(daysAgo(70, 65, 61, 20), NOW)).toBe(false);
  });
  it("is false for someone who came in today", () => {
    expect(isSlipping(daysAgo(30, 20, 10, 0), NOW)).toBe(false);
  });
});

describe("usuallyLabel", () => {
  const wk = (dow: number, hour: number) => ({ dow, hour });
  it("returns null with fewer than 4 visits", () => {
    expect(usuallyLabel([wk(1, 8), wk(2, 8), wk(3, 8)])).toBeNull();
  });
  it("picks the most common weekday group and 2-hour bucket", () => {
    const slots = [wk(1, 8), wk(2, 9), wk(3, 8), wk(4, 8), wk(6, 11)];
    expect(usuallyLabel(slots)).toBe("Weekdays 8 am");
  });
  it("calls out weekends", () => {
    expect(usuallyLabel([wk(6, 10), wk(0, 11), wk(6, 10), wk(0, 10), wk(2, 8)])).toBe("Weekends 10 am");
  });
  it("only looks at the 12 most recent visits (newest first)", () => {
    const recent = Array.from({ length: 12 }, () => wk(2, 14));
    const old = Array.from({ length: 20 }, () => wk(1, 7));
    expect(usuallyLabel([...recent, ...old])).toBe("Weekdays 2 pm");
  });
  it("breaks ties toward the earlier bucket", () => {
    expect(usuallyLabel([wk(1, 15), wk(1, 8), wk(2, 15), wk(2, 8)])).toBe("Weekdays 8 am");
  });
});

describe("typicalFromWeeks and hourLabel", () => {
  it("means the last four same-weekday totals, rounded", () => {
    expect(typicalFromWeeks([120, 126, 130, 128])).toBe(126);
    expect(typicalFromWeeks([1, 1, 1, 2])).toBe(1);
    // Only the last four count.
    expect(typicalFromWeeks([999, 100, 110, 120, 130])).toBe(115);
    expect(typicalFromWeeks([])).toBeNull();
  });
  it("formats hours", () => {
    expect([0, 7, 12, 13, 23].map(hourLabel)).toEqual(["12 am", "7 am", "12 pm", "1 pm", "11 pm"]);
  });
});
