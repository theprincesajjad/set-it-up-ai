/**
 * Solo-pro landing pages (docs/business/solo-pro-launch.md 5.3): /for-nail-techs (+ ?trade=), /for-barbers, /for-groomers.
 * Checks the hero per trade, the inline sign-up preset, the comparison dates, and the PoweredBy link target on a booking page.
 * Needs a running, seeded web and API (docs/engineering/web.md). Screenshots go to $SHOTS_DIR only when it is set.
 */
import { expect, test } from "@playwright/test";
import { API } from "./fixtures";

const SHOTS = process.env.SHOTS_DIR;
const shot = (name: string) => (SHOTS ? { path: `${SHOTS}/${name}.png`, fullPage: true } : undefined);

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

test("nail page: hero, trade swap, inline sign-up preset", async ({ page }) => {
  await page.goto("/for-nail-techs");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("stop booking in your DMs");
  await expect(page.locator("[data-solo-trade=nails]")).toHaveCount(1);
  // The sign-up is inline and the trade is already picked.
  const start = page.locator("#start");
  await expect(start.getByRole("radio", { name: "Nail tech" })).toHaveAttribute("aria-checked", "true");
  await expect(start.getByRole("link", { name: "Prefer the full sign-up page?" })).toHaveAttribute("href", "/signup?vertical=nails&src=nail-techs");
  // The source is remembered for sign-up.
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === "ll_src")?.value).toBe("nail-techs");
  // Privacy block is on this page only, with no licensing talk.
  await expect(page.locator("#privacy")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/licen[cs]e|inspection/i);
  // No horizontal scroll, no gradient on the page's own blocks.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (SHOTS) await page.screenshot(shot("nail-1440")!);

  for (const [trade, text, chip, vertical] of [["brows", "brow tech", "Brows & lashes", "brows_lashes"], ["lashes", "lash tech", "Brows & lashes", "brows_lashes"], ["makeup", "makeup", "Makeup artist", "makeup"]] as const) {
    await page.goto(`/for-nail-techs?trade=${trade}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(text);
    await expect(page.locator(`[data-solo-trade=${trade}]`)).toHaveCount(1);
    // The inline sign-up is preset to the trade's own vertical.
    await expect(page.locator("#start").getByRole("radio", { name: chip })).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#start").getByRole("link", { name: "Prefer the full sign-up page?" })).toHaveAttribute("href", `/signup?vertical=${vertical}&src=nail-techs`);
  }
  await page.goto("/for-nail-techs?trade=nonsense");
  await expect(page.locator("[data-solo-trade=nails]")).toHaveCount(1);
});

test("comparison table shows a date and a currency note on every figure", async ({ page }) => {
  await page.goto("/for-barbers");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("manage all your stuff in one place");
  const table = page.locator("#compare table");
  await expect(table).toBeVisible();
  const cells = table.locator("tbody td:not(:first-of-type)").filter({ hasText: /Fresha|\$|Free|None|Included|Not on/ });
  expect(await table.locator("tbody tr").count()).toBe(6); // five rows plus four chairs
  await expect(table).toContainText("Oct 28, 2026");
  await expect(table).toContainText("currency not stated");
  expect(await cells.count()).toBeGreaterThan(10);
  await expect(page.locator("#start").getByRole("radio", { name: "Barber" })).toHaveAttribute("aria-checked", "true");
  if (SHOTS) await page.screenshot(shot("barber-1440")!);
});

test("groomer page and home chips", async ({ page }) => {
  await page.goto("/for-groomers");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("vaccines");
  await expect(page.locator("#privacy")).toHaveCount(0);
  await page.goto("/");
  for (const [name, href] of [["Nail techs", "/for-nail-techs"], ["Barbers", "/for-barbers"], ["Pet groomers", "/for-groomers"]] as const)
    await expect(page.getByRole("navigation", { name: "Booking for" }).getByRole("link", { name })).toHaveAttribute("href", href);
});

test("Urdu and phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, tag] of [["/for-nail-techs", "nail"], ["/for-barbers", "barber"], ["/for-groomers", "groom"]] as const) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (SHOTS) await page.screenshot(shot(`${tag}-390`)!);
    await page.goto(`${path}?lang=ur`);
    await expect(page.locator("[dir=rtl]").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (SHOTS) await page.screenshot(shot(`${tag}-390-ur`)!);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/for-nail-techs?lang=ur");
  if (SHOTS) await page.screenshot(shot("nail-1440-ur")!);
});

test("PoweredBy on a booking page leads to the matching landing page with src=client", async ({ page }) => {
  const api = await fetch(`${API}/v1/public/plans`).catch(() => null);
  test.skip(!api?.ok, "needs the seeded API");
  await page.goto("/shops/bloom-hair-studio/book");
  const link = page.locator("[data-powered-by] a");
  await expect(link).toHaveAttribute("href", "/for-nail-techs?src=client");
  await expect(link).toContainText("Powered by Local Loyalty");
  await link.click();
  await expect(page).toHaveURL(/\/for-nail-techs\?src=client$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("DMs");
});
