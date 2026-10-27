import { describe, expect, it } from "vitest";
import { poundsLabel, punchCircles, shortDate, stayTag, vaccineTag, weeksLabel, worstTag } from "@/lib/dashboard/pets";

describe("pet display helpers", () => {
  it("tags vaccines by status and days left", () => {
    expect(vaccineTag({ status: "current", daysLeft: 300 })).toEqual({ label: "Current", tone: "positive" });
    expect(vaccineTag({ status: "expiring", daysLeft: 24 })).toEqual({ label: "Expires in 24 days", tone: "accent" });
    expect(vaccineTag({ status: "expiring", daysLeft: 1 }).label).toBe("Expires in 1 day");
    expect(vaccineTag({ status: "expiring", daysLeft: 0 }).label).toBe("Expires today");
    expect(vaccineTag({ status: "expired", daysLeft: -3 })).toEqual({ label: "Expired", tone: "negative" });
    expect(worstTag("none").label).toBe("No shots on file");
    expect(worstTag("expired").tone).toBe("negative");
  });
  it("formats weeks, dates and bag sizes", () => {
    expect(weeksLabel(1)).toBe("1 week");
    expect(weeksLabel(6)).toBe("6 weeks");
    expect(shortDate("2026-11-17")).toBe("Nov 17");
    expect(shortDate(null)).toBe("");
    expect(poundsLabel(11_800)).toBe("26 lb");
  });
  it("draws the punch circles", () => {
    expect(punchCircles(3, 5)).toEqual([true, true, true, false, false]);
    expect(punchCircles(0, 2)).toEqual([false, false]);
  });
  it("names the state of a stay", () => {
    expect(stayTag({ status: "in", blocks: [], checkInAt: null }).label).toBe("In the room");
    expect(stayTag({ status: "expected", blocks: [], checkInAt: null }).label).toBe("Expected");
    expect(stayTag({ status: "expected", blocks: [{ code: "vaccine", message: "x" }], checkInAt: null })).toEqual({ label: "Blocked", tone: "negative" });
    expect(stayTag({ status: "no_show", blocks: [], checkInAt: null }).tone).toBe("negative");
  });
});
