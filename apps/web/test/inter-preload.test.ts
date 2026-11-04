import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INTER_FILE } from "@/lib/fonts/inter";

/**
 * Wave W2: Inter is self-hosted (lib/fonts/inter.ts) and preloaded only by the pages that draw it. The home page draws nothing in Inter
 * (Schibsted and Newsreader), so it must not preload it; every other marketing page and every app layout must, or its text swaps late.
 */
const APP = path.join(__dirname, "../src/app");
const read = (rel: string) => fs.readFileSync(path.join(APP, rel), "utf8");
const pages = (dir: string): string[] =>
  fs.readdirSync(path.join(APP, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? pages(path.join(dir, e.name)) : e.name === "page.tsx" ? [path.join(dir, e.name)] : []));

describe("Inter preload scope", () => {
  it("serves the hashed file from public/fonts", () => {
    expect(fs.existsSync(path.join(__dirname, "../public", INTER_FILE))).toBe(true);
    expect(fs.readFileSync(path.join(__dirname, "../src/lib/fonts/inter.css"), "utf8")).toContain(`url("${INTER_FILE}")`);
  });

  it("keeps Inter out of the root layout's preloads and off the home page", () => {
    const root = read("layout.tsx");
    expect(root).not.toMatch(/\bInter\b[^"]*from "next\/font\/google"|[{,]\s*Inter\s*[,}]/);
    expect(root).not.toContain("preloadInter();");
    expect(read("(marketing)/layout.tsx")).not.toContain("preloadInter();");
    expect(read("(marketing)/page.tsx")).not.toContain("preloadInter();");
  });

  it("preloads it on every other marketing page, the solo pages and the app", () => {
    const want = [
      ...pages("(marketing)").filter((p) => p !== path.join("(marketing)", "page.tsx")),
      "(landing)/layout.tsx",
      "(admin)/admin/layout.tsx",
      "(bia)/bia/layout.tsx",
      "(dashboard)/m/[merchantId]/layout.tsx",
      "(dashboard)/m/page.tsx",
      "(kiosk)/door/[merchantId]/layout.tsx",
      "(onboard)/signup/page.tsx",
      "(pass)/layout.tsx",
      "(rep)/rep/layout.tsx",
      "(site)/layout.tsx",
    ];
    expect(want.length).toBeGreaterThan(20);
    for (const f of want) expect(read(f), f).toContain("preloadInter();");
  });
});
