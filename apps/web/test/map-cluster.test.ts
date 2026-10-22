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

import { labelledAnchors } from "@/lib/mapCluster";

describe("labelledAnchors", () => {
  it("shows a label only where it doesn't run into another bubble or label", () => {
    const pts = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 80, y: 5 }, // sits where a's label would go
      { id: "c", x: 0, y: 200 },
    ];
    const groups = pts.map((p) => ({ anchor: p.id, members: [p.id] }));
    const out = labelledAnchors(groups, pts, () => "Pinecone Coffee");
    expect(out.has("a")).toBe(false);
    expect(out.has("b")).toBe(true);
    expect(out.has("c")).toBe(true);
  });

  it("treats floating chrome as an obstacle and caps the number of labels", () => {
    const pts = [
      { id: "under-search", x: 40, y: 30 },
      { id: "mine", x: 40, y: 300 },
      { id: "x", x: 40, y: 400 },
      { id: "y", x: 40, y: 500 },
    ];
    const groups = pts.map((p) => ({ anchor: p.id, members: [p.id] }));
    const out = labelledAnchors(groups, pts, () => "Shop", { obstacles: [{ x1: 0, x2: 390, y1: 0, y2: 60 }], max: 2, rank: (id) => (id === "mine" ? 0 : 1) });
    expect(out.has("under-search")).toBe(false);
    expect(out.has("mine")).toBe(true);
    expect(out.size).toBe(2);
  });
});
