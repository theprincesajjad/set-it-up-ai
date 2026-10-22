import { describe, expect, it } from "vitest";
import { clusterPins, densestGroup } from "@/lib/mapCluster";

describe("clusterPins", () => {
  it("keeps far-apart pins separate", () => {
    const g = clusterPins([{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }]);
    expect(g).toEqual([{ anchor: "a", members: ["a"] }, { anchor: "b", members: ["b"] }]);
  });

  it("collapses overlapping pins; my shops win the anchor over earlier non-member shops", () => {
    const g = clusterPins([
      { id: "a", x: 0, y: 0 },
      { id: "mine", x: 10, y: 5, isMember: true },
      { id: "promo", x: 20, y: 0, hasPromo: true },
      { id: "far", x: 300, y: 300 },
    ]);
    expect(g).toEqual([
      { anchor: "mine", members: ["mine", "promo", "a"] },
      { anchor: "far", members: ["far"] },
    ]);
  });

  it("the selected pin always anchors", () => {
    const g = clusterPins([{ id: "mine", x: 0, y: 0, isMember: true }, { id: "sel", x: 5, y: 5 }], { selected: "sel" });
    expect(g[0]).toEqual({ anchor: "sel", members: ["sel", "mine"] });
  });

  it("respects the radius", () => {
    expect(clusterPins([{ id: "a", x: 0, y: 0 }, { id: "b", x: 30, y: 0 }], { radius: 20 })).toHaveLength(2);
    expect(clusterPins([{ id: "a", x: 0, y: 0 }, { id: "b", x: 30, y: 0 }], { radius: 40 })).toHaveLength(1);
  });
});

describe("densestGroup", () => {
  it("picks the busiest strip", () => {
    const strip = [0, 1, 2, 3].map((i) => ({ id: `r${i}`, lat: 43.64 + i * 0.001, lng: -79.45 }));
    const lone = { id: "far", lat: 43.7, lng: -79.3 };
    expect(densestGroup([lone, ...strip]).map((p) => p.id)).toEqual(["r0", "r1", "r2", "r3"]);
    expect(densestGroup([lone])).toEqual([lone]);
  });
});
