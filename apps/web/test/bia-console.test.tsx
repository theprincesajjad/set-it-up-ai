import { describe, expect, it } from "vitest";
import { campaignsApi } from "@ll/shared";
import { overviewStats } from "@/components/dashboard/bia/Overview";
import { gateRows, unlockStatus } from "@/components/dashboard/bia/UnlockPanel";
import { shopStatus, sortShops } from "@/components/dashboard/bia/ShopsTable";
import { campaignResultText } from "@/components/dashboard/bia/CampaignsPanel";
import { quarters, torontoMidnight, comparisonLine, periodQuery, ROLLING } from "@/lib/dashboard/biaPeriods";

const gates = (over: Partial<campaignsApi.NeighbourhoodOverview["gates"]> = {}): campaignsApi.NeighbourhoodOverview["gates"] => ({
  liveMonths: 14,
  activeShops: 31,
  activeCustomers: 1284,
  multiShopPct: 27,
  thresholds: { ...campaignsApi.UNLOCK_PER_NEIGHBOURHOOD },
  ...over,
});

describe("campaigns unlock gates", () => {
  it("lists the four thresholds with current values and counts what is left", () => {
    const rows = gateRows(gates());
    expect(rows.map((r) => [r.label, r.text, r.met])).toEqual([
      ["Live for 6 months", "14 months", true],
      ["20 active shops", "31", true],
      ["1,500 active shoppers", "1,284 · 86%", false],
      ["25% shop at 2 or more", "27%", true],
    ]);
    expect(unlockStatus(rows)).toEqual({ ready: false, toGo: 1, label: "1 to go" });
  });
  it("reads Ready, with no 'to go', once every gate passes", () => {
    const s = unlockStatus(gateRows(gates({ activeCustomers: 1500 })));
    expect(s).toEqual({ ready: true, toGo: 0, label: "Ready" });
    expect(s.label).not.toMatch(/to go/);
  });
});

describe("overview stats", () => {
  const o = {
    shops: { live: 31, members: 74, joinedInPeriod: 4 },
    activeMembers: { value: 1284, delta: 112 },
    multiShopPct: { value: 27, deltaPoints: 3 },
    visits: { value: 5912, deltaPct: 8 },
  } as campaignsApi.NeighbourhoodOverview;
  it("shows real deltas against the period before", () => {
    const s = overviewStats(o, "vs prior 30 days");
    expect(s.map((x) => x.value)).toEqual(["31", "1,284", "27%", "5,912"]);
    expect(s[0]!.caption).toBe("of 74 members · 4 joined in this period");
    expect(s[1]!.delta).toMatchObject({ text: "+112", good: true, context: "vs prior 30 days" });
    expect(s[2]!.delta).toMatchObject({ text: "+3 points", good: true });
    expect(s[3]!.delta).toMatchObject({ text: "+8%", good: true });
  });
  it("leaves out 'of N members' until the BIA's member count is entered, and says so when there is no prior period", () => {
    const s = overviewStats({ ...o, shops: { ...o.shops, members: null }, visits: { value: 10, deltaPct: null } }, "vs prior 30 days");
    expect(s[0]!.caption).toBe("4 joined in this period");
    expect(s[3]!.delta).toMatchObject({ text: "No prior period", good: null });
  });
});

describe("shops table", () => {
  const row = (name: string, activated: boolean, visits: number, status: campaignsApi.NeighbourhoodShopRow["status"] = "active") => ({ id: name, name, activated, visits, newMembers: 0, status });
  it("words the status and puts shops that need a rep first", () => {
    expect(shopStatus(row("a", true, 1))).toEqual({ label: "Activated", tone: "positive" });
    expect(shopStatus(row("b", false, 0, "onboarding"))).toEqual({ label: "Onboarding", tone: "neutral" });
    const sorted = sortShops([row("a", true, 400), row("b", false, 0, "onboarding"), row("c", true, 900), row("d", false, 0, "onboarding")], true);
    expect(sorted.map((r) => r.name)).toEqual(["b", "d", "c", "a"]);
    expect(sortShops([row("a", true, 400), row("c", true, 900)], false).map((r) => r.name)).toEqual(["c", "a"]);
  });
});

describe("campaign rows", () => {
  const c = (over: Partial<campaignsApi.Campaign>): campaignsApi.Campaign => ({ id: "1", neighbourhoodId: "n", name: "x", description: null, kind: "points_weekend", status: "draft", startsAt: "", endsAt: "", goalVisits: 3, bonusPoints: 0, multiplierPct: null, prize: null, priceCents: 150_000, paid: false, paidAt: null, merchants: [], drawnAt: null, createdAt: "", ...over });
  it("says what is missing before a campaign runs and what happened after", () => {
    expect(campaignResultText(c({}), null)).toBe("Add shops to schedule");
    expect(campaignResultText(c({ merchants: [{ id: "m", name: "m", slug: "m", logoUrl: null }] }), null)).toBe("Pay to schedule");
    expect(campaignResultText(c({ status: "scheduled", paid: true }), null)).toBe("Bronze · $1,500 · paid");
    expect(campaignResultText(c({ status: "live" }), { participants: 412, completions: 96 } as campaignsApi.CampaignReport)).toBe("412 took part · 96 completed");
  });
});

describe("report periods", () => {
  it("uses Toronto calendar quarters with the right UTC offset", () => {
    expect(torontoMidnight(2026, 9, 1).toISOString()).toBe("2026-10-01T04:00:00.000Z"); // EDT
    expect(torontoMidnight(2027, 0, 1).toISOString()).toBe("2027-01-01T05:00:00.000Z"); // EST
    const q = quarters(new Date("2026-10-23T15:00:00Z"), 4);
    expect(q.map((p) => p.label)).toEqual(["Q4 2026", "Q3 2026", "Q2 2026", "Q1 2026"]);
    expect(q[0]).toMatchObject({ from: "2026-10-01T04:00:00.000Z", to: "2027-01-01T05:00:00.000Z" });
    expect(q[1]!.to).toBe(q[0]!.from);
    expect(quarters(new Date("2027-01-05T15:00:00Z"), 2).map((p) => p.label)).toEqual(["Q1 2027", "Q4 2026"]);
  });
  it("leaves rolling windows to the API default", () => {
    expect(periodQuery(ROLLING[0]!)).toEqual({});
    expect(comparisonLine(ROLLING[0]!)).toBe("Last 30 days compared with the 30 before.");
    expect(periodQuery(quarters(new Date("2026-10-23T15:00:00Z"), 1)[0]!)).toEqual({ from: "2026-10-01T04:00:00.000Z", to: "2027-01-01T05:00:00.000Z" });
  });
});
