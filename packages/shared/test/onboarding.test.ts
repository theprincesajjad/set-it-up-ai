import { describe, expect, it } from "vitest";
import { ACTIVATION, VERTICALS, activationFor, allPlaybooks, tradeSetupFor, dueNudge, expectedMembers, nudgeText, paceFor, playbookFor, upsellMoment } from "../src/index.js";

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
    expect(allPlaybooks().map((p) => p.key).sort()).toEqual(["cafe", "desi", "events", "other", "pharmacy", "repair", "restaurant", "retail", "salon", "tiffin"]);
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
  it("English is word for word what owners got before the texts were translated", () => {
    const a = { shopName: "Sunrise Bakery", members: 6, daysLeft: 5, target: 25, tillLine: "Want a stamp on that today?", url: "https://example.ca/m/1/setup" };
    expect(nudgeText("nudge_d1", a)).toEqual({ subject: "Give your first stamp at Sunrise Bakery", body: "Sunrise Bakery is set up but nobody has been stamped yet. It takes three minutes: scan your own QR, then add a stamp. https://example.ca/m/1/setup" });
    expect(nudgeText("nudge_d3", a)).toEqual({ subject: "6 on the card so far", body: 'Sunrise Bakery: 6 members so far. Try saying this at the till today: "Want a stamp on that today?" https://example.ca/m/1/setup' });
    expect(nudgeText("nudge_d3", { ...a, members: 1 }).body).toContain("1 member so far");
    expect(nudgeText("nudge_d7", a)).toEqual({ subject: "A week in: 6 members", body: "Sunrise Bakery has 6 members after a week. Shops that reach 12 by day 14 almost always reach 25. 19 to go. https://example.ca/m/1/setup" });
    expect(nudgeText("nudge_d14", a)).toEqual({ subject: "Two weeks in: 6 members", body: "Sunrise Bakery has 6 members at day 14, a little behind. We will call you this week to help you get the next few. https://example.ca/m/1/setup" });
    expect(nudgeText("nudge_d25", a)).toEqual({ subject: "5 days left to reach 25", body: "Sunrise Bakery is 19 members from active. 5 days left in your first 30. https://example.ca/m/1/setup" });
  });
  it("is written in the owner's language, with the shop, the numbers and the link intact", () => {
    const a = { shopName: "Sarson Dhaba", members: 6, daysLeft: 5, target: 25, tillLine: "Want a stamp on that today?", url: "https://example.ca/m/1/setup" };
    for (const locale of ["hi", "ur", "pa"] as const) {
      for (const k of ["nudge_d1", "nudge_d3", "nudge_d7", "nudge_d14", "nudge_d25"] as const) {
        const t = nudgeText(k, a, locale);
        expect(t.subject.replace("Sarson Dhaba", ""), `${locale} ${k}`).not.toMatch(/[A-Za-z]{4,}/);
        expect(t.body, `${locale} ${k}`).toContain("https://example.ca/m/1/setup");
        expect(t.body, `${locale} ${k}`).toContain("Sarson Dhaba");
        expect(t.body, `${locale} ${k}`).not.toContain("{");
        expect(t.body.length, `${locale} ${k}`).toBeLessThan(420);
        expect(t.body).not.toBe(nudgeText(k, a).body);
      }
    }
    expect(nudgeText("nudge_d25", a, "hi").subject).toContain("25");
    expect(nudgeText("nudge_d25", a, "hi").subject).toContain("5");
  });
});

describe("trade-aware setup and activation", () => {
  it("gives slow trades 10 in 60 days and daily trades 25 in 30", () => {
    expect(activationFor("florist")).toEqual({ target: 10, windowDays: 60, leadingMembers: 5, leadingByDay: 30, slow: true });
    for (const v of ["retail", "bookstore", "other", "repair_auto", "caterer"]) expect(activationFor(v).slow, v).toBe(true);
    for (const v of ["cafe", "restaurant", "salon", "fitness", "pharmacy", "grocery"]) expect(activationFor(v), v).toMatchObject({ target: 25, windowDays: 30, slow: false });
    expect(activationFor("florist", 3).target).toBe(3);
  });
  it("names each trade's first setup step", () => {
    expect(tradeSetupFor("tiffin")).toBe("menu");
    expect(tradeSetupFor("caterer")).toBe("menu");
    expect(tradeSetupFor("banquet_hall")).toBe("menu");
    expect(tradeSetupFor("salon")).toBe("services");
    expect(tradeSetupFor("repair_electronics")).toBe("services");
    expect(tradeSetupFor("fitness")).toBe("classes");
    expect(tradeSetupFor("grocery")).toBe("catalog");
    expect(tradeSetupFor("cafe")).toBeNull();
    expect(tradeSetupFor("pharmacy")).toBeNull();
  });
});
