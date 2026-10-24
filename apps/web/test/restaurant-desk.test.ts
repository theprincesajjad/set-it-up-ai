import { describe, expect, it } from "vitest";
import { cancelRuleInWords, capsInWords, channelMix, depositInWords, noticeInWords } from "@/lib/restaurant/preorders";
import { chatStatus, initials, languageLabel, windowHoursLeft } from "@/lib/restaurant/inbox";
import { chipOf, splitLine } from "@/lib/restaurant/orders";

describe("pre-order words", () => {
  it("groups neighbouring days with the same cap", () => {
    expect(capsInWords({ preorderDailyCap: 12, capByWeekday: { fri: 20, sat: 20, sun: 25 } })).toBe("Mon to Thu 12 · Fri, Sat 20 · Sun 25");
    expect(capsInWords({ preorderDailyCap: null, capByWeekday: {} })).toBe("No daily limit");
    expect(capsInWords({ preorderDailyCap: 8, capByWeekday: {} })).toBe("Every day 8");
  });
  it("states notice and deposit plainly", () => {
    expect(noticeInWords([{ name: "Chicken degh", leadTimeHours: 24 }, { name: "Goat degh", leadTimeHours: 48 }])).toBe("Chicken 24 h · Goat 48 h");
    expect(depositInWords([{ depositBps: 3000 }])).toBe("30%, balance at pickup");
    expect(depositInWords([{ depositBps: 0 }])).toBe("No deposit");
  });
  it("counts channels, biggest first", () => {
    expect(channelMix([{ channel: "phone" }, { channel: "web" }, { channel: "web" }])).toBe("2 web link, 1 phone");
  });
});

describe("inbox words", () => {
  it("names what a chat is waiting on", () => {
    expect(chatStatus({ state: "awaiting_payment", cartItems: 0, takenOver: false }).label).toBe("Awaiting payment");
    expect(chatStatus({ state: "cart", cartItems: 2, takenOver: false }).label).toBe("Cart · 2 items");
    expect(chatStatus({ state: "cart", cartItems: 2, takenOver: true }).label).toBe("You have this chat");
  });
  it("makes initials, language names and the reply window", () => {
    expect(initials("Hira Siddiqui", "+1647")).toBe("HS");
    expect(initials(null, "+16475550100")).toBe("+1");
    expect(languageLabel("ur")).toBe("Urdu");
    const now = Date.parse("2026-11-03T12:00:00Z");
    expect(windowHoursLeft("2026-11-03T20:30:00Z", now)).toBe(8);
    expect(windowHoursLeft("2026-11-03T11:00:00Z", now)).toBe(0);
  });
});

describe("orders words", () => {
  it("files an order under its chip", () => {
    expect(chipOf({ status: "pending" })).toBe("new");
    expect(chipOf({ status: "preparing" })).toBe("cooking");
    expect(chipOf({ status: "picked_up" })).toBeNull();
  });
  it("says how a bill was split", () => {
    expect(splitLine([{ label: "Asif", tender: "card", status: "open" }, { label: "Sana", tender: "cash", status: "paid" }] as never)).toBe("Split two ways: Asif card, Sana cash (paid)");
  });
});

describe("cancel rule in words", () => {
  it("names the hours, free-until-pickup, or the dish's own notice", () => {
    expect(cancelRuleInWords(12)).toBe("Free until 12 hours before pickup, then the deposit stays");
    expect(cancelRuleInWords(1)).toBe("Free until 1 hour before pickup, then the deposit stays");
    expect(cancelRuleInWords(0)).toBe("Free until pickup");
    expect(cancelRuleInWords(null)).toBe("Free until each dish's notice period before pickup");
  });
});
