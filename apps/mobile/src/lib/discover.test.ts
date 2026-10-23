import { describe, expect, it } from "vitest";
import { promoWindowLine, shopSubtitle, discoverMeta, discoverRows, heroCopy, miniMapPoints, shortHood } from "./discover";

const shop = (id: string, vertical: string, d: number | null, isMember = false) => ({ merchant: { id, slug: id, name: id, vertical }, distanceMetres: d, openNow: null, isMember });

describe("discover", () => {
  it("shortens neighbourhood names", () => {
    expect(shortHood("Roncesvalles Village")).toBe("roncesvalles");
    expect(shortHood("The Danforth")).toBe("the danforth");
    expect(shortHood(null)).toBe("");
  });

  it("groups shops into category rows, ready and member first", () => {
    const rows = discoverRows([shop("a", "cafe", 600), shop("b", "cafe", 140, true), shop("c", "bakery", 320), shop("d", "cafe", 300)], { hood: "roncesvalles", ready: new Set(["d"]) });
    expect(rows.map((r) => r.title)).toEqual(["coffee on roncesvalles", "bakeries on roncesvalles"]);
    expect(rows[0]!.shops.map((s) => s.merchant.id)).toEqual(["d", "b", "a"]);
  });

  it("nearest mode and category filter", () => {
    const rows = discoverRows([shop("a", "cafe", 600), shop("b", "cafe", 140, true)], { hood: "", ready: new Set(["a"]), mode: "nearest", category: "coffee" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("coffee near you");
    expect(rows[0]!.shops.map((s) => s.merchant.id)).toEqual(["b", "a"]);
    expect(discoverRows([shop("a", "cafe", 1)], { hood: "x", ready: new Set(), mode: "mine" })).toEqual([]);
  });

  it("meta line", () => {
    expect(discoverMeta(shop("a", "cafe", 140), { open: true, label: "Open · closes 6 pm" })).toBe("café · 140 m · open");
    expect(discoverMeta(shop("a", "bakery", 320), { open: false, label: "Closed · opens 7:30 am" })).toBe("bakery · 320 m · opens 7:30");
    expect(discoverMeta(shop("a", "cafe", 600), null)).toBe("café · 600 m");
  });

  it("hero copy for a passport", () => {
    const h = heroCopy({ name: "Roncesvalles Passport", kind: "passport", endsAt: "2026-10-31T12:00:00Z", goalVisits: 5, bonusPoints: 50, multiplierPct: null, prize: "Win the street's prize basket", progress: { visited: 2, goal: 5 } }, new Date("2026-10-22T12:00:00Z"));
    expect(h.eyebrow).toBe("roncesvalles passport · ends oct 31");
    expect(h.headline).toBe("visit 5 shops, win the street's prize basket");
    expect(h.progress).toEqual({ value: 2, max: 5 });
  });

  it("mini map keeps pins inside the card", () => {
    const pts = miniMapPoints({ lat: 43.6475, lng: -79.4487 }, [{ id: "a", lat: 43.65, lng: -79.45 }, { id: "b", lat: 43.646, lng: -79.447 }], { w: 358, h: 120 });
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(28);
      expect(p.x).toBeLessThanOrEqual(330);
      expect(p.y).toBeGreaterThanOrEqual(28);
      expect(p.y).toBeLessThanOrEqual(92);
    }
  });
});

describe("mini map spacing", () => {
  it("pushes a shop that is on top of the dot out to minR", () => {
    const [p] = miniMapPoints({ lat: 43.6475, lng: -79.4487 }, [{ id: "a", lat: 43.6475, lng: -79.4487 }], { w: 300, h: 132, minR: 36 });
    expect(Math.round(Math.hypot(p!.x - 150, p!.y - 66))).toBeGreaterThanOrEqual(35);
  });

  it("subtitle priority: progress, promo, perk, category", () => {
    const sh = shop("a", "cafe", 140);
    expect(shopSubtitle(sh, null, { progress: { n: 7, goal: 10 }, promoLine: "x" })).toBe("your 7 / 10");
    expect(shopSubtitle(sh, null, { promoLine: promoWindowLine(2, "stamps", 16), perk: "p" })).toBe("2× stamps till 4 pm");
    expect(shopSubtitle(sh, null, { perk: "10% off for students" })).toBe("10% off for students");
    expect(shopSubtitle(sh, null)).toBe("café · 140 m");
  });
});
