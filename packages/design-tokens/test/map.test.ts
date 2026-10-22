import { describe, expect, it } from "vitest";
import { cornerMapStyle, googleMapStyle, mapLayerRole } from "../src/map.js";

const base = {
  version: 8,
  name: "Positron",
  layers: [
    { id: "background", type: "background", paint: { "background-color": "rgb(242,243,240)" } },
    { id: "park", type: "fill", "source-layer": "park", paint: { "fill-color": "#ccc" } },
    { id: "water", type: "fill", "source-layer": "water", paint: { "fill-color": "#ccc" } },
    { id: "highway_minor", type: "line", "source-layer": "transportation", paint: { "line-color": "#ddd" } },
    { id: "highway_major_casing", type: "line", "source-layer": "transportation", paint: { "line-color": "#ddd" } },
    { id: "highway-name-minor", type: "symbol", "source-layer": "transportation_name", paint: { "text-color": "#666" }, layout: { "text-size": 14 } },
    { id: "highway-shield-non-us", type: "symbol", "source-layer": "transportation_name", layout: {} },
    { id: "poi_label", type: "symbol", "source-layer": "poi", layout: {} },
    { id: "label_city", type: "symbol", "source-layer": "place", paint: { "text-color": "#000" } },
  ],
};

describe("cornerMapStyle", () => {
  it("applies the light basemap colours without mutating the input", () => {
    const before = JSON.stringify(base);
    const s = cornerMapStyle(base, "light");
    expect(JSON.stringify(base)).toBe(before);
    const byId = Object.fromEntries(s.layers.map((l) => [l.id, l as { paint?: Record<string, unknown>; layout?: Record<string, unknown> }]));
    expect(byId.background!.paint!["background-color"]).toBe("#F2F2F0");
    expect(byId.water!.paint!["fill-color"]).toBe("#E9F0F5");
    expect(byId.park!.paint!["fill-color"]).toBe("#EEF3EA");
    expect(byId.highway_minor!.paint!["line-color"]).toBe("#FFFFFF");
    expect(byId["highway-name-minor"]!.paint!["text-color"]).toBe("#9A9AA0");
    expect(byId["highway-shield-non-us"]!.layout!.visibility).toBe("none");
    expect(byId.poi_label!.layout!.visibility).toBe("none");
    expect(byId.label_city!.paint!["text-color"]).toBe("#6B6B70");
  });
  it("never sets a paint property from another layer type", () => {
    const s = cornerMapStyle(base, "dark");
    for (const l of s.layers as { type: string; paint?: Record<string, unknown> }[]) {
      const prefix = { background: "background-", fill: "fill-", line: "line-", symbol: "text-" }[l.type]!;
      for (const k of Object.keys(l.paint ?? {})) expect(k.startsWith(prefix) || k.startsWith("icon-"), `${l.type} ${k}`).toBe(true);
    }
  });
  it("classifies roads and labels", () => {
    expect(mapLayerRole({ id: "highway_major_casing", type: "line", "source-layer": "transportation" })).toBe("roadCasing");
    expect(mapLayerRole({ id: "label_town", type: "symbol", "source-layer": "place" })).toBe("placeLabel");
  });
  it("google style hides POIs and colours land", () => {
    expect(googleMapStyle.light).toContainEqual({ featureType: "poi", stylers: [{ visibility: "off" }] });
    expect(googleMapStyle.light[0]).toEqual({ elementType: "geometry", stylers: [{ color: "#F2F2F0" }] });
  });
});
