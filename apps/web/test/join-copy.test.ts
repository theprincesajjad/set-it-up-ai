import { describe, expect, it } from "vitest";
import { alsoEarning, joinHeadline, joinIntro, pickVaried, streetName } from "@/lib/joinCopy";

const stamps = { earnType: "stamps" as const, terminology: "stamps", welcomeBonus: 1, stampGoal: 10 };

describe("join copy", () => {
  it("headline", () => {
    expect(joinHeadline(stamps, "cafe")).toBe("get a stamp for today’s coffee");
    expect(joinHeadline({ ...stamps, earnType: "per_dollar", terminology: "points", welcomeBonus: 50 }, "grocery")).toBe("get 50 points for today’s shop");
    // A pharmacy never says "today's visit" and never offers points for joining.
    expect(joinHeadline({ ...stamps, earnType: "per_dollar", terminology: "points", welcomeBonus: 50 }, "pharmacy")).toBe("start earning on front-store purchases");
    expect(joinHeadline(null, "pharmacy")).toBe("start earning on front-store purchases");
    expect(joinHeadline({ ...stamps, welcomeBonus: 0 }, "other")).toBe("start earning on today’s visit");
  });
  it("intro", () => {
    expect(joinIntro(stamps, { name: "Free drink", pointsCost: 10 }, { name: "Roncesvalles", shopCount: 16 })).toBe("10 stamps = a free drink. Your card works at 16 shops on Roncesvalles. No app needed.");
    expect(joinIntro(null, null, null)).toBe("No app needed.");
  });
  it("street name", () => expect(streetName("Roncesvalles Village")).toBe("Roncesvalles"));
  it("also earning", () => {
    expect(alsoEarning([{ vertical: "bakery" }, { vertical: "salon" }, { vertical: "repair_electronics" }], 15)).toBe("Also earning here: the bakery, the salon, the phone repair and 12 more.");
    expect(alsoEarning([{ vertical: "bakery" }, { vertical: "salon" }], 2)).toBe("Also earning here: the bakery and the salon.");
    expect(alsoEarning([], 0)).toBeNull();
  });
  it("pick varied", () => {
    const s = (id: string, vertical: string) => ({ merchant: { id, vertical } });
    expect(pickVaried([s("me", "cafe"), s("a", "bakery"), s("b", "bakery"), s("c", "salon"), s("d", "florist"), s("e", "pet")], "me").map((x) => x.merchant.id)).toEqual(["a", "c", "d"]);
  });
});
