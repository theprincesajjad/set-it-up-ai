import { describe, expect, it } from "vitest";
import { barHeights, hourTick, homeMode, promoHours, vsTypical, windowLabel } from "@/lib/dashboard/home";

describe("cafe home helpers", () => {
  it("switches at noon Toronto and honours ?mode=", () => {
    expect(homeMode(new Date("2026-11-03T14:00:00Z"))).toBe("morning"); // 9 am
    expect(homeMode(new Date("2026-11-03T20:00:00Z"))).toBe("close"); // 3 pm
    expect(homeMode(new Date("2026-11-03T14:00:00Z"), "close")).toBe("close");
  });
  it("compares against a typical day", () => {
    expect(vsTypical(131, 127, "Tuesday")?.text).toBe("+3% vs a typical Tuesday (127)");
    expect(vsTypical(10, 0, "Tuesday")).toBeNull();
    expect(vsTypical(100, 127, "Tuesday")?.good).toBe(false);
  });
  it("axis ticks and bar scaling", () => {
    expect([7, 8, 12, 13].map(hourTick)).toEqual(["7a", "8", "12p", "1"]);
    expect(barHeights([[0, 5, 10]], 100)).toEqual([[0, 50, 100]]);
  });
  it("promo window", () => {
    expect(promoHours("14:00", "16:00", [13, 14, 15, 16])).toEqual([14, 15]);
    expect(windowLabel("14:00", "16:00")).toBe("2–4 pm");
    expect(windowLabel(null, null)).toBe("all day");
  });
});
