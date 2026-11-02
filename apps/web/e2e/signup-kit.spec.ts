/**
 * Wave Q (team onboard): the stepped signup on the component kit. Step names under the segments from md, the website read's checklist,
 * "Pick a different colour" (ColorField) on "Is this you?", the NumberStepper and the card colour on "Your loyalty card" (the colour is
 * saved to the new shop), and the next steps as a carousel on "You're live". Screenshots go to $E2E_SHOTS (default
 * e2e/screenshots/signup-kit).
 */
import { expect, test } from "@playwright/test";
import { atStep, cont } from "./signup-flow";

const SHOTS = process.env.E2E_SHOTS ?? "e2e/screenshots/signup-kit";
const shot = (name: string) => `${SHOTS}/${name}.png`;
const FIXTURE_PORT = process.env.E2E_SITE_FIXTURE_PORT ?? "4190";
const rand = () => Math.random().toString(36).slice(2, 8);
const digits = () => `647${String(Math.floor(2000000 + Math.random() * 7999999))}`;

test.setTimeout(180_000);

test.describe("at 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("card step: the stepper takes keys, the colour wears the card and reaches the shop; You're live shows the next steps as cards", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: "I don't have one, skip" }).click();
    const name = `Kit Brows ${rand()}`;
    await page.getByLabel("Shop name").fill(name);
    await cont(page);
    await page.locator("[data-vertical=cafe]").click();
    await expect(page.locator("[data-vertical=cafe]")).toHaveAttribute("aria-checked", "true");
    await cont(page);
    await page.getByLabel("Street address").fill("1880 Danforth Ave");
    await cont(page);
    await atStep(page, "card");
    const goal = page.getByLabel("How many stamps?");
    await expect(goal).toHaveValue("10");
    await goal.focus();
    await page.keyboard.press("ArrowUp");
    await expect(goal).toHaveValue("11");
    await page.getByRole("button", { name: "Fewer" }).click();
    await page.getByRole("button", { name: "Fewer" }).click();
    await expect(goal).toHaveValue("9");
    await expect(page.locator("[data-card-preview]:visible li")).toHaveCount(9);
    // Card colour: the first trade swatch, shown on the preview at once.
    await page.locator("[data-card-colour-open]").click();
    const swatch = page.locator("[data-card-colour] [role=radio]").first();
    const hex = (await swatch.getAttribute("aria-label"))!;
    await swatch.click();
    await expect(swatch).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("[data-card-preview]:visible")).toHaveAttribute("data-shop-color", "brand");
    await page.screenshot({ path: shot("card-colour-390"), fullPage: true });
    await cont(page);
    await atStep(page, "account");
    await expect(page.locator("[data-account-summary]")).toContainText(name);
    await expect(page.locator("[data-account-summary]")).toContainText("9 stamps");
    await page.getByLabel(/Your mobile number/).fill(digits());
    await page.getByLabel("Email").fill(`kit-${rand()}@example.com`);
    await expect(page.locator("[data-pw-ok]")).toHaveCount(0);
    await page.getByLabel("Password", { exact: true }).fill("signup-kit-1");
    await expect(page.locator("[data-pw-ok]")).toHaveCount(1);
    await page.screenshot({ path: shot("account-390"), fullPage: true });
    await cont(page);
    await atStep(page, "live");
    const next = page.locator("[data-live-next]");
    await expect(next.getByRole("link")).toHaveCount(3);
    await expect(next.getByRole("button", { name: "Show card 2" })).toBeVisible();
    const id = (await page.locator("[data-live-primary]").getAttribute("href"))!.split("/")[2]!;
    const detail = await page.evaluate(async (mid) => (await fetch(`/api/ll/v1/merchants/${mid}`)).json(), id);
    expect(detail.merchant.brandColor?.toUpperCase()).toBe(hex.toUpperCase());
    await page.waitForTimeout(1200);
    await page.screenshot({ path: shot("live-390"), fullPage: true });
  });

  test("Is this you?: the site's colours first, then any colour (ColorField); the found extras sit in an open accordion", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("textbox", { name: "Website or Instagram" }).fill(`http://studio-verde.test:${FIXTURE_PORT}/`);
    await page.getByRole("button", { name: "Fill it in for me" }).click();
    await expect(page.locator("[data-import-progress] [data-read-item]")).toHaveCount(4);
    await expect(page.getByRole("heading", { name: "Is this you?" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-import-row=phone]")).toBeVisible();
    await page.locator("[data-import-other-colour-open]").click();
    const field = page.locator("[data-import-other-colour]");
    await field.getByRole("radio").nth(1).click();
    await expect(field.getByRole("radio").nth(1)).toHaveAttribute("aria-checked", "true");
    // The site's own swatch is no longer the pick.
    await expect(page.locator("[data-import-row=brandColor] > [role=radiogroup] [aria-checked=true]")).toHaveCount(0);
    await page.screenshot({ path: shot("is-this-you-390"), fullPage: true });
  });

  test("Urdu: the flow reads right to left with the kit pieces", async ({ page }) => {
    await page.goto("/signup?lang=ur");
    await page.locator("[data-flow-secondary]").click();
    await page.locator("input[name=shopName]").fill("سٹوڈیو");
    await cont(page);
    await page.locator("[data-vertical=salon]").click();
    await cont(page);
    await page.getByRole("textbox").first().fill("88 Ossington Ave");
    await cont(page);
    await atStep(page, "card");
    await expect(page.locator('[dir="rtl"]').first()).toBeAttached();
    await page.screenshot({ path: shot("card-ur-390"), fullPage: true });
  });
});

test.describe("at 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test("step names under the segments", async ({ page }) => {
    await page.goto("/signup");
    const bar = page.locator("[data-flow-bar]");
    for (const label of ["Link", "Name", "Type", "Location", "Card", "Account"]) await expect(bar.getByText(label, { exact: true })).toBeVisible();
    await page.screenshot({ path: shot("link-1440") });
  });
});
