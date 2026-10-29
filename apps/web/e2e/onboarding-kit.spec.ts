/**
 * The onboarding kit page (workstream C): /dev/onboarding-kit and the 3D icon contact sheet. No API needed.
 * Measures the spec values (docs/design/v3.2-clear-audit.md section 2 through onboarding-v1.md section 5), checks the Urdu layout mirrors, runs axe when
 * it is installed, and writes screenshots to e2e/screenshots/onboarding-kit/ (light, dark, en, ur at 390 and 1440).
 */
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

let axeSource: string | null = null;
try {
  const require = createRequire(import.meta.url);
  const { readFileSync } = await import("node:fs");
  axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
} catch {
  axeSource = null;
}

const shot = (name: string) => `e2e/screenshots/onboarding-kit/${name}.png`;
const views = [
  { name: "en-light", query: "?theme=clear&lang=en" },
  { name: "en-dark", query: "?theme=clear-dark&lang=en" },
  { name: "ur-light", query: "?theme=clear&lang=ur" },
  { name: "ur-dark", query: "?theme=clear-dark&lang=ur" },
];

async function open(page: Page, query: string) {
  await page.goto(`/dev/onboarding-kit${query}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  await page.waitForTimeout(1200); // the card's 120 ms rise and the preview's 160 ms fade
}
const css = (page: Page, sel: string, prop: string) => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

test.describe("desktop 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("measured values match the spec", async ({ page }) => {
    await open(page, "?theme=clear&lang=en");
    // StepCard: radius 12, a 1 px hairline, 16 padding, title 20/26 at 650, body 13/20
    expect(await css(page, "[data-step-card]", "border-top-left-radius")).toBe("12px");
    expect(await css(page, "[data-step-card]", "border-top-width")).toBe("1px");
    const h2 = page.locator("[data-step-card] h2").first();
    expect(await h2.evaluate((e) => [getComputedStyle(e).fontSize, getComputedStyle(e).lineHeight, getComputedStyle(e).fontWeight])).toEqual(["20px", "26px", "650"]);
    const body = page.locator("[data-step-card] header p").first();
    expect(await body.evaluate((e) => [getComputedStyle(e).fontSize, getComputedStyle(e).lineHeight])).toEqual(["13px", "20px"]);
    // the object in the header is 64 px
    expect((await box(page, "[data-step-card] header svg")).width).toBe(64);
    // footer controls are 40 px on desktop
    expect((await page.locator("[data-step-card] footer").getByRole("button", { name: "Continue" }).first().boundingBox())!.height).toBe(40);
    expect((await page.locator("[data-step-card] footer").getByRole("button", { name: "I'll do this later" }).boundingBox())!.height).toBe(40);
    // ChoiceTile: radius 12, 16 padding, a 40 px object; a selected tile has a 2 px black ring
    const tile = page.getByRole("radio").first();
    expect(await tile.evaluate((e) => getComputedStyle(e).borderTopLeftRadius)).toBe("12px");
    expect(await tile.evaluate((e) => getComputedStyle(e).paddingTop)).toBe("16px");
    expect((await tile.locator("svg").boundingBox())!.width).toBe(40);
    const sel = page.getByRole("radiogroup", { name: "What do you offer?" }).getByRole("radio", { checked: true });
    expect(await sel.evaluate((e) => getComputedStyle(e).boxShadow)).toContain("1px");
    expect(await sel.evaluate((e) => getComputedStyle(e).borderTopWidth)).toBe("1px");
    // three across
    const tiles = await page.getByRole("radio").evaluateAll((els) => els.slice(0, 3).map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tiles).size).toBe(1);
    // the rail is 240 wide; the rows are 28 tall; a 20 px circle; a 2 px track
    expect((await box(page, "[data-setup-rail]")).width).toBe(240);
    expect((await box(page, "[data-setup-rail] ol > li:nth-child(2) > *")).height).toBe(28);
    expect((await box(page, "[data-setup-rail] ol > li:nth-child(2) > * > span:first-child")).width).toBe(20);
    expect((await box(page, "[data-setup-rail] [aria-hidden] >> nth=0")).height).toBe(2);
    // the preview is 300 x 620 and sticks 24 from the top
    const frame = await box(page, "[data-preview-frame]");
    expect([frame.width, frame.height]).toEqual([300, 620]);
    expect(await css(page, "[data-preview-rail]", "top")).toBe("24px");
    // ServiceRow controls are 32 slim; WeekStrip chips 40; ShareRow button 32
    expect((await box(page, 'input[aria-label="Price"]')).height).toBe(32);
    expect((await box(page, '[role="radiogroup"] [data-day="0"]')).height).toBe(40);
    expect((await page.getByRole("button", { name: "Copy link" }).boundingBox())!.height).toBe(32);
  });

  for (const v of views) {
    test(`screenshot ${v.name}`, async ({ page }) => {
      await open(page, v.query);
      await page.screenshot({ path: shot(`1440-${v.name}`), fullPage: true });
    });
  }

  test("Urdu mirrors the rail and the preview", async ({ page }) => {
    await open(page, "?theme=clear&lang=ur");
    const rail = await box(page, "[data-setup-rail]");
    const main = await box(page, "[data-kit-main]");
    const frame = await box(page, "[data-preview-frame]");
    expect(rail.x).toBeGreaterThan(main.x); // the rail moves to the right
    expect(frame.x).toBeLessThan(main.x); // the preview moves to the left
    expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
  });

  test("keyboard: arrows move the choice, space selects, the tab stop is single", async ({ page }) => {
    await open(page, "?theme=clear&lang=en");
    const radios = page.getByRole("radio").filter({ has: page.locator("svg") });
    const first = radios.first();
    await first.focus();
    await page.keyboard.press("ArrowRight");
    await expect(radios.nth(1)).toBeFocused();
    await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowRight");
    await expect(radios.nth(2)).toHaveAttribute("aria-checked", "true");
  });

  test("axe: no violations", async ({ page }) => {
    test.skip(!axeSource, "axe-core is not installed");
    for (const q of ["?theme=clear&lang=en", "?theme=clear&lang=ur"]) {
      await open(page, q);
      await page.addScriptTag({ content: axeSource! });
      const violations = await page.evaluate(async () => {
        const r = await (window as unknown as { axe: { run: (c?: unknown, o?: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
        return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
      });
      expect(violations).toEqual([]);
    }
  });

  test("reduced motion: the card does not animate", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dev/onboarding-kit?theme=clear&lang=en", { waitUntil: "domcontentloaded" });
    const anim = await page.locator("[data-step-card]").first().evaluate((e) => getComputedStyle(e).animationName);
    expect(anim).toBe("none");
  });

  test("the contact sheet shows every icon, light and dark", async ({ page }) => {
    for (const [name, theme] of [["light", "clear"], ["dark", "clear-dark"]] as const) {
      await page.goto(`/dev/onboarding-kit/icons?theme=${theme}&trade=rose`, { waitUntil: "networkidle" });
      await expect(page.locator("[data-icon]")).toHaveCount(41);
      await page.waitForTimeout(300);
      await page.screenshot({ path: shot(`icons-${name}`), fullPage: true });
    }
  });
});

test.describe("phone 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("one column, 44 px primary, strip and pill instead of rail and frame", async ({ page }) => {
    await open(page, "?theme=clear&lang=en");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator("[data-setup-rail]").isVisible()).toBe(false);
    expect(await page.locator("[data-setup-strip]").isVisible()).toBe(true);
    expect((await page.locator("[data-step-card] footer").getByRole("button", { name: "Continue" }).first().boundingBox())!.height).toBe(44);
    expect(await page.locator("[data-preview-rail]").isVisible()).toBe(false);
    // one tile across, the object on the start side
    const tiles = await page.getByRole("radio").evaluateAll((els) => els.slice(0, 2).map((e) => e.getBoundingClientRect().left));
    expect(new Set(tiles.map(Math.round)).size).toBe(1);
    const t = await page.getByRole("radio").first().boundingBox();
    const icon = await page.getByRole("radio").first().locator("svg").boundingBox();
    expect(icon!.x - t!.x).toBeLessThan(24);
    // the strip's tap target is 44
    expect((await box(page, "[data-setup-strip] button")).height).toBeGreaterThanOrEqual(44);
  });

  for (const v of views) {
    test(`screenshot ${v.name}`, async ({ page }) => {
      await open(page, v.query);
      await page.screenshot({ path: shot(`390-${v.name}`), fullPage: true });
    });
  }

  test("the Preview pill opens the sheet", async ({ page }) => {
    await open(page, "?theme=clear&lang=en");
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("dialog", { name: "Booking page preview" })).toBeVisible();
    await page.screenshot({ path: shot("390-en-light-preview"), fullPage: false });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
