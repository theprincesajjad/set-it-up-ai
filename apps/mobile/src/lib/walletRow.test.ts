import { describe, expect, it } from "vitest";
import { shopLine } from "./shopLine";
import { walletRow, type WalletRowInput } from "./walletRow";

const base: WalletRowInput = { balance: 6, terminology: "stamps", program: { earnType: "stamps" }, rewardsAvailableCount: 0, nextReward: { name: "Free loaf", pointsNeeded: 2, pointsCost: 8 }, expiryDisclosure: "Your points and stamps never expire." };

describe("wallet row", () => {
  it("stamps: the count and what is left, with a fraction on the right", () => {
    const r = walletRow(base);
    expect(r.subtitle).toBe("6 stamps · 2 to a free loaf");
    expect(r.trailing).toEqual({ kind: "fraction", text: "6 / 8" });
    expect(r.progress).toBe(0.75);
    expect(r.accent).toBe(false);
  });
  it("one stamp reads singular", () => {
    expect(walletRow({ ...base, balance: 1, nextReward: { name: "Free loaf", pointsNeeded: 7, pointsCost: 8 } }).subtitle).toBe("1 stamp · 7 to a free loaf");
  });
  it("points: the balance and the distance to the next reward, the balance on the right", () => {
    const r = walletRow({ balance: 340, terminology: "points", program: { earnType: "per_dollar" }, rewardsAvailableCount: 0, nextReward: { name: "$5 off", pointsNeeded: 60, pointsCost: 400 }, expiryDisclosure: "" });
    expect(r.subtitle).toBe("340 points · 60 to $5 off");
    expect(r.trailing).toEqual({ kind: "balance", value: 340, unit: "points" });
  });
  it("a reward ready says so in the accent, names it when known, and shows the card", () => {
    expect(walletRow({ ...base, rewardsAvailableCount: 1 }, "Free drink")).toMatchObject({ subtitle: "free drink ready", accent: true, trailing: { kind: "showCard" }, progress: null });
    expect(walletRow({ ...base, rewardsAvailableCount: 1 }).subtitle).toBe("reward ready");
    expect(walletRow({ ...base, rewardsAvailableCount: 3 }, "Free drink").subtitle).toBe("3 rewards ready");
  });
  it("nothing left to work toward falls back to the expiry line the program carries", () => {
    const r = walletRow({ ...base, nextReward: null });
    expect(r.subtitle).toBe("Your points and stamps never expire.");
    expect(r.progress).toBeNull();
  });
});

describe("shop line", () => {
  it("orders progress, live window, perk and kind", () => {
    expect(shopLine({ progress: "your 7 / 10", promoLine: "2× stamps till 4 pm", kind: "café" })).toBe("your 7 / 10 · 2× stamps till 4 pm");
    expect(shopLine({ promoLine: "2× stamps till 4 pm", perk: "x", kind: "café" })).toBe("2× stamps till 4 pm");
    expect(shopLine({ perk: "show your card for 10% off", kind: "pharmacy" })).toBe("pharmacy · show your card for 10% off");
    expect(shopLine({ kind: "bakery", meta: "bakery · 300 m · open" })).toBe("bakery · 300 m · open");
    expect(shopLine({ kind: "bakery" })).toBe("bakery");
  });
});
