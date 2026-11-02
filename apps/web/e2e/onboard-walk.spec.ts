/**
 * Wave Q (team onboard): a screenshot walk of the stepped signup at 390 and 1440, both paths (website import and skip), plus Urdu once.
 * Shots go to $WALK_SHOTS (default e2e/screenshots/onboard-walk). Temporary walk; the lasting checks live in signup-kit.spec.ts.
 */
import { expect, test, type Page } from "@playwright/test";
import { atStep, cont } from "./signup-flow";

const DIR = process.env.WALK_SHOTS ?? "e2e/screenshots/onboard-walk";
const FIXTURE_PORT = process.env.E2E_SITE_FIXTURE_PORT ?? "4190";
const SITE = `http://studio-verde.test:${FIXTURE_PORT}/`;
const rand = () => Math.random().toString(36).slice(2, 8);
const digits = () => `647${String(Math.floor(2000000 + Math.random() * 7999999))}`;
test.setTimeout(240_000);

async function walk(page: Page, w: number, lang = "") {
  const s = (n: string) => page.screenshot({ path: `${DIR}/${n}-${lang || "en"}-${w}.png`, fullPage: true });
  await page.goto(`/signup${lang ? `?lang=${lang}` : ""}`);
  await atStep(page, "link");
  await page.waitForTimeout(400);
  await s("01-link");
  await page.locator("input[name=siteImportUrl]").fill(SITE);
  await cont(page);
  await expect(page.locator("[data-import-progress]")).toBeVisible();
  await page.waitForTimeout(900);
  await s("02-reading");
  await atStep(page, "shop");
  await page.waitForTimeout(500);
  await s("03-is-this-you");
  await page.locator("input[name=shopName]").fill(`Studio Verde ${rand()}`);
  await cont(page);
  await atStep(page, "kind");
  await page.waitForTimeout(400);
  await s("04-kind");
  await cont(page);
  await atStep(page, "where");
  await page.waitForTimeout(400);
  await s("05-where");
  await cont(page);
  await atStep(page, "card");
  await page.waitForTimeout(400);
  await s("06-card");
  await cont(page);
  await atStep(page, "account");
  await page.locator("input[type=tel]").first().fill(digits());
  await page.locator("input[name=email]").fill(`walk-${rand()}@example.com`);
  await page.locator("input[name=password]").fill("walk-flow-123");
  await page.waitForTimeout(300);
  await s("07-account");
  await cont(page);
  await atStep(page, "live");
  await page.waitForTimeout(1200);
  await s("08-live");
}

async function skipPath(page: Page, w: number) {
  const s = (n: string) => page.screenshot({ path: `${DIR}/${n}-en-${w}.png`, fullPage: true });
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/signup");
  await page.getByRole("button", { name: "I don't have one, skip" }).click();
  await atStep(page, "shop");
  await page.getByLabel("Shop name").fill("Nails by Amara");
  await page.waitForTimeout(300);
  await s("11-skip-shop");
  await cont(page);
  await page.locator("[data-vertical=nails]").click();
  await page.waitForTimeout(300);
  await s("12-skip-kind-picked");
  await cont(page);
  await page.getByLabel("Postal code").fill("L6Y 4M3");
  await cont(page);
  await atStep(page, "card");
  await page.waitForTimeout(400);
  await s("13-skip-card");
}

test.describe("390", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("walk en", async ({ page }) => {
    await walk(page, 390);
    await skipPath(page, 390);
  });
  test("walk ur", async ({ page }) => {
    await walk(page, 390, "ur");
  });
});

test.describe("1440", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
  test("walk en", async ({ page }) => {
    await walk(page, 1440);
    await skipPath(page, 1440);
  });
});
