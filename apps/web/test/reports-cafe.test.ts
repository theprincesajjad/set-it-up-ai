import { describe, expect, it } from "vitest";
import type { reportsApi } from "@ll/shared";
import { HEAT_HOURS, cameBackShare, heatInk, heatLevel, heatTotal, joinersTitle, owedDetail, owedHeadline, visitsOutsideWindow } from "@/lib/dashboard/reports";

describe("heatmap shading", () => {
  it("scales to the busiest cell and never goes fully blank", () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(10, 10)).toBe(1);
    expect(heatLevel(5, 10)).toBe(0.5);
    expect(heatLevel(3, 0)).toBe(0);
    expect(heatInk(0, 10)).toBe(8);
    expect(heatInk(10, 10)).toBe(92);
    expect(heatInk(5, 10)).toBe(50);
  });
  it("counts visits outside 7 am to 6 pm so they are never hidden silently", () => {
    const m = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    m[0]![8] = 4;
    m[2]![6] = 2; // 6 am
    m[5]![19] = 1; // 7 pm
    expect(visitsOutsideWindow(m)).toBe(3);
    expect(heatTotal(m)).toBe(7);
    expect(HEAT_HOURS[0]).toBe(7);
    expect(HEAT_HOURS.at(-1)).toBe(18);
  });
});

const owed = (o: Partial<reportsApi.RewardsOwedReport> = {}): reportsApi.RewardsOwedReport => ({ rewardsOwed: 24, stampsOutstanding: 248, members: 39, rewardCostCents: 400, estCostCents: 9600, estimate: true, ...o });

describe("rewards owed", () => {
  it("says the number and always labels the dollars an estimate", () => {
    expect(owedHeadline(owed(), "free drink")).toBe("24 free drinks");
    expect(owedHeadline(owed({ rewardsOwed: 1 }), "free drink")).toBe("1 free drink");
    const text = owedDetail(owed(), "stamps", "free drink");
    expect(text).toBe("248 stamps held by 39 members. About $96 at cost, from your $4.00 cost per free drink (estimate; edit the cost in Rewards).");
    expect(text).toContain("estimate");
  });
  it("asks for the cost instead of guessing one", () => {
    const t = owedDetail(owed({ rewardCostCents: null, estCostCents: null }), "stamps", "free drink");
    expect(t).toContain("Add what a free drink costs you in Rewards");
    expect(t).not.toContain("$");
  });
});

describe("joiners who came back", () => {
  const j: reportsApi.JoinerReturnReport = { from: "2026-09-11T04:00:00Z", to: "2026-10-09T04:00:00Z", joined: 17, windows: [{ days: 7, cameBack: 9 }, { days: 14, cameBack: 11 }, { days: 30, cameBack: 12 }] };
  it("titles the cohort and gives the 14-day share", () => {
    expect(joinersTitle(j)).toBe("Joined Sep 11 to Oct 9: 17 members");
    const s = cameBackShare(j);
    expect(s.pct).toBe(65);
    expect(s.caption).toContain("(11 of 17)");
  });
  it("has no percentage with no joiners", () => {
    expect(cameBackShare({ ...j, joined: 0, windows: j.windows.map((w) => ({ ...w, cameBack: 0 })) }).pct).toBeNull();
  });
});
