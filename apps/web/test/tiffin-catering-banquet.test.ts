import { describe, expect, it } from "vitest";
import type { restaurantApi } from "@ll/shared";
import { cleanItems, fromText, holdWord, nextAction, offeredMethods, toText, translated, until } from "@/lib/restaurant/tcb";

const NOW = Date.parse("2026-10-23T15:00:00Z");
const ev = (over: Partial<restaurantApi.CateringEventDto>) =>
  ({ status: "inquiry", lineItems: [], createdAt: "2026-10-23T12:00:00Z", quoteSentAt: null, quoteOpenedAt: null, approvedAt: null, depositPaidAt: null, depositMethod: null, depositReceivedOn: null, referenceCode: null, tastingAt: null, ...over }) as restaurantApi.CateringEventDto;

describe("menu grid cell text", () => {
  it("round-trips one dish per line, with words after ' - ' as the description", () => {
    const items = fromText("Dal tadka - made with toor dal\n  Rotli (4)  \n\nBhindi nu shaak", []);
    expect(items).toEqual([{ name: "Dal tadka", description: "made with toor dal" }, { name: "Rotli (4)", description: undefined }, { name: "Bhindi nu shaak", description: undefined }]);
    expect(cleanItems(items)[1]).toEqual({ name: "Rotli (4)" });
    expect(toText(cleanItems(items))).toBe("Dal tadka - made with toor dal\nRotli (4)\nBhindi nu shaak");
  });

  it("keeps dietary tags, translations and per-serving on a dish whose name did not change", () => {
    const prev = [{ name: "Rotli (4)", perServing: 4, dietary: { vegetarian: true }, translations: { hi: { name: "रोटली" } } }];
    const next = fromText("rotli (4)\nJalebi (2)", prev);
    expect(next[0]).toMatchObject({ name: "rotli (4)", perServing: 4, dietary: { vegetarian: true }, translations: { hi: { name: "रोटली" } } });
    expect(next[1]).toMatchObject({ name: "Jalebi (2)" });
    expect(next[1]!.perServing).toBeUndefined();
  });

  it("limits a cell to 30 dishes and long names to 120 characters", () => {
    expect(fromText(Array.from({ length: 40 }, (_, i) => `Dish ${i}`).join("\n"), [])).toHaveLength(30);
    expect(fromText("x".repeat(200), [])[0]!.name).toHaveLength(120);
  });

  it("counts a dish as translated only with Hindi, Urdu and Punjabi names", () => {
    expect(translated({ name: "Dal" })).toBe(false);
    expect(translated({ name: "Dal", translations: { hi: { name: "दाल" }, ur: { name: "دال" } } })).toBe(false);
    expect(translated({ name: "Dal", translations: { hi: { name: "दाल" }, ur: { name: "دال" }, pa: { name: "ਦਾਲ" } } })).toBe(true);
  });
});

describe("payment methods offered", () => {
  it("orders card, bank debit, e-transfer, cash and drops what the shop does not take", () => {
    expect(offeredMethods({ card: true, pad: true, etransfer: true, cash: true })).toEqual(["card", "pad", "etransfer", "cash"]);
    expect(offeredMethods({ card: false, pad: false, etransfer: true, cash: false })).toEqual(["etransfer"]);
    expect(offeredMethods({ card: false, pad: false, etransfer: false, cash: false })).toEqual([]);
  });
});

describe("catering card next action", () => {
  it("new inquiry is the one accent line; an old one says how long it has waited", () => {
    expect(nextAction(ev({}), NOW)).toEqual({ tone: "accent", text: "New: call back today" });
    expect(nextAction(ev({ createdAt: "2026-10-20T12:00:00Z" }), NOW)).toEqual({ tone: "accent", text: "Waiting 3 days: call back" });
    expect(nextAction(ev({ lineItems: [{ description: "x", quantity: 1, unitPriceCents: 1, totalCents: 1 }] }), NOW)?.tone).toBe("info");
  });

  it("a quote sent two days ago and never opened is called out; opened or approved quotes say what they wait for", () => {
    const sent = "2026-10-21T14:00:00Z";
    expect(nextAction(ev({ status: "quoted", quoteSentAt: sent }), NOW)).toEqual({ tone: "info", text: "Sent 2 days ago, not opened" });
    expect(nextAction(ev({ status: "quoted", quoteSentAt: "2026-10-23T10:00:00Z" }), NOW)?.text).toBe("Sent, waiting on the customer");
    expect(nextAction(ev({ status: "quoted", quoteSentAt: sent, quoteOpenedAt: "2026-10-21T15:00:00Z" }), NOW)?.text).toBe("Opened, waiting on the customer");
    expect(nextAction(ev({ status: "quoted", quoteSentAt: sent, approvedAt: sent, referenceCode: "AK-1004" }), NOW)?.text).toBe("Approved, deposit awaiting · AK-1004");
  });

  it("confirmed events show how the deposit came in; cancelled ones show nothing", () => {
    expect(nextAction(ev({ status: "confirmed", depositMethod: "etransfer", depositReceivedOn: "2026-10-19" }), NOW, (d) => `on ${d}`)?.text).toBe("Deposit in by e-transfer on 2026-10-19");
    expect(nextAction(ev({ status: "cancelled" }), NOW)).toBeNull();
  });
});

describe("countdown wording", () => {
  it("holds count in hours, then days", () => {
    expect(holdWord("2026-10-25T08:00:00Z", NOW)).toBe("Hold · 41 h");
    expect(holdWord("2026-10-28T15:00:00Z", NOW)).toBe("Hold · 5 d");
    expect(holdWord(null, NOW)).toBe("Hold");
    expect(holdWord("2026-10-20T00:00:00Z", NOW)).toBe("Hold · 0 h");
  });
  it("the cutoff chip reads hours and minutes, or days", () => {
    expect(until("2026-10-24T05:20:00Z", NOW)).toBe("14 h 20 m");
    expect(until("2026-10-26T18:00:00Z", NOW)).toBe("3 d 3 h");
    expect(until("2026-10-20T00:00:00Z", NOW)).toBe("0 h 0 m");
  });
});
