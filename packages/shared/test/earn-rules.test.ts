/** wave-n: rules. calculateEarn with "only selected things earn", and the program contract's bounds. */
import { describe, expect, it } from "vitest";
import { calculateEarn, merchantApi } from "../src/index.js";

const stamps = { earnType: "stamps" as const, pointsPerDollar: 0, pointsPerVisit: 1, minSpendCents: 0 };
const onlyGel = (l: { serviceId?: string | null; categoryId?: string | null }) => l.serviceId === "gel" || l.categoryId === "nails";

describe("calculateEarn: what earns", () => {
  it("without a list, every line outside a no-earn category earns (unchanged)", () => {
    expect(calculateEarn({ rules: stamps, lines: [{ amountCents: 0 }], noEarnCategoryIds: [] }).totalPoints).toBe(1);
  });

  it("with a list, a visit needs at least one line on it", () => {
    expect(calculateEarn({ rules: stamps, lines: [{ amountCents: 4500, serviceId: "gel" }], noEarnCategoryIds: [], isLineEligible: onlyGel }).totalPoints).toBe(1);
    const brow = calculateEarn({ rules: stamps, lines: [{ amountCents: 2000, serviceId: "brow" }], noEarnCategoryIds: [], isLineEligible: onlyGel });
    expect(brow).toMatchObject({ totalPoints: 0, qualifiesAsVisit: false, excludedCents: 2000 });
    expect(calculateEarn({ rules: stamps, lines: [{ amountCents: 0 }], noEarnCategoryIds: [], isLineEligible: onlyGel }).breakdown).toContain("Not on the list of things that earn");
  });

  it("per dollar earns only on listed lines, and a regulated line never counts", () => {
    const r = calculateEarn({
      rules: { earnType: "per_dollar", pointsPerDollar: 1, pointsPerVisit: 0, minSpendCents: 0 },
      lines: [{ amountCents: 1000, categoryId: "nails" }, { amountCents: 500, categoryId: "other" }, { amountCents: 700, categoryId: "rx" }],
      noEarnCategoryIds: ["rx"],
      isLineEligible: () => true,
    });
    expect(r).toMatchObject({ eligibleCents: 1500, excludedCents: 700, totalPoints: 15 });
    const listed = calculateEarn({ rules: { earnType: "per_dollar", pointsPerDollar: 1, pointsPerVisit: 0, minSpendCents: 0 }, lines: [{ amountCents: 1000, categoryId: "nails" }, { amountCents: 500, categoryId: "other" }], noEarnCategoryIds: [], isLineEligible: onlyGel });
    expect(listed.totalPoints).toBe(10);
  });

  it("a targeted promo boost only applies to an eligible line", () => {
    const boosts = [{ multiplier: 2, categoryId: "other" }];
    expect(calculateEarn({ rules: stamps, lines: [{ amountCents: 900, categoryId: "nails" }, { amountCents: 100, categoryId: "other" }], noEarnCategoryIds: [], isLineEligible: onlyGel, boosts }).totalPoints).toBe(1);
    expect(calculateEarn({ rules: stamps, lines: [{ amountCents: 900, categoryId: "nails" }], noEarnCategoryIds: [], isLineEligible: onlyGel, boosts: [{ multiplier: 2 }] }).totalPoints).toBe(2);
  });
});

describe("program contract", () => {
  it("bounds the stamp goal at 2 to 50 and validates the rules fields", () => {
    expect(merchantApi.STAMP_GOAL_MIN).toBe(2);
    expect(merchantApi.STAMP_GOAL_MAX).toBe(50);
    expect(merchantApi.updateProgramBody.safeParse({ stampGoal: 51 }).success).toBe(false);
    expect(merchantApi.updateProgramBody.safeParse({ earnUnit: "pickup", earnScope: "selected", maxStampsPerDay: 3 }).success).toBe(true);
    expect(merchantApi.updateProgramBody.safeParse({ earnUnit: "hug" }).success).toBe(false);
    expect(merchantApi.updateProgramBody.safeParse({ earnServiceIds: ["not-a-uuid"] }).success).toBe(false);
    const dedup = merchantApi.updateProgramBody.parse({ earnItemIds: ["0f8fad5b-d9cb-469f-a165-70867728950e", "0f8fad5b-d9cb-469f-a165-70867728950e"] });
    expect(dedup.earnItemIds).toHaveLength(1);
  });
});
