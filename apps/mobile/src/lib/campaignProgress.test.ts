import { describe, expect, it } from "vitest";
import { clampCampaign } from "./campaignProgress";

const p = (visited: number, goal: number) => ({ progress: { visitedMerchantIds: [], visited, goal, completedAt: null, enteredInDraw: false } });

describe("clampCampaign", () => {
  it("caps visits at the goal", () => expect(clampCampaign(p(4, 3)).progress.visited).toBe(3));
  it("keeps progress under the goal as is", () => {
    const c = p(2, 5);
    expect(clampCampaign(c)).toBe(c);
  });
  it("never goes below zero", () => expect(clampCampaign(p(-1, 3)).progress.visited).toBe(0));
});
