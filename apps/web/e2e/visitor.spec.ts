/**
 * Wave P, visitor: the marketing site as a sceptical owner sees it. The home page says what it is, who it is for and what it
 * costs above the fold; /pricing shows one audience at a time; every "Start free" leads to the sign-up entry (/signup); a
 * forgotten password is not a dead end; the 404 and the footer give a way on.
 */
import { expect, test } from "@playwright/test";
import { API } from "./fixtures";

test.describe("home", () => {
  test("at 390, the first screen answers what, who and how much, with one main button", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const fold = async (loc: ReturnType<typeof page.locator>) => (await loc.boundingBox())!.y < 844;
    expect(await fold(page.getByRole("heading", { level: 1 }))).toBe(true);
    await expect(page.locator(".hm-hero-copy .hm-lede")).toContainText(/cafés, salons, shops and studios/);
    expect(await fold(page.getByTestId("hero-price"))).toBe(true);
    await expect(page.getByTestId("hero-price")).toContainText("Loyalty is free forever.");
    await expect(page.getByTestId("hero-price").locator("s")).toHaveText("$290");
    await expect(page.locator("[data-cta=hero]")).toHaveAttribute("href", "/signup");
    // The page is a story, not a wall: well under the 15,600 px it was.
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(13_000);
  });

  test("every start button on the marketing pages goes to the sign-up entry", async ({ page }) => {
    for (const path of ["/", "/pricing", "/for-restaurants", "/for-nail-techs", "/for-barbers", "/for-groomers"]) {
      await page.goto(path);
      const hrefs = await page.locator('main a[href*="signup"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
      expect(hrefs.length, path).toBeGreaterThan(0);
      for (const h of hrefs) expect(h, path).toMatch(/^\/signup(\?|$)/);
    }
  });
});

test.describe("pricing", () => {
  test("one audience at a time, the others one tap away", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("#shops [data-plan=plus] s")).toHaveText("$290");
    await expect(page.locator("#shops [data-plan=plus]")).toContainText("$199");
    await expect(page.locator("#restaurants")).toHaveCount(0);
    await expect(page.locator("#bias")).toHaveCount(0);
    await page.locator("[data-audience=restaurant]").click();
    await expect(page).toHaveURL(/for=restaurant#restaurants/);
    await expect(page.locator("#restaurants")).toBeVisible();
    await expect(page.locator("#shops")).toHaveCount(0);
    await expect(page.locator("[data-audience=shop]")).toHaveAttribute("href", "/pricing?for=shop#shops");
    await page.locator("[data-audience=bia]").click();
    await expect(page.locator("#bias")).toContainText("$1,500");
  });
});

test.describe("sign in", () => {
  test("forgot password: email a code, set a new password, signed in", async ({ page }) => {
    const email = `reset-${Date.now()}@example.com`;
    const reg = await fetch(`${API}/v1/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "first-password-1", name: "Reset Test" }) });
    expect(reg.status).toBe(201);
    await page.goto("/login");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByLabel("New password")).toBeVisible();
    await page.getByRole("button", { name: "Set password and sign in" }).click();
    await expect(page.getByText("Use at least 8 characters for your new password.")).toBeVisible();
    await page.getByLabel("New password").fill("second-password-2");
    await page.getByRole("button", { name: "Set password and sign in" }).click();
    // A brand-new account with no shop lands on the sign-up entry, signed in.
    await expect(page).toHaveURL(/\/signup/);
    const ok = await fetch(`${API}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "second-password-2" }) });
    expect(ok.status).toBe(200);
  });

  test("/login?reset=1 opens on the reset, and Back to sign in returns", async ({ page }) => {
    await page.goto("/login?reset=1");
    await expect(page.getByTestId("password-reset")).toBeVisible();
    await page.getByRole("button", { name: "Back to sign in" }).click();
    await expect(page.getByLabel("Password")).toBeVisible();
  });
});

test.describe("dead ends", () => {
  test("the 404 offers shoppers the map and owners pricing and sign-in", async ({ page }) => {
    const res = await page.goto("/no-such-page-at-all");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("link", { name: "Find shops near you" })).toHaveAttribute("href", "/map");
    const biz = page.getByTestId("not-found-business");
    await expect(biz.getByRole("link", { name: "See pricing" })).toHaveAttribute("href", "/pricing");
    await expect(biz.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  test("the footer reaches every trade page and sign-in, with 44px targets on phones", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/pricing");
    const footer = page.locator("footer").last();
    for (const [name, href] of [["For nail techs", "/for-nail-techs"], ["For barbers", "/for-barbers"], ["For groomers", "/for-groomers"], ["Sign in", "/login"]] as const)
      await expect(footer.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    const h = await footer.getByRole("link", { name: "Pricing", exact: true }).evaluate((e) => e.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(44);
  });
});
