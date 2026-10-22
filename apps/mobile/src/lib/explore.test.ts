import { describe, expect, it } from "vitest";
import { byDistance, exploreSections, filterShops, labelPlan, movedEnough, pinPlan, pinPriority, pinSubtitle, placeKind, stripHeader } from "./explore";
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
    expect(stripHeader(16, "Roncesvalles Village")).toBe("16 shops in Roncesvalles Village");
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

describe("pin plan", () => {
  it("hides pins under chrome, clusters overlapping ones, caps labels", () => {
    const pts = [
      { id: "top", x: 100, y: 30, priority: 9 },
      { id: "a", x: 100, y: 300, priority: 5 },
      { id: "b", x: 110, y: 310, priority: 4 },
      ...Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, x: 40, y: 400 + i * 60, priority: 3 - i * 0.1 })),
    ];
    const plan = pinPlan(pts, { chrome: [{ x1: 0, y1: 0, x2: 400, y2: 100 }], maxLabels: 8 });
    expect(plan.hidden.has("top")).toBe(true);
    expect(plan.hidden.has("b")).toBe(true);
    expect(plan.clusters.get("a")?.members).toEqual(["a", "b"]);
    expect(plan.labeled.has("a")).toBe(false);
    expect(plan.labeled.size).toBe(8);
    expect(plan.labeled.has("p0")).toBe(true);
    expect(plan.labeled.has("p11")).toBe(false);
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

describe("labelPlanSides (canvas: labels flip left when the right is taken)", () => {
  it("puts a label on the left when another label owns the right side", async () => {
    const { labelPlanSides } = await import("./explore");
    const pts = [
      { id: "a", x: 100, y: 200, priority: 2, w: 120, h: 30 },
      { id: "b", x: 400, y: 205, priority: 1, w: 120, h: 30 },
    ];
    const r = labelPlanSides(pts, { avoid: [{ x1: 450, y1: -1e4, x2: 1e4, y2: 1e4 }] });
    expect(r.right.has("a")).toBe(true);
    expect(r.left.has("b")).toBe(true);
  });
});
