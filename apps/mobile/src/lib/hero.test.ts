import { describe, expect, it } from "vitest";
import { heroText, homeHero, rewardPhrase, rewardsReadyCount } from "./hero";

type Next = { name: string; cost: number; needed: number } | null;
const m = (name: string, terminology: string, ready: number, next: Next = null) => ({
  id: `mem-${name}`,
  merchant: { id: name, slug: name.toLowerCase().replace(/\W+/g, "-"), name, vertical: "cafe", logoUrl: null, brandColor: null, neighbourhoodId: null },
  terminology,
  rewardsAvailableCount: ready,
  nextReward: next ? { rewardId: `r-${name}`, name: next.name, pointsCost: next.cost, pointsNeeded: next.needed, progressPct: Math.round(((next.cost - next.needed) / next.cost) * 100) } : null,
});

describe("homeHero", () => {
  it("is empty with no shops", () => {
    expect(homeHero([])).toEqual({ kind: "empty" });
  });

  it("counts rewards ready, not points + stamps", () => {
    const h = homeHero([m("Nonna's Table", "points", 2), m("Pinecone Coffee Co.", "stamps", 1), m("Village Green Grocer", "points", 0, { name: "$5 off", cost: 500, needed: 300 }), m("Copper Kettle", "stamps", 0)]);
    expect(h).toEqual({ kind: "ready", count: 3, shopCount: 2, shopName: null });
    expect(heroText(h as Exclude<typeof h, { kind: "empty" }>)).toMatchObject({ big: "3", line: "rewards ready", chip: "across 2 shops" });
  });

  it("names the shop when only one has a reward ready", () => {
    const h = homeHero([m("Pinecone Coffee Co.", "stamps", 1), m("Nonna's Table", "points", 0)]);
    expect(h).toMatchObject({ kind: "ready", count: 1, shopName: "Pinecone Coffee Co." });
    expect(heroText(h as Exclude<typeof h, { kind: "empty" }>)).toMatchObject({ big: "1", line: "reward ready", chip: "at Pinecone Coffee Co." });
  });

  it("shows the closest reward by % progress when none are ready, in that shop's unit", () => {
    // 1,800 / 2,000 pts (90%) beats 8 / 10 stamps (80%), even though 200 to go is a bigger raw number than 2.
    const h = homeHero([
      m("Pinecone Coffee Co.", "stamps", 0, { name: "Free drink", cost: 10, needed: 2 }),
      m("Nonna's Table", "points", 0, { name: "Free appetizer", cost: 2000, needed: 200 }),
    ]);
    expect(h).toMatchObject({ kind: "progress", toGo: 200, unit: "points", shopName: "Nonna's Table", value: 1800, max: 2000 });
  });

  it("phrases stamp progress the way the hero shows it", () => {
    const h = homeHero([
      m("Pinecone Coffee Co.", "stamps", 0, { name: "Free drink", cost: 10, needed: 2 }),
      m("Nonna's Table", "points", 0, { name: "Free appetizer", cost: 250, needed: 200 }),
    ]);
    expect(h).toMatchObject({ kind: "progress", toGo: 2, unit: "stamps" });
    expect(heroText(h as Exclude<typeof h, { kind: "empty" }>)).toEqual({
      big: "2",
      line: "stamps to a free drink",
      chip: "at Pinecone Coffee Co.",
      label: "2 stamps to a free drink at Pinecone Coffee Co.",
    });
  });

  it("uses the singular unit and grouped digits", () => {
    const one = homeHero([m("Pinecone Coffee Co.", "stamps", 0, { name: "Free drink", cost: 10, needed: 1 })]);
    expect(one).toMatchObject({ unit: "stamp" });
    const big = homeHero([m("Bike Shop", "points", 0, { name: "Tune-up", cost: 5000, needed: 1200 })]);
    expect(heroText(big as Exclude<typeof big, { kind: "empty" }>).big).toBe("1,200");
  });

  it("breaks progress ties by fewer to go", () => {
    const h = homeHero([m("A", "points", 0, { name: "X", cost: 100, needed: 50 }), m("B", "stamps", 0, { name: "Y", cost: 10, needed: 5 })]);
    expect(h).toMatchObject({ kind: "progress", shopName: "B", toGo: 5 });
  });

  it("falls back to the shop count when there is nothing to work toward", () => {
    const h = homeHero([m("A", "points", 0), m("B", "stamps", 0)]);
    expect(h).toEqual({ kind: "shops", count: 2 });
    expect(heroText(h as Exclude<typeof h, { kind: "empty" }>)).toMatchObject({ big: "2", line: "shops on your card" });
  });
});

describe("rewardPhrase / rewardsReadyCount", () => {
  it("adds an article only to 'Free …' names", () => {
    expect(rewardPhrase("Free drink")).toBe("a free drink");
    expect(rewardPhrase("$5 off")).toBe("$5 off");
  });
  it("sums reward counts, ignoring bad negatives", () => {
    expect(rewardsReadyCount([{ rewardsAvailableCount: 2 }, { rewardsAvailableCount: 0 }, { rewardsAvailableCount: -1 }, { rewardsAvailableCount: 1 }])).toBe(3);
  });
});
