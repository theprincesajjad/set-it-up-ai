import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { colors } from "@ll/design-tokens";
import { cssVarFor, rolesFor, type SchemeName } from "./roles";

/** The CSS the web app ships (`@ll/design-tokens/tokens.css`, generated from the same colors.ts). */
const css = readFileSync(fileURLToPath(new URL("../../../../packages/design-tokens/css/tokens.css", import.meta.url)), "utf8");

/** Variables declared in the first block that opens with `selector` (light: `[data-theme="light"]`; dark: the forced `[data-theme="dark"]`). */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, selector).toBeGreaterThan(-1);
  const end = css.indexOf("\n}", start);
  const vars = new Map<string, string>();
  for (const m of css.slice(start, end).matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)) vars.set(m[1]!, m[2]!.trim());
  return vars;
}

const web: Record<SchemeName, Map<string, string>> = { light: block('[data-theme="light"]'), dark: block('[data-theme="dark"]') };

describe("native v3 roles equal the web CSS values", () => {
  for (const scheme of ["light", "dark"] as const) {
    const roles = rolesFor(scheme);
    it(`${scheme}: every role is a CSS variable with the same value`, () => {
      const keys = Object.keys(roles) as (keyof typeof roles)[];
      expect(keys.length).toBeGreaterThan(40);
      for (const key of keys) {
        const v = web[scheme].get(cssVarFor(key));
        expect(v, `${cssVarFor(key)} (${scheme})`).toBeDefined();
        expect(v!.toLowerCase(), `${cssVarFor(key)} (${scheme})`).toBe(roles[key].toLowerCase());
      }
    });
    it(`${scheme}: the v2 names in Theme.c are aliases with the same values`, () => {
      const c = colors[scheme];
      expect(c.bg).toBe(roles.background);
      expect(c.fg).toBe(roles.foreground);
      expect(c.bgSubtle).toBe(roles.muted);
      expect(c.bgMuted).toBe(roles.accent);
      expect(c.fgMuted).toBe(roles.mutedForeground);
      expect(c.line).toBe(roles.border);
      expect(c.lineStrong).toBe(roles.input);
      expect(c.accent).toBe(roles.points);
      expect(c.accentText).toBe(roles.pointsText);
      expect(c.accentSoft).toBe(roles.pointsSoft);
      expect(c.onAccent).toBe(roles.pointsForeground);
    });
  }
  it("the orange is `points` and the hover surface is `accent` (not the orange)", () => {
    expect(rolesFor("light").points).toBe("#FF5A1F");
    expect(rolesFor("light").accent).not.toBe(rolesFor("light").points);
    expect(rolesFor("light").paper).toBe("#FBF9F6");
    expect(rolesFor("dark").paper).toBe("#0E0D0C");
  });
});
