/**
 * phase-pro P1 (was phase-solo A): the pricing page's three plans (Free, Pro, Studio, with Service as a line), the first-year price
 * shown only as a struck-through number, the trial line, and the billing page with the trial banner for a shop on its trial,
 * at 390 and 1440, in Clear light and in Urdu. Screenshots go to PRO_SHOTS (default: e2e/screenshots/pro-p1, not tracked).
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
/** axe (wcag2a, wcag2aa) inside one selector. */
async function axe(page: Page, selector: string): Promise<string[]> {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async (sel) => {
    const r = await (window as unknown as { axe: { run: (c?: unknown, o?: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(sel, { runOnly: ["wcag2a", "wcag2aa"] });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  }, selector);
}

const DIR = process.env.PRO_SHOTS ?? "e2e/screenshots/pro-p1";
const shot = (name: string) => `${DIR}/${name}.png`;
const PASSWORD = "localloyalty-e2e-trial";

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

/** A new nail tech on her 14-day Pro trial (registered and started through the API, no card). */
async function trialShop(): Promise<{ email: string; id: string }> {
  const email = `trial+${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
  const { accessToken } = await call<{ accessToken: string }>("POST", "/v1/auth/register", { email, password: PASSWORD, name: "Maya Lin" });
  const made = await call<{ merchant: { id: string } }>("POST", "/v1/merchants", { name: "Maya Nails", vertical: "nails", address: "10 Roncesvalles Ave", phone: "(416) 555-0142" }, accessToken);
  await call("POST", `/v1/merchants/${made.merchant.id}/billing/trial`, {}, accessToken);
  return { email, id: made.merchant.id };
}

async function signIn(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const SIZES = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
] as const;

test.describe("pricing: Free, Pro, Studio", () => {
  for (const { w, h } of SIZES) {
    test(`three cards, the first-year price struck through, the trial line, the tables at ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto("/pricing?theme=clear");
      const shops = page.locator("#shops");
      await expect(shops.locator("[data-plan]")).toHaveCount(4); // Free, Pro, Studio and the Service line
      await expect(shops.locator("[data-plan=free]")).toContainText("$0");
      const pro = shops.locator("[data-plan=plus]");
      await expect(pro).toContainText("$29");
      await expect(pro.getByTestId("first-year-price")).toContainText("$199");
      await expect(pro.getByTestId("first-year-price")).toContainText("first year");
      await expect(pro.getByTestId("first-year-price").locator("s")).toHaveText("$290");
      await expect(pro.getByTestId("trial-line")).toHaveText("14 days of Pro free, no card.");
      await expect(shops.locator("[data-plan=studio]")).toContainText("$59");
      await expect(shops.locator("[data-plan=studio]")).toContainText("or $590 a year");
      await expect(shops.locator("[data-plan=pro]")).toContainText("$99");
      await expect(shops).toContainText("Prices in CAD");
      expect((await page.locator("main").innerText()).toLowerCase()).not.toContain("founding pro");
      await expect(page.getByRole("table", { name: "Compare Free, Pro and Studio" })).toBeVisible();
      await expect(page.getByTestId("solo-table")).toContainText("30 a month, then email");
      await expect(page.getByTestId("solo-compare")).toContainText("Fresha");
      await expect(page.getByTestId("solo-compare")).toContainText("Oct 29, 2026");
      // No horizontal page scroll at phone width.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: shot(`pricing-${w}`), fullPage: true });
      await page.goto("/pricing?theme=clear&compare=1#compare");
      await expect(page.getByTestId("compare")).toContainText("Fills your book");
      await expect(page.getByTestId("compare")).toContainText("For shops");
      await page.goto("/pricing?theme=clear&lang=ur");
      await page.screenshot({ path: shot(`pricing-${w}-ur`), fullPage: true });
    });
  }

  test("is axe-clean", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/pricing?theme=clear");
    expect(await axe(page, "#shops")).toEqual([]);
  });
});

test.describe("billing on the trial", () => {
  for (const { w, h } of SIZES) {
    test(`the trial banner, Studio and the first-year price at ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const shop = await trialShop();
      const base = `/m/${shop.id}`;
      await signIn(page, shop.email, `${base}/billing`);
      await page.goto(`${base}/billing?theme=clear`);
      const banner = page.getByTestId("trial-banner");
      await expect(banner).toHaveAttribute("data-moment", "live");
      await expect(banner).toContainText("Pro ends");
      await expect(banner).toContainText("14 days left");
      await expect(page.getByTestId("keep-monthly")).toContainText("$29 a month");
      await expect(page.getByTestId("keep-yearly").locator("s")).toHaveText("$290");
      await expect(page.getByTestId("keep-yearly")).toContainText("$199");
      await expect(page.getByTestId("plan-usage")).toContainText("of 2");
      await expect(page.getByTestId("billing-plans").locator("[data-plan=studio]")).toContainText("$59");
      await page.screenshot({ path: shot(`billing-${w}`), fullPage: true });
      await page.getByRole("radio", { name: "Pay yearly: 2 months free" }).first().click();
      await expect(page.getByTestId("billing-plans").locator("[data-plan=plus] s")).toHaveText("$290");
      await page.goto(`${base}/billing?theme=clear&plan=studio`);
      await expect(page.getByTestId("billing-plans").locator("[data-plan=studio]")).toContainText("Picked for you");
      await page.screenshot({ path: shot(`billing-${w}-studio`), fullPage: true });
      await page.goto(`${base}/billing?theme=clear&lang=ur`);
      await expect(page.getByTestId("trial-banner")).toBeVisible();
      await page.screenshot({ path: shot(`billing-${w}-ur`), fullPage: true });
      expect(await axe(page, "main")).toEqual([]);
    });
  }
});
