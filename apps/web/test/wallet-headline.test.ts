import { describe, expect, it } from "vitest";
import { walletHeadline } from "@/lib/walletSummary";

const m = (name: string, terminology: string, balance: number, ready: number, next: { name: string; needed: number; pct: number } | null) => ({
  merchant: { name },
  terminology,
  balance,
  rewardsAvailableCount: ready,
  nextReward: next ? { rewardId: name, name: next.name, pointsCost: balance + next.needed, pointsNeeded: next.needed, progressPct: next.pct } : null,
});

describe("walletHeadline (never sums points and stamps)", () => {
  it("leads with rewards ready across all shops", () => {
    const h = walletHeadline([m("Pinecone", "stamps", 9, 1, null), m("Fix-It", "points", 480, 2, null), m("Books", "points", 3, 0, null), m("Deli", "stamps", 2, 0, null)]);
    expect(h).toMatchObject({ kind: "ready", value: 3, label: "rewards ready", context: "across 4 shops" });
  });

  it("shows the closest reward when none are ready", () => {
    const h = walletHeadline([m("Pinecone", "stamps", 8, 0, { name: "Free drink", needed: 2, pct: 80 }), m("Fix-It", "points", 120, 0, { name: "$5 off", needed: 30, pct: 75 })]);
    expect(h).toMatchObject({ kind: "closest", value: 2, label: "stamps to a free drink at Pinecone", shortLabel: "stamps to a free drink", context: "across 2 shops" });
    expect(walletHeadline([m("Fix-It", "points", 49, 0, { name: "$5 off", needed: 1, pct: 98 })]).label).toBe("point to $5 off at Fix-It");
  });

  it("falls back to zero rewards ready", () => {
    expect(walletHeadline([])).toMatchObject({ kind: "none", value: 0, context: "across 0 shops" });
  });
});
