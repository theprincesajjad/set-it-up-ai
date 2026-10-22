import { describe, expect, it } from "vitest";
import { capSponsored, feedA11yLabel } from "./feed";

const o = (id: number) => ({ sponsored: false as const, id });
const s = (id: number) => ({ sponsored: true as const, id });

describe("capSponsored", () => {
  it("never puts a sponsored item first", () => {
    expect(capSponsored([s(1), o(2), o(3)]).map((x) => x.id)).toEqual([2, 3]);
  });
  it("allows at most 1 sponsored per 5 items", () => {
    const res = capSponsored([o(1), s(2), o(3), s(4), o(5), o(6), o(7), o(8), s(9), o(10)]);
    expect(res.map((x) => x.id)).toEqual([1, 2, 3, 5, 6, 7, 8, 9, 10]);
  });
  it("keeps organic order untouched", () => {
    expect(capSponsored([o(1), o(2), o(3)]).map((x) => x.id)).toEqual([1, 2, 3]);
  });
  it("labels sponsored cards for screen readers", () => {
    expect(feedA11yLabel({ sponsored: true, shopName: "Roncy Cafe", title: "2x points" })).toBe("Sponsored. Roncy Cafe. 2x points");
  });
});

import { activityTitle, groupByDay } from "./activity";

describe("activity", () => {
  it("titles by ledger type", () => {
    expect(activityTitle({ type: "earn", points: 12, description: null }, "points")).toBe("Earned 12 pts");
    expect(activityTitle({ type: "earn", points: 1, description: null }, "stamps")).toBe("Got a stamp");
    expect(activityTitle({ type: "campaign_bonus", points: 25, description: null }, "points")).toBe("Passport bonus");
    expect(activityTitle({ type: "adjust", points: -5, description: null }, "points", "Roncy Cafe")).toBe("Adjusted by Roncy Cafe");
  });
  it("groups by day", () => {
    const now = new Date(2026, 9, 21, 12);
    const g = groupByDay(
      [
        { createdAt: new Date(2026, 9, 21, 9).toISOString() },
        { createdAt: new Date(2026, 9, 20, 9).toISOString() },
        { createdAt: new Date(2026, 9, 19, 9).toISOString() },
      ],
      now,
    );
    expect(g.map((x) => x.label)).toEqual(["Today", "Yesterday", "Mon, Oct 19"]);
  });
});
