import { t as translate, type Locale, type MessageKey, type Vars } from "@ll/shared";
import { describe, expect, it } from "vitest";
import { heroText, type HomeHero } from "./hero";
import { walletRow } from "./walletRow";

const i18n = (locale: Locale) => ({ locale, t: (key: MessageKey, vars?: Vars) => translate(locale, key, vars) });
const HI = /[ऀ-ॿ]/;
const PA = /[਀-੿]/;

describe("hero in the shopper's language", () => {
  const ready: HomeHero = { kind: "ready", count: 2, shopCount: 2, shopName: null };
  const progress: HomeHero = { kind: "progress", toGo: 40, unit: "points", rewardName: "a free latte", shopName: "Pinecone", value: 10, max: 50, memberId: "m1" };
  it("English is unchanged with or without i18n", () => {
    expect(heroText(ready)).toEqual(heroText(ready, i18n("en")));
    expect(heroText(ready).line).toBe("rewards ready");
    expect(heroText(progress, i18n("en")).line).toBe("points to a free latte");
  });
  it("Hindi and Punjabi write the line and chip in their script and keep the number", () => {
    const hi = heroText(ready, i18n("hi"));
    expect(hi.big).toBe("2");
    expect(hi.line).toMatch(HI);
    expect(hi.chip).toMatch(HI);
    const pa = heroText(progress, i18n("pa"));
    expect(pa.big).toBe("40");
    expect(pa.line).toMatch(PA);
    expect(pa.chip).toContain("Pinecone");
  });
});

describe("wallet rows in the shopper's language", () => {
  const base = { balance: 120, terminology: "points", program: { earnType: "per_dollar" as const }, rewardsAvailableCount: 0, nextReward: { name: "Free latte", pointsNeeded: 30, pointsCost: 150 }, expiryDisclosure: "Points never expire." };
  it("English output does not change", () => {
    expect(walletRow(base).subtitle).toBe(walletRow(base, null, i18n("en")).subtitle);
    expect(walletRow(base).subtitle).toBe("120 points · 30 to a free latte");
  });
  it("Hindi shows translated units and the reward name as the shop typed it", () => {
    const r = walletRow(base, null, i18n("hi"));
    expect(r.subtitle).toMatch(HI);
    expect(r.subtitle).toContain("Free latte");
    expect(r.trailing).toMatchObject({ kind: "balance", value: 120 });
    const ready = walletRow({ ...base, rewardsAvailableCount: 1 }, "Free latte", i18n("pa"));
    expect(ready.accent).toBe(true);
    expect(ready.subtitle).toMatch(PA);
    expect(ready.trailing.kind).toBe("showCard");
  });
});
