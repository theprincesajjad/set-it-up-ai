/**
 * Wave Q component kit: the /dev/kit showcase (every library component, en and ur, light and dark, 390 and 1440), and the three places
 * the kit team adopted it as proof: the signup step progress (StepProgress), the "You're live" confetti (celebrate) and the Today tiles
 * rolling their numbers (AnimatedNumber / NumberFlow). Screenshots go to KIT_SHOTS when set (untracked).
 */
import { expect, test, type Page } from "@playwright/test";
import { newPhone } from "./fixtures";
import { signUpThroughFlow } from "./signup-flow";

const OWNER = { email: "owner+pinecone-coffee@example.com", password: "localloyalty-demo" };
// /dev/kit is a 404 in production builds except for a platform admin (or KIT_SHOWCASE=1), so the showcase tests sign in as one.
const ADMIN = { email: "admin@localloyalty.example", password: "localloyalty-admin" };
const shot = async (page: Page, name: string, fullPage = false) => {
  if (process.env.KIT_SHOTS) await page.screenshot({ path: `${process.env.KIT_SHOTS}/${name}.png`, fullPage });
};

async function signIn(page: Page, who = OWNER) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const SECTIONS = ["numbers", "steps", "celebrate", "stepper", "dates", "carousel", "file", "color", "accordion", "timeline", "meter", "marketing", "feed", "existing"];

for (const vp of [
  { name: "390", width: 390, height: 844, phone: true },
  { name: "1440", width: 1440, height: 900, phone: false },
] as const) {
  test.describe(`kit at ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.phone, hasTouch: vp.phone });
    test.beforeEach(async ({ page }) => {
      await signIn(page, ADMIN);
    });

    test("the showcase renders every section, in English and Urdu", async ({ page }) => {
      for (const [lang, query] of [
        ["en", "?lang=en&theme=clear"],
        ["ur", "?lang=ur&theme=clear"],
      ] as const) {
        await page.goto(`/dev/kit${query}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        for (const s of SECTIONS) await expect(page.locator(`[data-kit-section=${s}]`)).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("dir", lang === "ur" ? "rtl" : "ltr");
        await page.waitForTimeout(1500); // number rolls, the lazy carousel, the feed
        await shot(page, `kit-${lang}-${vp.name}`, true);
      }
      await page.goto("/dev/kit?lang=en&theme=clear-dark");
      await expect(page.locator("[data-kit]")).toBeVisible();
      await page.waitForTimeout(1200);
      if (!vp.phone) await shot(page, `kit-en-dark-${vp.name}`, true);
    });

    test("kit components: number roll, stepper keys, 44px targets, calendar in Urdu", async ({ page }) => {
      await page.goto("/dev/kit?lang=en&theme=clear");
      const numbers = page.locator("[data-kit-section=numbers]");
      // The sr-only copy carries the value (the rolling digits are aria-hidden).
      await expect(numbers.locator(".sr-only").filter({ hasText: /^32$/ })).toHaveCount(1);
      await numbers.getByRole("button", { name: "Add a visit" }).click();
      await expect(numbers.locator(".sr-only").filter({ hasText: /^33$/ })).toHaveCount(1);
      // NumberStepper: Base UI spinbutton, step 10, clamps at the max.
      const points = page.getByLabel("How many points?");
      await expect(points).toHaveValue("60");
      await page.locator("[data-kit-section=stepper]").getByRole("button", { name: "Increase" }).first().click();
      await expect(points).toHaveValue("70");
      // 44px hit areas on the kit's controls.
      for (const name of ["Increase", "Decrease"]) {
        const box = await page.locator("[data-kit-section=stepper]").getByRole("button", { name }).first().boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      const day = await page.locator("[data-kit-section=dates] [data-slot=calendar] button[data-day]").first().boundingBox();
      expect(day!.height).toBeGreaterThanOrEqual(44);
      // File drop: a wrong type is refused in plain words.
      const input = page.locator("[data-kit-section=file] input[type=file]").first();
      await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
      await expect(page.locator("[data-kit-section=file]").getByRole("alert").first()).toContainText("won't work here");
      // Urdu: the month is right to left and named in Urdu.
      await page.goto("/dev/kit?lang=ur&theme=clear");
      const cal = page.locator("[data-kit-section=dates] [data-slot=calendar]").first();
      await expect(cal).toHaveAttribute("dir", "rtl");
      await expect(cal).toContainText("نومبر");
    });
  });
}

test.describe("kit adopted: signup progress and the You're live confetti", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test("segments fill step by step and You're live bursts once", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByText("Step 1 of 6")).toBeVisible();
    await page.waitForTimeout(700); // the step's 300 ms rise
    await shot(page, "signup-step1-390");
    if (!process.env.KIT_BEFORE) {
      // KIT_BEFORE=1: only the screenshots, against a build from before the kit (scratchpad before/after shots).
      const bar = page.locator("[data-flow-bar] [data-step-progress]");
      await expect(bar).toHaveAttribute("aria-valuenow", "0");
      await expect(bar.locator("[data-slot=stepper-item]")).toHaveCount(6);
    }
    const stamp = Date.now().toString().slice(-7);
    await signUpThroughFlow(page, { name: `Kit Nails ${stamp}`, vertical: "nails", work: "shop", address: "10 Queen St E", phone: newPhone(), email: `kit+${stamp}@example.com`, password: "kit-password-1", enter: false });
    // canvas-confetti draws on a fixed canvas it adds to <body> (lazy chunk), then removes it.
    if (!process.env.KIT_BEFORE) await expect(page.locator("body > canvas")).toBeAttached({ timeout: 5000 });
    await page.waitForTimeout(250);
    await shot(page, "live-confetti-390");
  });

  test("the segments at 1440", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto("/signup");
    await page.getByRole("button", { name: "I don't have one, skip" }).click();
    await expect(page.getByText("Step 2 of 6")).toBeVisible();
    await page.waitForTimeout(700);
    await shot(page, "signup-step2-1440");
    await expect(page.locator("[data-flow-bar] [data-step-progress] [data-state=completed]")).toHaveCount(1);
    await ctx.close();
  });

  test("no confetti with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const stamp = (Date.now() + 1).toString().slice(-7);
    await signUpThroughFlow(page, { name: `Kit Calm ${stamp}`, vertical: "nails", work: "shop", address: "10 Queen St E", phone: newPhone(), email: `kit-calm+${stamp}@example.com`, password: "kit-password-1", enter: false });
    await page.waitForTimeout(1200);
    await expect(page.locator("body > canvas")).toHaveCount(0);
  });
});

for (const vp of [
  { name: "390", width: 390, height: 844, phone: true },
  { name: "1440", width: 1440, height: 900, phone: false },
] as const) {
  test(`kit adopted: Today tiles roll their numbers (${vp.name})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.phone, hasTouch: vp.phone });
    const page = await ctx.newPage();
    await signIn(page);
    await page.waitForURL(/\/m\/[^/]+/);
    const tiles = page.getByRole("group", { name: "Today's numbers" });
    await expect(tiles).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await shot(page, `today-tiles-${vp.name}`);
    await expect(tiles.locator("number-flow-react").first()).toBeAttached();
    await ctx.close();
  });
}
