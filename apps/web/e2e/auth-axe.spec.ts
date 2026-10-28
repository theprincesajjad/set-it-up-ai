import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

/** axe on the auth pages. Needs `axe-core` (devDependency of @ll/web); skipped when it is not installed. */
let axeSource: string | null = null;
try {
  const require = createRequire(import.meta.url);
  const { readFileSync } = await import("node:fs");
  axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
} catch {
  axeSource = null;
}

for (const path of ["/login", "/signup"]) {
  test(`axe: ${path} has no violations`, async ({ page }) => {
    test.skip(!axeSource, "axe-core is not installed");
    await page.goto(path);
    await page.addScriptTag({ content: axeSource! });
    const violations = await page.evaluate(async () => {
      const r = await (window as unknown as { axe: { run: (c?: unknown, o?: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
      return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    });
    expect(violations).toEqual([]);
  });
}
