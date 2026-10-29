import { describe, expect, it } from "vitest";
import { SITE_COPY_FIELD_KEYS, SITE_DRAFT_JSON_SCHEMA, SITE_PRESETS, SITE_PRESET_DEFS, clampLine, defaultContent, defaultPresetFor, normalizeCopy, normalizeHidden, normalizeHostname, normalizeOrder, siteDraftOutput } from "../src/index.js";

const facts = { name: "Priya Nails", tradeLabel: "nail studio", areaLabel: "Bloor West", city: "Toronto", books: true, hasLoyalty: true };

describe("site presets", () => {
  it("each preset starts with hero and keeps its required sections", () => {
    for (const p of SITE_PRESETS) {
      const d = SITE_PRESET_DEFS[p];
      expect(d.sections[0]).toBe("hero");
      for (const r of d.required) expect(d.sections).toContain(r);
    }
  });

  it("normalizes a model's order: hero first, no strangers, no repeats, nothing dropped", () => {
    expect(normalizeOrder("studio", ["services", "promos", "services", "hero", "about"])).toEqual(["hero", "services", "about", "reviews", "loyalty", "hours", "map", "contact"]);
    expect(normalizeHidden("studio", ["services", "map", "map", "promos"])).toEqual(["map"]);
  });

  it("template copy uses the area, never invents an address, and fills every field", () => {
    const c = defaultContent("studio", facts);
    expect(c.copy.map.note).toContain("Bloor West");
    for (const f of SITE_COPY_FIELD_KEYS) {
      const [a, b] = f.split(".") as [keyof typeof c.copy, string];
      expect((c.copy[a] as Record<string, string>)[b]).toBeTruthy();
    }
    expect(defaultPresetFor("makeup")).toBe("portfolio");
    expect(defaultPresetFor("cafe")).toBe("shopfront");
    expect(defaultPresetFor("nails")).toBe("studio");
  });

  it("clamps long lines on a word boundary and keeps missing lines from the fallback", () => {
    expect(clampLine("one two three four five six", 13)).toBe("one two three");
    const base = defaultContent("studio", facts).copy;
    const out = normalizeCopy({ hero: { headline: "x".repeat(200) }, nope: { a: "b" } }, base);
    expect(out.hero.headline.length).toBeLessThanOrEqual(70);
    expect(out.about).toEqual(base.about);
  });

  it("the JSON schema and the zod check describe the same shape", () => {
    expect(SITE_DRAFT_JSON_SCHEMA.required).toEqual(["order", "copy"]);
    expect(siteDraftOutput.safeParse({ order: ["hero"], copy: defaultContent("portfolio", facts).copy }).success).toBe(true);
  });

  it("hostnames", () => {
    expect(normalizeHostname("https://www.PriyaNails.ca/")).toBe("priyanails.ca");
    expect(normalizeHostname("not a domain")).toBeNull();
  });
});
