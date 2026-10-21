import { describe, expect, it } from "vitest";
import { FEATURES, FREE_FOREVER, calculateEarn, isFeatureEnabled, isPlanAvailable, normalizePhone } from "../src/index.js";

describe("plans", () => {
  it("keeps every loyalty feature free forever", () => {
    for (const k of FREE_FOREVER) expect(FEATURES[k].minPlan).toBe("free");
    expect(FREE_FOREVER).toContain("loyalty.points");
    expect(FREE_FOREVER).toContain("locations.unlimited");
    expect(FREE_FOREVER).toContain("integrations.pos_auto_award");
  });
  it("hides paid features until rolled out", () => {
    expect(isFeatureEnabled("orders.order_ahead", { plan: "pro", stage: "hidden" })).toBe(false);
    expect(isFeatureEnabled("orders.order_ahead", { plan: "free", stage: "ga" })).toBe(false);
    expect(isFeatureEnabled("orders.order_ahead", { plan: "plus", stage: "ga" })).toBe(true);
    expect(isFeatureEnabled("orders.order_ahead", { plan: "plus", stage: "beta" })).toBe(false);
    expect(isFeatureEnabled("orders.order_ahead", { plan: "plus", stage: "beta", betaOptIn: true })).toBe(true);
    expect(isPlanAvailable("plus", {})).toBe(false);
    expect(isPlanAvailable("plus", { "orders.order_ahead": "ga" })).toBe(true);
  });
});

describe("points", () => {
  it("computes earn with VIP and promo multipliers", () => {
    const r = calculateEarn({
      rules: { earnType: "per_dollar", pointsPerDollar: 1, pointsPerVisit: 0, minSpendCents: 0 },
      lines: [{ amountCents: 1050 }],
      noEarnCategoryIds: [],
      boosts: [{ multiplier: 2 }, { bonusPoints: 5 }],
      vipMultiplier: 1.5,
    });
    expect(r.basePoints).toBe(30);
    expect(r.totalPoints).toBe(35);
  });
  it("normalizes phones", () => {
    expect(normalizePhone("(416) 555-0100")).toBe("+14165550100");
    expect(normalizePhone("12")).toBeNull();
  });
});
