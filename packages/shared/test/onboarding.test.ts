import { describe, expect, it } from "vitest";
import { ACTIVATION, VERTICALS, allPlaybooks, dueNudge, expectedMembers, nudgeText, paceFor, playbookFor, upsellMoment } from "../src/index.js";

describe("pace", () => {
  it("is a straight line to 25 in 30 days, and 12 by day 14 is on pace", () => {
    expect(expectedMembers(30)).toBe(25);
    expect(expectedMembers(14)).toBeCloseTo(11.67, 1);
    expect(paceFor({ day: 14, members: 12, activated: false })).toBe("on_track");
    expect(paceFor({ day: 14, members: 16, activated: false })).toBe("ahead");
    expect(paceFor({ day: 14, members: 7, activated: false })).toBe("behind");
  });
  it("does not call anyone behind in the first two days, and calls activation and lateness", () => {
    expect(paceFor({ day: 1, members: 0, activated: false })).toBe("on_track");
    expect(paceFor({ day: 1, members: 2, activated: false })).toBe("ahead");
    expect(paceFor({ day: 12, members: 25, activated: false })).toBe("activated");
    expect(paceFor({ day: 40, members: 20, activated: false })).toBe("late");
    expect(paceFor({ day: 40, members: 20, activated: true })).toBe("activated");
  });
});

describe("playbooks", () => {
  it("every vertical has a playbook with a till line and three tips", () => {
    for (const v of VERTICALS) {
      const p = playbookFor(v);
      expect(p.tillLine.length).toBeGreaterThan(5);
      expect(p.tips).toHaveLength(3);
    }
    expect(allPlaybooks().map((p) => p.key).sort()).toEqual(["cafe", "desi", "other", "pharmacy", "repair", "restaurant", "retail", "salon", "tiffin"]);
  });
  it("routes the new verticals and falls back for unknown ones", () => {
    expect(playbookFor("restaurant_south_asian").key).toBe("desi");
    expect(playbookFor("tiffin").key).toBe("tiffin");
    expect(playbookFor("bakery").key).toBe("cafe");
    expect(playbookFor("nope").key).toBe("other");
    expect(playbookFor(null).key).toBe("other");
  });
  it("pharmacy copy keeps prescriptions out of points", () => {
    expect(playbookFor("pharmacy").tips[0]).toMatch(/Prescriptions/);
  });
});

describe("upsell timing", () => {
  const base = { vertical: "restaurant", members: 0, firstStamp: true, activated: false, pace: "on_track" as const, paying: false, dismissedRecently: false };
  it("never before the first stamp, never to payers, never right after Not now", () => {
    expect(upsellMoment({ ...base, firstStamp: false, activated: true }).moment).toBe("none");
    expect(upsellMoment({ ...base, activated: true, paying: true }).moment).toBe("none");
    expect(upsellMoment({ ...base, activated: true, dismissedRecently: true }).moment).toBe("none");
  });
  it("restaurants get a preview at 10 members while on pace, and the offer once active", () => {
    expect(upsellMoment({ ...base, members: 9 }).moment).toBe("none");
    expect(upsellMoment({ ...base, members: 10 }).moment).toBe("preview");
    expect(upsellMoment({ ...base, members: 10, pace: "behind" }).moment).toBe("none");
    const o = upsellMoment({ ...base, members: 25, activated: true, foundingSpotsLeft: 14 });
    expect(o.moment).toBe("offer");
    expect(o.plan).toBe("restaurant_starter");
    expect(o.priceLine).toContain("$99");
    expect(o.foundingLine).toContain("14 of 20 spots left");
  });
  it("cafés and repair shops see only the offer, with their own plan", () => {
    expect(upsellMoment({ ...base, vertical: "cafe", members: 12 }).moment).toBe("none");
    const c = upsellMoment({ ...base, vertical: "cafe", activated: true });
    expect(c.plan).toBe("plus");
    expect(c.foundingLine).toBeNull();
    expect(upsellMoment({ ...base, vertical: "repair_auto", activated: true }).plan).toBe("pro");
    expect(upsellMoment({ ...base, vertical: "tiffin", activated: true }).plan).toBe("restaurant_growth");
  });
});

describe("nudges", () => {
  const none = new Set<string>();
  it("follows the schedule and the shop's numbers", () => {
    expect(dueNudge({ hoursSinceSignup: 10, members: 0, firstStamp: false, sent: none })).toBeNull();
    expect(dueNudge({ hoursSinceSignup: 25, members: 0, firstStamp: false, sent: none })).toBe("nudge_d1");
    expect(dueNudge({ hoursSinceSignup: 25, members: 2, firstStamp: true, sent: none })).toBeNull();
    expect(dueNudge({ hoursSinceSignup: 80, members: 2, firstStamp: true, sent: none })).toBe("nudge_d3");
    expect(dueNudge({ hoursSinceSignup: 80, members: 9, firstStamp: true, sent: none })).toBeNull();
    expect(dueNudge({ hoursSinceSignup: 24 * 15, members: 8, firstStamp: true, sent: new Set(["nudge_d14"]) })).toBe("nudge_d7");
    expect(dueNudge({ hoursSinceSignup: 24 * 26, members: 24, firstStamp: true, sent: none })).toBe("nudge_d25");
    expect(dueNudge({ hoursSinceSignup: 24 * 26, members: 25, firstStamp: true, sent: none })).toBeNull();
  });
  it("texts carry the numbers and stay short enough for one or two SMS segments", () => {
    const a = { shopName: "Sunrise Bakery", members: 6, daysLeft: 5, target: ACTIVATION.target, tillLine: "Want a stamp on that today?", url: "https://example.ca/m/1/setup" };
    for (const k of ["nudge_d1", "nudge_d3", "nudge_d7", "nudge_d14", "nudge_d25"] as const) {
      const t = nudgeText(k, a);
      expect(t.body.length).toBeLessThan(260);
    }
    expect(nudgeText("nudge_d25", a).subject).toBe("5 days left to reach 25");
    expect(nudgeText("nudge_d7", a).body).toContain("19 to go");
  });
});
