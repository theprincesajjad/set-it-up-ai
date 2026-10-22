import { describe, expect, it } from "vitest";
import { byDistance, exploreSections, filterShops, labelPlan, movedEnough, pinPriority, pinSubtitle, placeKind, stripHeader } from "./explore";
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
  it("filters by audience and rewards ready", () => {
    expect(filterShops(shops, { category: "all", audience: "new" }).map((s) => s.merchant.id)).toEqual(["barber", "garage"]);
    expect(filterShops(shops, { category: "all", rewardsReady: new Set(["garage"]) }).map((s) => s.merchant.id)).toEqual(["garage"]);
    expect(filterShops(shops, { category: "repair" }).map((s) => s.merchant.id)).toEqual(["garage"]);
  });
  it("builds my shops / nearby", () => {
    expect(exploreSections(shops).map((s) => [s.title, s.data.map((x) => x.merchant.id)])).toEqual([
      ["my shops", ["cafe"]],
      ["nearby", ["barber", "garage"]],
    ]);
  });
  it("pin subtitle: one line, accent only for rewards", () => {
    const m = { balance: 7, rewardsAvailableCount: 0, terminology: "stamps", earnType: "stamps" as const, stampGoal: 10 };
    expect(pinSubtitle("cafe", null)).toEqual({ text: "café", accent: false });
    expect(pinSubtitle("cafe", m)).toEqual({ text: "7 / 10 stamps", accent: false });
    expect(pinSubtitle("cafe", { ...m, balance: 14 })).toEqual({ text: "10 / 10 stamps", accent: false });
    expect(pinSubtitle("cafe", { ...m, rewardsAvailableCount: 1 })).toEqual({ text: "reward ready", accent: true });
    expect(pinSubtitle("restaurant", { ...m, earnType: "per_dollar", terminology: "points", balance: 1350, stampGoal: null })).toEqual({ text: "1,350 pts", accent: false });
    expect(placeKind("repair_electronics")).toBe("phone repair");
    expect(placeKind("unknown")).toBe("shop");
  });
  it("sheet header and search-this-area threshold", () => {
    expect(stripHeader(14, "Roncesvalles")).toBe("14 shops on Roncesvalles");
    expect(stripHeader(1)).toBe("1 shop on this strip");
    expect(movedEnough({ lat: 43.65, lng: -79.45 }, { lat: 43.6501, lng: -79.4501 })).toBe(false);
    expect(movedEnough({ lat: 43.65, lng: -79.45 }, { lat: 43.66, lng: -79.45 })).toBe(true);
  });
});

describe("pin labels", () => {
  it("keeps labels that don't collide, highest priority first", () => {
    const pts = [
      { id: "a", x: 100, y: 100, priority: 1 },
      { id: "b", x: 110, y: 110, priority: 5 },
      { id: "c", x: 100, y: 300, priority: 0 },
    ];
    expect([...labelPlan(pts)].sort()).toEqual(["b", "c"]);
  });
  it("no labels under the floating chrome", () => {
    expect([...labelPlan([{ id: "a", x: 50, y: 20, priority: 1 }], { avoid: [{ x1: 0, y1: 0, x2: 400, y2: 100 }] })]).toEqual([]);
  });
  it("a bubble under another pin's label blocks it", () => {
    expect([...labelPlan([{ id: "a", x: 0, y: 0, priority: 2 }, { id: "b", x: 80, y: 0, priority: 1 }])]).toEqual(["b"]);
  });
  it("priority: selected > reward ready > member > nearest", () => {
    const base = { selected: false, rewardReady: false, member: false, distanceMetres: 100 };
    expect(pinPriority({ ...base, selected: true })).toBeGreaterThan(pinPriority({ ...base, rewardReady: true, member: true }));
    expect(pinPriority({ ...base, member: true, distanceMetres: 900 })).toBeGreaterThan(pinPriority({ ...base, distanceMetres: 10 }));
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
