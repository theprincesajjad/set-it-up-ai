import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cn, tokenColors, tokenTextSizes } from "@/lib/utils";
import { cn as joinCn } from "@/lib/cn";

const themeCss = readFileSync(join(__dirname, "../../../packages/design-tokens/css/theme.css"), "utf8");
const names = (prefix: string) => [...themeCss.matchAll(new RegExp(`--${prefix}-([a-z0-9-]+):`, "g"))].map((m) => m[1]!);

describe("cn (merging, token-aware) in @/lib/utils", () => {
  it("keeps a text size and a text colour together", () => {
    expect(cn("text-meta text-fg")).toBe("text-meta text-fg");
    expect(cn("text-body-strong text-fg-muted", "text-caption")).toBe("text-fg-muted text-caption");
  });
  it("lets a later colour replace an earlier one, for v2, v3 and v1 names", () => {
    expect(cn("bg-fg bg-points")).toBe("bg-points");
    expect(cn("bg-bg-subtle bg-muted")).toBe("bg-muted");
    expect(cn("border-line border-border")).toBe("border-border");
    expect(cn("bg-brand-hover bg-primary")).toBe("bg-primary");
  });
  it("keeps radii and shadows of different groups, replaces the same group", () => {
    expect(cn("rounded-input rounded-card")).toBe("rounded-card");
    expect(cn("rounded-full rounded-input")).toBe("rounded-input");
    expect(cn("shadow-float shadow-sheet")).toBe("shadow-sheet");
    expect(cn("text-fg shadow-float")).toBe("text-fg shadow-float");
  });
  it("joins like clsx", () => {
    expect(cn("a", false, null, undefined, { b: true, c: false }, ["d"])).toBe("a b d");
  });
  it("lists every colour and text size in theme.css", () => {
    const colours = names("color").filter((n) => !n.startsWith("ll-") && !n.startsWith("vertical-"));
    expect(colours.filter((n) => !(tokenColors as readonly string[]).includes(n)), "colours missing from lib/utils.ts").toEqual([]);
    const sizes = names("text").filter((n) => !n.includes("--"));
    expect(sizes.filter((n) => !(tokenTextSizes as readonly string[]).includes(n)), "text sizes missing from lib/utils.ts").toEqual([]);
  });
});

describe("legacy cn (@/lib/cn) still only joins", () => {
  it("does not resolve conflicts, so existing call sites render as before", () => {
    expect(joinCn("text-meta text-fg", "text-fg-muted", false, "p-4 px-2")).toBe("text-meta text-fg text-fg-muted p-4 px-2");
  });
});
