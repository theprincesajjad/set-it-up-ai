/** phase-solo D: seasonal promo templates per trade, the channel ladder rungs and text segments. */
import { describe, expect, it } from "vitest";
import { CHANNEL_LADDER, PROMO_TEMPLATES, PROMO_TRADES, en, instagramThreadUrl, promoTradeFor, promoWindow, rungsFor, seasonalPromoTemplates, smsSegments } from "../src/index.js";

describe("promo templates", () => {
  it("has at least six per trade, each with English copy under the push limit and {shop}", () => {
    for (const trade of PROMO_TRADES) expect(PROMO_TEMPLATES.filter((t) => t.trade === trade).length, trade).toBeGreaterThanOrEqual(6);
    const keys = new Set<string>();
    for (const t of PROMO_TEMPLATES) {
      expect(keys.has(t.key), t.key).toBe(false);
      keys.add(t.key);
      const title = (en as Record<string, string>)[t.titleKey];
      const body = (en as Record<string, string>)[t.bodyKey];
      expect(title, t.titleKey).toBeTruthy();
      expect(body, t.bodyKey).toContain("{shop}");
      expect(body.length, t.bodyKey).toBeLessThanOrEqual(170);
      expect(`${title} ${body}`).not.toMatch(/\b(member|merchant|SMS|upgrade)\b/i);
    }
  });

  it("maps every solo trade and falls back to the general list", () => {
    expect(promoTradeFor("nails")).toBe("nails");
    expect(promoTradeFor("brows_lashes")).toBe("brows_lashes");
    expect(promoTradeFor("spa")).toBe("salon");
    expect(promoTradeFor("repair_auto")).toBe("general");
  });

  it("puts the season you are in first: Valentine's nails in early February, back-to-school cuts in late August", () => {
    expect(seasonalPromoTemplates("nails", "2027-02-05")[0]).toMatchObject({ key: "valentines_nails", inSeason: true, daysAway: 0 });
    expect(seasonalPromoTemplates("barber", "2027-08-20")[0]).toMatchObject({ key: "back_to_school_cuts", inSeason: true });
    // A window that wraps the new year.
    expect(promoWindow({ window: { from: "12-27", to: "01-15" } }, "2027-01-03")).toEqual({ start: "2026-12-27", end: "2027-01-15" });
    // A festival window moves with the festival (Diwali).
    const diwali = seasonalPromoTemplates("nails", "2026-10-29").find((t) => t.key === "diwali_nails");
    expect(diwali).toBeTruthy();
    expect(diwali!.start <= diwali!.end).toBe(true);
  });
});

describe("the ladder and texts", () => {
  it("walks app, web push, email, then text; a promo never texts; a preference narrows it", () => {
    expect(rungsFor("best")).toEqual([...CHANNEL_LADDER]);
    expect(rungsFor("best", { marketing: true })).not.toContain("sms");
    expect(rungsFor("app")).toEqual(["push", "web_push"]);
    expect(rungsFor("email")).toEqual(["email"]);
    expect(rungsFor("text")[0]).toBe("sms");
  });

  it("counts text segments (160 GSM-7, 70 for other scripts)", () => {
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("a".repeat(161))).toBe(2);
    expect(smsSegments("یاد دہانی".repeat(10))).toBe(2);
    expect(smsSegments("")).toBe(0);
  });

  it("links an Instagram handle to its DM", () => {
    expect(instagramThreadUrl("@maya.chen")).toBe("https://ig.me/m/maya.chen");
    expect(instagramThreadUrl(null)).toBeNull();
  });
});
