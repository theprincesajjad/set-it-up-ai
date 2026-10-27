import { describe, expect, it } from "vitest";
import { checkBeautyClaims, estimateWaitMin, ordinalEn, waitText } from "../src/index";

describe("walk-in line maths", () => {
  const person = (durationMin: number, requestedStaffId: string | null = null) => ({ durationMin, requestedStaffId });
  it("rounds up to 5 minutes and is zero for an empty line with a free chair", () => {
    expect(estimateWaitMin([], [{ staffId: "a", busyMin: 0 }], null)).toBe(0);
    expect(estimateWaitMin([person(23)], [{ staffId: "a", busyMin: 0 }], null)).toBe(25);
  });
  it("adds what is left at the freest chair and spreads the work over the chairs", () => {
    expect(estimateWaitMin([person(30), person(30)], [{ staffId: "a", busyMin: 10 }, { staffId: "b", busyMin: 20 }], null)).toBe(40);
  });
  it("a named barber waits for their own line first, and for chairs they are not working at not at all", () => {
    const chairs = [{ staffId: "a", busyMin: 0 }, { staffId: "b", busyMin: 0 }];
    expect(estimateWaitMin([person(25, "a"), person(25, "a")], chairs, "a")).toBe(50);
    expect(estimateWaitMin([person(25, "a")], chairs, "b")).toBe(0);
    expect(estimateWaitMin([person(25)], chairs, "zzz")).toBeNull();
  });
  it("says it in words", () => {
    expect(waitText(null)).toBe("");
    expect(waitText(45)).toBe("about 45 min");
    expect(waitText(120)).toBe("about 2 h");
    expect(ordinalEn(1)).toBe("1st");
    expect(ordinalEn(12)).toBe("12th");
    expect(ordinalEn(23)).toBe("23rd");
  });
});

describe("beauty claims", () => {
  it("names the claim", () => {
    const c = checkBeautyClaims("Regrows your hair in a month");
    expect(c.ok).toBe(false);
    expect(c.term?.toLowerCase()).toContain("regrows");
  });
  it("lets product and price words through", () => {
    for (const t of ["Argan oil shampoo, 355 ml, $14.99", "Treat yourself to 20% off", "Colour restock this weekend", "Dandruff shampoo back in stock"]) expect(checkBeautyClaims(t).ok, t).toBe(true);
  });
});
