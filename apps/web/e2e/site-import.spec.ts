/**
 * Wave O, team import: signup with a website. The owner pastes their site (a local fixture served by the e2e stack, never the
 * internet), sees the progress state and the review card (every value with its source), confirms, finishes the form and lands
 * in the dashboard; the dashboard and the shop's pass page then show the imported name, logo and colour. Also the Instagram path
 * and Settings, "Refresh from my website". Screenshots go to $E2E_SHOTS (default e2e/screenshots/site-import).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const SHOTS = process.env.E2E_SHOTS ?? "e2e/screenshots/site-import";
const shot = (name: string) => `${SHOTS}/${name}.png`;
const FIXTURE_PORT = process.env.E2E_SITE_FIXTURE_PORT ?? "4190";
const SITE = `http://studio-verde.test:${FIXTURE_PORT}/`;
const rand = () => Math.random().toString(36).slice(2, 8);

test.setTimeout(180_000);

async function importAndReview(page: Page, url: string) {
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Have a website or Instagram?" })).toBeVisible();
  await page.getByRole("textbox", { name: "Website or Instagram" }).fill(url);
  await page.getByRole("button", { name: "Fill it in for me" }).click();
  await expect(page.getByRole("heading", { name: "Here's what we found" })).toBeVisible({ timeout: 30_000 });
}

test.describe("signup with a website, at 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("URL → review → confirm → dashboard and pass show the imported name, logo and colour", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Have a website or Instagram?" })).toBeVisible();
    // The form is still there for anyone who would rather type (existing flow unchanged).
    await expect(page.getByLabel("Shop name")).toBeVisible();
    await page.screenshot({ path: shot("01-step1-390"), fullPage: true });

    await page.getByRole("textbox", { name: "Website or Instagram" }).fill(SITE);
    await page.getByRole("button", { name: "Fill it in for me" }).click();
    await expect(page.getByRole("heading", { name: "Here's what we found" })).toBeVisible({ timeout: 30_000 });
    // While reviewing, the signup form waits underneath.
    await expect(page.getByLabel("Shop name")).toBeHidden();
    const review = page.locator("[data-import-review]");
    await expect(review.locator("[data-import-row=name]")).toContainText("Studio Verde Hair & Colour");
    await expect(review.locator("[data-import-row=name]")).toContainText("From your site's business details");
    await expect(review.locator("[data-import-row=phone]")).toContainText("(647) 555-0188");
    await expect(review.locator("[data-import-row=brandColor]")).toContainText("#0F6E66");
    await expect(review.locator("[data-import-row=brandColor]")).toContainText("From your site's theme colour");
    await expect(review.locator("[data-import-row=logo] img")).toBeVisible();
    await expect(review.locator("[data-import-row=hours]")).toBeVisible();
    await expect(review.locator("[data-import-row=services]")).toContainText("Balayage");
    await page.screenshot({ path: shot("02-review-390"), fullPage: true });

    // Edit one value, take one suggested service, confirm.
    await review.locator("[data-import-row=name]").getByRole("button", { name: /^Edit/ }).click();
    await review.locator("[data-import-row=name]").getByRole("textbox").fill(`Studio Verde ${rand()}`);
    const name = await review.locator("[data-import-row=name]").getByRole("textbox").inputValue();
    await review.locator("[data-import-row=services]").getByText("Balayage").click();
    await page.getByRole("button", { name: "Use these details" }).click();

    await expect(page.locator("[data-import-done]")).toContainText("Filled in from studio-verde.test");
    await expect(page.getByLabel("Shop name")).toHaveValue(name);
    await expect(page.getByRole("radio", { name: "Salon", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Street address")).toHaveValue("88 Ossington Ave, Toronto, ON M6J 2Y7");
    await expect(page.getByLabel(/Your mobile number/)).toHaveValue("(647) 555-0188");
    await page.getByLabel("Email").fill(`import-${rand()}@example.com`);
    await page.getByLabel("Password").fill("site-import-e2e-1");
    await page.screenshot({ path: shot("03-prefilled-390"), fullPage: true });
    await page.getByRole("button", { name: "Create my shop" }).click();

    await page.waitForURL(/\/m\/[^/]+\//, { timeout: 60_000 });
    const id = new URL(page.url()).pathname.split("/")[2]!;
    // The dashboard (desktop shell, where the shop mark sits in the sidebar): the shop's name and the stored logo.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/m/${id}`);
    await expect(page.getByText(name).first()).toBeVisible();
    const logo = page.locator(`img[src*="/v1/public/logos/${id}/"]`).first();
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ path: shot("04-dashboard-1440"), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });

    // The pass page wears the imported colour, logo and name.
    const detail = await page.evaluate(async (mid) => (await fetch(`/api/ll/v1/merchants/${mid}`)).json(), id);
    expect(detail.merchant).toMatchObject({ name, brandColor: "#0F6E66", website: `http://studio-verde.test:${FIXTURE_PORT}/`, instagram: "studioverde.to" });
    expect(detail.merchant.logoUrl).toContain(`/v1/public/logos/${id}/`);
    await page.goto(`/shops/${detail.merchant.slug}`);
    await expect(page.getByRole("heading", { name }).first()).toBeVisible();
    await expect(page.locator(`img[src*="/v1/public/logos/${id}/"]`).first()).toBeVisible();
    const style = await page.locator("[data-shop-color]").first().getAttribute("style");
    expect(style).toContain("--shop-l-trade");
    expect(style?.toUpperCase()).toContain("#0F6E66");
    await page.screenshot({ path: shot("05-pass-390"), fullPage: false });
  });

  test("an Instagram link is not fetched: the handle only, with the note", async ({ page }) => {
    await importAndReview(page, "https://www.instagram.com/priya.nails/");
    await expect(page.getByText("We'll use your handle; add your logo below.")).toBeVisible();
    await expect(page.locator("[data-import-row=instagram]")).toContainText("@priya.nails");
    await page.screenshot({ path: shot("06-instagram-390"), fullPage: true });
  });

  test("Skip, I'll type it: the plain form", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: "Skip, I'll type it" }).click();
    await expect(page.getByRole("heading", { name: "Have a website or Instagram?" })).toHaveCount(0);
    await expect(page.getByLabel("Shop name")).toBeVisible();
  });
});

test.describe("at 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test("the review card on desktop, and in Urdu", async ({ page }) => {
    await importAndReview(page, `http://priya-nails.test:${FIXTURE_PORT}/`);
    await expect(page.getByText(/left your street address out/)).toBeVisible();
    await page.screenshot({ path: shot("07-review-1440"), fullPage: true });
    await page.goto("/signup?lang=ur");
    await page.locator("input[name=siteImportUrl]").fill(`http://bloor-barbers.test:${FIXTURE_PORT}/`);
    await page.getByRole("button", { name: "میرے لیے بھر دیں" }).click();
    await expect(page.getByRole("heading", { name: "ہمیں یہ ملا" })).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: shot("08-review-ur-1440"), fullPage: true });
  });

  test("Settings: Refresh from my website shows a diff to accept per field", async ({ page }) => {
    const email = `refresh-${rand()}@example.com`;
    const password = "site-import-e2e-2";
    const call = async (path: string, body: unknown, token?: string) => {
      const r = await fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
      expect(r.ok, await r.clone().text()).toBe(true);
      return r.json();
    };
    const s = await call("/v1/auth/register", { name: "Owner", email, password });
    const m = await call("/v1/merchants", { name: "Corner Coffee", vertical: "cafe", address: "1880 Danforth Ave", phone: "(416) 555-0100" }, s.accessToken);
    await page.goto(`/login?next=${encodeURIComponent(`/m/${m.merchant.id}/settings`)}`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/settings/);
    const panel = page.locator("[data-site-refresh]");
    await panel.getByLabel(/^Read from/).fill(`http://maple-bean.test:${FIXTURE_PORT}/`);
    await panel.getByRole("button", { name: "Check my website" }).click();
    await expect(panel.locator("[data-diff-row=name]")).toContainText("Maple & Bean Coffee", { timeout: 30_000 });
    await expect(panel.locator("[data-diff-row=name]")).toContainText("Corner Coffee");
    await page.screenshot({ path: shot("09-settings-diff-1440"), fullPage: true });
    await panel.locator("[data-diff-row=brandColor]").getByRole("checkbox").check();
    await panel.locator("[data-diff-row=logo]").getByRole("checkbox").check();
    await panel.getByRole("button", { name: "Update 2 fields" }).click();
    await expect(page.getByText("Updated from your website.")).toBeVisible();
    const after = await page.evaluate(async (mid) => (await fetch(`/api/ll/v1/merchants/${mid}`)).json(), m.merchant.id);
    expect(after.merchant.name).toBe("Corner Coffee");
    expect(after.merchant.brandColor).toBe("#6B4226");
    expect(after.merchant.logoUrl).toContain("/v1/public/logos/");
  });
});
