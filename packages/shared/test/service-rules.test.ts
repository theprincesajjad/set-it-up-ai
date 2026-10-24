import { describe, expect, it } from "vitest";
import { OVER_ESTIMATE_BPS, dueSteps, earnableAmounts, maxAuthorizedCents, tipChoices, tipWithinLimit, tipsEnabledFor } from "../src/service-rules.js";

describe("service rules", () => {
  it("caps a final price at 10% above the quote, rounded down", () => {
    expect(OVER_ESTIMATE_BPS).toBe(1000);
    expect(maxAuthorizedCents(11300)).toBe(12430);
    expect(maxAuthorizedCents(9999)).toBe(10998);
    expect(maxAuthorizedCents(0)).toBe(0);
  });
  it("tips: on for salons, off for repair, 0 to 100% of the pre-tax amount", () => {
    expect(tipsEnabledFor("salon", null)).toBe(true);
    expect(tipsEnabledFor("repair_electronics", null)).toBe(false);
    expect(tipsEnabledFor("repair_electronics", true)).toBe(true);
    expect(tipChoices(18000)).toEqual([{ percent: 15, cents: 2700 }, { percent: 20, cents: 3600 }, { percent: 25, cents: 4500 }]);
    expect(tipWithinLimit(18000, 18000)).toBe(true);
    expect(tipWithinLimit(18001, 18000)).toBe(false);
    expect(tipWithinLimit(-1, 18000)).toBe(false);
  });
  it("credits reduce earning lines in proportion; tax and tips are never lines", () => {
    expect(earnableAmounts([{ amountCents: 10000 }, { amountCents: -2500 }])).toEqual([7500, 0]);
    expect(earnableAmounts([{ amountCents: 1000 }, { amountCents: -5000 }])).toEqual([0, 0]);
  });
  it("pickup ladder steps come due in order", () => {
    expect(dueSteps(2, 0)).toEqual([]);
    expect(dueSteps(8, 0).map((s) => s.day)).toEqual([3, 7]);
    expect(dueSteps(60, 30).map((s) => s.day)).toEqual([60]);
  });
});
