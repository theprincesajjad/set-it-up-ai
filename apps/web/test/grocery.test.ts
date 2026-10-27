import { describe, expect, it } from "vitest";
import type { FeatureKey } from "@ll/shared";
import { buildMerchantNav, canOpen } from "@/lib/dashboard/nav";
import { BUTCHER_STATUS, dealDates, dealPerUnitLine, dealPriceLabel, daysWords, deltaWords, intervalWords, priceToCents, restockEveryWeeks, restockWindows, rewardCostLine, seasonFlyerLine, weighPreview, weightToGrams } from "@/lib/grocery";

describe("deal words", () => {
  it("prices a pack, a kg and a lb", () => {
    expect(dealPriceLabel({ priceCents: 2199, priceUnit: "each" })).toBe("$21.99");
    expect(dealPriceLabel({ priceCents: 1399, priceUnit: "kg" })).toBe("$13.99/kg");
    expect(dealPriceLabel({ priceCents: 399, priceUnit: "lb" })).toBe("$3.99/lb");
  });
  it("shows a price per 100 g only when it can be worked out", () => {
    expect(dealPerUnitLine({ per100gCents: 137.4375 })).toBe("$1.37/100 g");
    expect(dealPerUnitLine({ per100gCents: null })).toBeNull();
  });
  it("writes dates and days in plain words", () => {
    expect(dealDates("2026-11-02", "2026-11-08")).toBe("Nov 2 to Nov 8");
    expect(dealDates("2026-11-02", "2026-11-02")).toBe("Nov 2");
    expect(daysWords(0)).toBe("today");
    expect(daysWords(1)).toBe("tomorrow");
    expect(daysWords(3)).toBe("in 3 days");
    expect(daysWords(-2)).toBe("2 days ago");
  });
  it("tells a season card what to do now", () => {
    expect(seasonFlyerLine({ flyerDue: true, flyerFrom: "2026-10-18", daysUntil: 3, qurbani: false, bookingsOpen: null })).toBe("Put the stock-up flyer out now");
    expect(seasonFlyerLine({ flyerDue: false, flyerFrom: "2026-10-18", daysUntil: 20, qurbani: false, bookingsOpen: null })).toBe("Flyer from Oct 18");
    expect(seasonFlyerLine({ flyerDue: false, flyerFrom: "2027-05-02", daysUntil: 200, qurbani: true, bookingsOpen: "2027-03-21" })).toBe("Open bookings on Mar 21");
    expect(seasonFlyerLine({ flyerDue: true, flyerFrom: "2027-05-02", daysUntil: 20, qurbani: true, bookingsOpen: "2027-03-21" })).toBe("Bookings should be open: set animals per day");
  });
});

describe("weigh-in", () => {
  it("reads dollars and grams the way a cashier types them", () => {
    expect(priceToCents("13.99")).toBe(1399);
    expect(priceToCents("$ 0")).toBeNull();
    expect(priceToCents("")).toBeNull();
    expect(weightToGrams("2.14", "kg")).toBe(2140);
    expect(weightToGrams("5", "lb")).toBe(2268);
    expect(weightToGrams("0", "kg")).toBeNull();
    expect(weightToGrams("400", "kg")).toBeNull();
  });
  it("previews the line price and how far it is from the estimate", () => {
    const p = weighPreview(1399, "kg", 2140, 2798);
    expect(p).toEqual({ lineCents: 2994, deltaCents: 196, weightText: "2.14 kg" });
    expect(deltaWords(196)).toBe("$1.96 over the estimate");
    expect(deltaWords(-50)).toBe("$0.50 under the estimate");
    expect(deltaWords(0)).toBe("same as the estimate");
  });
});

describe("reward cost and pantry words", () => {
  it("says what a reward costs as a share of spend", () => {
    expect(rewardCostLine(1, 1000, 500)).toBe("Giving back 0.5% of what members spend");
    expect(rewardCostLine(1, 500, 500)).toBe("Giving back 1% of what members spend");
    expect(rewardCostLine(2, 1000, 500)).toBe("Giving back 1% of what members spend");
    expect(rewardCostLine(0, 1000, 500)).toBeNull();
  });
  it("words an interval", () => {
    expect(intervalWords(10)).toBe("every 10 days");
    expect(intervalWords(42)).toBe("every 6 weeks");
    expect(intervalWords(84)).toBe("every 3 months");
  });
  it("has a word and a tone for every butcher status", () => {
    expect(Object.keys(BUTCHER_STATUS).sort()).toEqual(["deposit_paid", "paid", "unpaid", "weigh"]);
    expect(BUTCHER_STATUS.weigh.tone).toBe("accent");
  });
});

describe("grocer sidebar", () => {
  const GROC: FeatureKey[] = ["grocery.counter_preorders", "grocery.flyer", "grocery.pantry_reminders", "grocery.whatsapp_orders", "orders.order_ahead", "marketing.sms", "promos.basic", "discount_cards"];
  const nav = (enabled: FeatureKey[], vertical = "grocery", role: "owner" | "staff" = "owner") =>
    buildMerchantNav("/m/x", role, new Set(enabled), { vertical, plan: "pro" }).map((n) => n.key);
  it("groups a grocer's sidebar: sell ahead, talk to customers, loyalty", () => {
    const entries = buildMerchantNav("/m/x", "owner", new Set(GROC), { vertical: "grocery", plan: "pro" });
    const by = (g: string) => entries.filter((e) => e.group === g).map((e) => e.key);
    expect(by("g-sell")).toEqual(["grocery-butcher", "grocery-flyer", "orders"]);
    expect(by("g-talk")).toEqual(["grocery-whatsapp", "grocery-pantry", "messages"]);
    expect(by("g-loyalty")).toEqual(expect.arrayContaining(["customers", "program", "promos", "reports"]));
  });
  it("shows only the modules the shop has and no repair, appointment or discount-card sections", () => {
    const k = nav(["grocery.flyer", "orders.order_ahead"]);
    expect(k).toContain("grocery-flyer");
    expect(k).not.toContain("grocery-butcher");
    expect(k).not.toContain("grocery-pantry");
    expect(nav(GROC)).not.toContain("discount-cards");
    expect(nav(GROC)).not.toContain("tickets");
  });
  it("keeps the flat sidebar for a grocer with no grocery feature, and for other trades", () => {
    expect(nav(["orders.order_ahead"])).not.toContain("grocery-flyer");
    expect(nav(GROC, "cafe")).not.toContain("grocery-butcher");
  });
  it("counter staff at a butcher get the butcher counter, owners keep billing", () => {
    expect(nav(GROC, "grocery", "staff")).toEqual(["home", "counter", "grocery-butcher"]);
    expect(canOpen("staff", "grocery")).toBe(true);
    expect(canOpen("staff", "billing")).toBe(false);
    expect(nav(GROC)).toContain("billing");
  });
});

describe("restock reserve page windows (frame 12)", () => {
  const hours = { mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]], sat: [["09:00", "16:00"]] } as Record<string, [string, string][]>;
  const wall = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit" });

  it("offers three-hour windows on the first open day, starting on the hour, ending when the shop closes", () => {
    // Friday evening in Toronto: the shop is closed Sat? No: Saturday opens 09:00.
    const w = restockWindows(hours, new Date("2026-11-06T23:00:00Z"));
    expect(w.map((x) => [x.date, x.start, x.end])).toEqual([
      ["2026-11-07", "09:00", "12:00"],
      ["2026-11-07", "12:00", "15:00"],
      ["2026-11-07", "15:00", "16:00"],
    ]);
    expect(wall(w[0]!.iso)).toBe("09:00");
  });

  it("starts today when the shop is open and an hour's notice is left, and never offers a time that has passed", () => {
    // Monday 10:20 Toronto: earliest pick-up 11:20, rounded to 11:30 steps by the pick-up grid.
    const w = restockWindows(hours, new Date("2026-11-02T15:20:00Z"));
    expect(w[0]!.date).toBe("2026-11-02");
    for (const x of w) expect(new Date(x.iso).getTime()).toBeGreaterThanOrEqual(new Date("2026-11-02T16:20:00Z").getTime());
    expect(w.length).toBeGreaterThan(0);
    expect(w.at(-1)!.end <= "17:00").toBe(true);
  });

  it("is empty when nothing is open in the next days, and when hours are missing it falls back to a default day", () => {
    expect(restockWindows({ sun: [["09:00", "17:00"]] } as Record<string, [string, string][]>, new Date("2026-11-02T15:00:00Z"))).toEqual([]);
    expect(restockWindows(null, new Date("2026-11-02T15:00:00Z")).length).toBeGreaterThan(0);
  });

  it("says every N weeks from the days a purchase lasts", () => {
    expect(restockEveryWeeks(42)).toBe(6);
    expect(restockEveryWeeks(30)).toBe(4);
    expect(restockEveryWeeks(7)).toBe(1);
    expect(restockEveryWeeks(3)).toBe(1);
  });
});
