import { describe, expect, it } from "vitest";
import { byDistance, exploreSections, filterShops, movedEnough, stripHeader } from "./explore";
import { perkHeadline, perkProgress } from "./perks";

const shop = (id: string, vertical: string, o: Partial<{ isMember: boolean; hasPromo: boolean; openNow: boolean | null; distanceMetres: number | null }> = {}) => ({
  merchant: { id, vertical, name: id },
  isMember: false,
  hasPromo: false,
  openNow: true,
  distanceMetres: 100,
  ...o,
});

describe("explore", () => {
  const shops = [shop("cafe", "cafe", { distanceMetres: 300, isMember: true }), shop("barber", "barber", { hasPromo: true, distanceMetres: 50 }), shop("garage", "repair_auto", { openNow: false, distanceMetres: null })];
  it("filters by category chip and sheet chips", () => {
    expect(filterShops(shops, { category: "coffee" }).map((s) => s.merchant.id)).toEqual(["cafe"]);
    expect(filterShops(shops, { category: "beauty" }).map((s) => s.merchant.id)).toEqual(["barber"]);
    expect(filterShops(shops, { category: "all", openNow: true }).map((s) => s.merchant.id)).toEqual(["cafe", "barber"]);
    expect(filterShops(shops, { category: "all", myShops: true }).map((s) => s.merchant.id)).toEqual(["cafe"]);
    expect(filterShops(shops, { category: "all", hasPromo: true }).map((s) => s.merchant.id)).toEqual(["barber"]);
  });
  it("sorts nearest first, unknown distance last", () => {
    expect(byDistance(shops).map((s) => s.merchant.id)).toEqual(["barber", "cafe", "garage"]);
  });
  it("builds My shops / Promos nearby / Everything else", () => {
    expect(exploreSections(shops).map((s) => [s.title, s.data.map((x) => x.merchant.id)])).toEqual([
      ["My shops", ["cafe"]],
      ["Promos nearby", ["barber"]],
      ["Everything else", ["garage"]],
    ]);
  });
  it("sheet header and search-this-area threshold", () => {
    expect(stripHeader(14, "Roncesvalles")).toBe("14 shops on Roncesvalles");
    expect(stripHeader(1)).toBe("1 shop on this strip");
    expect(movedEnough({ lat: 43.65, lng: -79.45 }, { lat: 43.6501, lng: -79.4501 })).toBe(false);
    expect(movedEnough({ lat: 43.65, lng: -79.45 }, { lat: 43.66, lng: -79.45 })).toBe(true);
  });
});

describe("neighbourhood perk", () => {
  const perk = { name: "Strip explorer", description: null, ruleType: "distinct_shops", threshold: 3, windowDays: 30, bonusPoints: 50 };
  const now = Date.parse("2026-10-21T12:00:00Z");
  it("counts distinct shops visited in the window in that neighbourhood", () => {
    const ms = [
      { merchant: { neighbourhoodId: "r" }, lastVisitAt: "2026-10-20T12:00:00Z" },
      { merchant: { neighbourhoodId: "r" }, lastVisitAt: "2026-08-01T12:00:00Z" },
      { merchant: { neighbourhoodId: "x" }, lastVisitAt: "2026-10-20T12:00:00Z" },
      { merchant: { neighbourhoodId: "r" }, lastVisitAt: "2026-10-01T12:00:00Z" },
    ];
    expect(perkProgress(perk, ms, "r", now)).toEqual({ visited: 2, goal: 3, done: false });
  });
  it("headline", () => expect(perkHeadline(perk, "Roncesvalles")).toBe("Visit 3 shops on Roncesvalles this month → +50 pts"));
});
